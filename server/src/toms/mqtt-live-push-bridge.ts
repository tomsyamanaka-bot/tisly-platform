import { broadcast, broadcastFromMqtt } from "../ws/hub.js";
import {
  pushFloorAlertLive,
  pushProjectDevicesLive,
  pushProjectNotificationsLive,
  pushProjectTimelineLive,
  type LivePushChannel,
} from "./live-push-bridge.js";
import { listProjectLiveDevices } from "./realtime-devices.js";
import { listProjectNotifications } from "./project-notifications.js";
import { getMqttTlsStatus } from "../mqtt/mqtt-tls.js";

export type MqttBridgeLogLevel = "info" | "warn" | "error";

export interface MqttBridgeLogEntry {
  at: string;
  level: MqttBridgeLogLevel;
  code: string;
  message: string;
  topic?: string;
}

const LOG_RING_MAX = 200;
const logRing: MqttBridgeLogEntry[] = [];

export function isMqttMockMode(): boolean {
  return process.env.MQTT_MOCK_MODE !== "false";
}

export function isLiveOpsMockPushEnabled(): boolean {
  if (process.env.LIVE_OPS_MOCK_PUSH === "false") return false;
  if (process.env.LIVE_OPS_MOCK_PUSH === "true") return true;
  return isMqttMockMode();
}

export function mqttBridgeLog(
  level: MqttBridgeLogLevel,
  code: string,
  message: string,
  topic?: string
): void {
  const entry: MqttBridgeLogEntry = {
    at: new Date().toISOString(),
    level,
    code,
    message,
    topic,
  };
  logRing.push(entry);
  if (logRing.length > LOG_RING_MAX) logRing.shift();
  const prefix = `[MQTT-Bridge/${code}]`;
  if (level === "error") console.error(prefix, message, topic ?? "");
  else if (level === "warn") console.warn(prefix, message, topic ?? "");
  else console.log(prefix, message, topic ?? "");
}

export function listMqttBridgeLogs(limit = 50): MqttBridgeLogEntry[] {
  return logRing.slice(-limit);
}

export function getMqttBridgeCertStatus() {
  return getMqttTlsStatus(isMqttMockMode());
}

const PROJECT_TOPIC_RE =
  /^tisly\/project\/([^/]+)\/(devices|notifications|timeline|floor_alert)$/;

export function routeMqttToLivePush(topic: string, raw: string): boolean {
  const m = topic.match(PROJECT_TOPIC_RE);
  if (!m) {
    broadcastFromMqtt(topic, raw);
    return false;
  }

  const projectId = m[1];
  const channel = m[2] as LivePushChannel;
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    mqttBridgeLog("warn", "INVALID_PAYLOAD", "JSON parse failed — forwarding as text", topic);
    body = { message: raw };
  }

  switch (channel) {
    case "devices": {
      const devices = (body.devices as unknown[]) ?? listProjectLiveDevices(projectId);
      pushProjectDevicesLive(projectId, devices, {
        scrollTier: body.scrollTier as string | undefined,
        severity: (body.severity as "info" | "warning" | "critical") ?? "info",
      });
      break;
    }
    case "notifications": {
      const notifications =
        (body.notifications as unknown[]) ??
        listProjectNotifications(projectId).filter((n) => !n.acknowledged);
      pushProjectNotificationsLive(projectId, notifications);
      break;
    }
    case "timeline":
      if (body.entry) pushProjectTimelineLive(projectId, body.entry as Record<string, unknown>);
      break;
    case "floor_alert":
      pushFloorAlertLive(
        projectId,
        String(body.tier ?? "perimeter"),
        (body.severity as "warning" | "critical") ?? "warning"
      );
      break;
    default:
      mqttBridgeLog("warn", "INVALID_TOPIC", "unknown project channel", topic);
      return false;
  }
  return true;
}

export function onMqttBridgeConnect(url: string): void {
  mqttBridgeLog("info", "CONNECTED", `MQTT connected ${url}`);
}

export function onMqttBridgeDisconnect(reason?: string): void {
  mqttBridgeLog("error", "DISCONNECTED", reason ?? "connection closed");
  broadcast({
    type: "event",
    topic: "toms/mqtt/status",
    payload: { status: "disconnected", reason },
    at: new Date().toISOString(),
  });
}

export function onMqttBridgeAuthError(message: string): void {
  mqttBridgeLog("error", "AUTH_FAILED", message);
}

export function onMqttBridgeInvalidTopic(topic: string): void {
  mqttBridgeLog("warn", "INVALID_TOPIC", "topic does not match TiSLY schema", topic);
}
