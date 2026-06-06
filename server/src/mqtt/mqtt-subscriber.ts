import mqtt, { type MqttClient } from "mqtt";
import { config } from "../config.js";
import { unifiedToTislyEvent } from "../event/unified-event.js";
import { recordHeartbeat } from "../notification/heartbeat-monitor.js";
import { handleEspMqttHeartbeat } from "../device/esp-heartbeat-mqtt.js";
import { ingestDeviceSignal } from "../device/device-adapter.js";
import { getNotificationService } from "../notification/notification-service.js";
import { broadcast } from "../ws/hub.js";
import { getMqttSubscriberConfig } from "./mqtt-config.js";
import { buildMqttConnectOptions, mqttUrlWithTls, getMqttTlsStatus } from "./mqtt-tls.js";
import { buildDemoLegacyHeartbeatTopic } from "./esp-topic-standard.js";
import { mqttPayloadToUnified, parseMqttTopic } from "./topic-router.js";
import { broadcastSalesDemoEvent } from "../demo-kit/sales-ws-bridge.js";
import {
  isMqttMockMode,
  mqttBridgeLog,
  onMqttBridgeAuthError,
  onMqttBridgeConnect,
  onMqttBridgeDisconnect,
  onMqttBridgeInvalidTopic,
  recordMqttMessageReceived,
  routeMqttToLivePush,
} from "../toms/mqtt-live-push-bridge.js";

let client: MqttClient | null = null;
let mockTimer: ReturnType<typeof setInterval> | null = null;

export function startMqttSubscriber(): void {
  const cfg = getMqttSubscriberConfig();
  if (!cfg.enabled) {
    console.log("[MQTT] subscriber disabled (set MQTT_SUBSCRIBER_ENABLED=true)");
    return;
  }

  if (cfg.mockMode) {
    startMockSubscriber();
    return;
  }

  const connectUrl = mqttUrlWithTls(cfg.url, cfg.mockMode);
  const connectOpts = buildMqttConnectOptions(
    {
      clientId: cfg.clientId,
      username: cfg.username,
      password: cfg.password,
    },
    cfg.mockMode
  );
  const tlsStatus = getMqttTlsStatus(cfg.mockMode);
  if (tlsStatus.ready) {
    console.log("[MQTT] connecting with TLS client certificates");
  }
  const wildcardTopic = `${cfg.topicPrefix}/#`;
  client = mqtt.connect(connectUrl, { ...connectOpts, reconnectPeriod: 5000 });

  const subscribeAll = () => {
    client?.subscribe(wildcardTopic, (err) => {
      if (err) {
        console.error("[MQTT] subscribe error", err);
        onMqttBridgeAuthError(err.message);
      } else {
        console.log(`[MQTT] subscribed ${wildcardTopic}`);
      }
    });
    client?.subscribe("tisly/project/#", (err) => {
      if (err) onMqttBridgeAuthError(`project subscribe: ${err.message}`);
    });
  };

  client.on("connect", () => {
    console.log(`[MQTT] connected ${cfg.url}`);
    onMqttBridgeConnect(cfg.url);
    subscribeAll();
  });

  client.on("reconnect", () => {
    console.log("[MQTT] reconnecting…");
    mqttBridgeLog("warn", "RECONNECTING", "broker reconnect in progress");
  });

  client.on("message", (topic, buf) => {
    void handleMessage(topic, buf.toString("utf-8"));
  });

  client.on("error", (err) => {
    console.error("[MQTT] error", err.message);
    if (/auth|not authorized|connack/i.test(err.message)) {
      onMqttBridgeAuthError(err.message);
    }
  });

  client.on("close", () => {
    onMqttBridgeDisconnect("mqtt client closed");
  });

  client.on("offline", () => {
    onMqttBridgeDisconnect("mqtt offline");
  });
}

export function stopMqttSubscriber(): void {
  if (mockTimer) {
    clearInterval(mockTimer);
    mockTimer = null;
  }
  if (client) {
    client.end(true);
    client = null;
  }
}

async function handleMessage(topic: string, raw: string): Promise<void> {
  recordMqttMessageReceived(topic);
  if (routeMqttToLivePush(topic, raw)) return;

  const parsed = parseMqttTopic(topic);
  if (!parsed) {
    onMqttBridgeInvalidTopic(topic);
    return;
  }

  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    body = { message: raw };
  }

  if (parsed.channel === "heartbeat") {
    recordHeartbeat(parsed.deviceId, (body.platform as string) ?? "mqtt");
    handleEspMqttHeartbeat(parsed.deviceId, {
      platform: (body.platform as string) ?? "mqtt",
      rssi: body.rssi as number | undefined,
      uptime: body.uptime as number | undefined,
    });
    ingestDeviceSignal(parsed.deviceId, (body.platform as string) ?? "mqtt", body);
    broadcast({
      type: "heartbeat",
      payload: { deviceId: parsed.deviceId, ...body },
      at: new Date().toISOString(),
    });
    broadcastSalesDemoEvent("status", { deviceId: parsed.deviceId, heartbeat: true });
    return;
  }

  const unified = mqttPayloadToUnified(parsed, body);
  if (!unified) return;

  const service = getNotificationService();
  const id = await service.processEvent(unifiedToTislyEvent(unified));
  const wsType = unified.severity === "alarm" ? "alarm" : "event";
  broadcast({
    type: wsType,
    payload: { ...unified, id },
    at: unified.created_at,
  });
}

function startMockSubscriber(): void {
  console.log(`[MQTT] mock subscriber active (MQTT_MOCK_MODE=${isMqttMockMode()})`);
  onMqttBridgeConnect(config.mqtt.url || "mqtt://mqtt.tisly.jp:1883");
  mockTimer = setInterval(() => {
    const tenant = config.defaultTenantId;
    const topic = buildDemoLegacyHeartbeatTopic(tenant);
    void handleMessage(
      topic,
      JSON.stringify({ status: "ok", platform: "mock", ts: Date.now() })
    );
  }, 120_000);
}
