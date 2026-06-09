import { broadcast, broadcastFromMqtt } from "../ws/hub.js";
import { pushFloorAlertLive, pushProjectDevicesLive, pushProjectNotificationsLive, pushProjectTimelineLive, } from "./live-push-bridge.js";
import { listProjectLiveDevices } from "./realtime-devices.js";
import { listProjectNotifications } from "./project-notifications.js";
import { getMqttTlsStatus } from "../mqtt/mqtt-tls.js";
const LOG_RING_MAX = 200;
const logRing = [];
let mqttBridgeConnected = false;
let mqttBridgeBrokerUrl = "";
let mqttMessageCount = 0;
let mqttLastReceivedAt = null;
let mqttLastReceivedTopic = null;
const mqttReceivedTopics = new Set();
export function recordMqttMessageReceived(topic) {
    mqttMessageCount += 1;
    mqttReceivedTopics.add(topic);
    mqttLastReceivedAt = new Date().toISOString();
    mqttLastReceivedTopic = topic;
}
export function getMqttBridgeStats() {
    let brokerHost = "mqtt.tisly.jp";
    try {
        const u = new URL(mqttBridgeBrokerUrl.replace(/^mqtts?:\/\//, "http://"));
        brokerHost = u.hostname || brokerHost;
    }
    catch {
        /* keep default */
    }
    return {
        connected: mqttBridgeConnected,
        brokerHost,
        brokerUrl: mqttBridgeBrokerUrl,
        mode: isMqttMockMode() ? "mock" : "real",
        messageCount: mqttMessageCount,
        topicCount: mqttReceivedTopics.size,
        lastReceivedAt: mqttLastReceivedAt,
        lastReceivedTopic: mqttLastReceivedTopic,
    };
}
/** Phase 2251–2300 — MQTT_MODE を単一の真実源に */
export function isMqttMockMode() {
    const mode = (process.env.MQTT_MODE ?? "").toLowerCase();
    if (mode === "real")
        return false;
    if (mode === "mock")
        return true;
    return process.env.MQTT_MOCK_MODE !== "false";
}
export function isLiveOpsMockPushEnabled() {
    if (process.env.LIVE_OPS_MOCK_PUSH === "false")
        return false;
    if (process.env.LIVE_OPS_MOCK_PUSH === "true")
        return true;
    return isMqttMockMode();
}
export function mqttBridgeLog(level, code, message, topic) {
    const entry = {
        at: new Date().toISOString(),
        level,
        code,
        message,
        topic,
    };
    logRing.push(entry);
    if (logRing.length > LOG_RING_MAX)
        logRing.shift();
    const prefix = `[MQTT-Bridge/${code}]`;
    if (level === "error")
        console.error(prefix, message, topic ?? "");
    else if (level === "warn")
        console.warn(prefix, message, topic ?? "");
    else
        console.log(prefix, message, topic ?? "");
}
export function listMqttBridgeLogs(limit = 50) {
    return logRing.slice(-limit);
}
export function getMqttBridgeCertStatus() {
    return getMqttTlsStatus(isMqttMockMode());
}
const PROJECT_TOPIC_RE = /^tisly\/project\/([^/]+)\/(devices|notifications|timeline|floor_alert)$/;
export function routeMqttToLivePush(topic, raw) {
    const m = topic.match(PROJECT_TOPIC_RE);
    if (!m) {
        broadcastFromMqtt(topic, raw);
        return false;
    }
    const projectId = m[1];
    const channel = m[2];
    let body = {};
    try {
        body = JSON.parse(raw);
    }
    catch {
        mqttBridgeLog("warn", "INVALID_PAYLOAD", "JSON parse failed — forwarding as text", topic);
        body = { message: raw };
    }
    switch (channel) {
        case "devices": {
            const devices = body.devices ?? listProjectLiveDevices(projectId);
            pushProjectDevicesLive(projectId, devices, {
                scrollTier: body.scrollTier,
                severity: body.severity ?? "info",
            });
            break;
        }
        case "notifications": {
            const notifications = body.notifications ??
                listProjectNotifications(projectId).filter((n) => !n.acknowledged);
            pushProjectNotificationsLive(projectId, notifications);
            break;
        }
        case "timeline":
            if (body.entry)
                pushProjectTimelineLive(projectId, body.entry);
            break;
        case "floor_alert":
            pushFloorAlertLive(projectId, String(body.tier ?? "perimeter"), body.severity ?? "warning");
            break;
        default:
            mqttBridgeLog("warn", "INVALID_TOPIC", "unknown project channel", topic);
            return false;
    }
    return true;
}
export function onMqttBridgeConnect(url) {
    mqttBridgeConnected = true;
    mqttBridgeBrokerUrl = url;
    mqttBridgeLog("info", "CONNECTED", `MQTT connected ${url}`);
}
export function onMqttBridgeDisconnect(reason) {
    mqttBridgeConnected = false;
    mqttBridgeLog("error", "DISCONNECTED", reason ?? "connection closed");
    broadcast({
        type: "event",
        topic: "toms/mqtt/status",
        payload: { status: "disconnected", reason },
        at: new Date().toISOString(),
    });
}
export function onMqttBridgeAuthError(message) {
    mqttBridgeLog("error", "AUTH_FAILED", message);
}
export function onMqttBridgeInvalidTopic(topic) {
    mqttBridgeLog("warn", "INVALID_TOPIC", "topic does not match TiSLY schema", topic);
}
