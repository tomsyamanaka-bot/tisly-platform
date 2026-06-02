import mqtt, { type MqttClient } from "mqtt";
import { config } from "../config.js";
import { unifiedToTislyEvent } from "../event/unified-event.js";
import { recordHeartbeat } from "../notification/heartbeat-monitor.js";
import { getNotificationService } from "../notification/notification-service.js";
import { broadcast } from "../ws/hub.js";
import { getMqttSubscriberConfig } from "./mqtt-config.js";
import { mqttPayloadToUnified, parseMqttTopic } from "./topic-router.js";

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

  client = mqtt.connect(cfg.url, {
    clientId: cfg.clientId,
    username: cfg.username || undefined,
    password: cfg.password || undefined,
    reconnectPeriod: 5000,
  });

  client.on("connect", () => {
    console.log(`[MQTT] connected ${cfg.url}`);
    client?.subscribe(cfg.topicPrefix, (err) => {
      if (err) console.error("[MQTT] subscribe error", err);
    });
  });

  client.on("message", (topic, buf) => {
    void handleMessage(topic, buf.toString("utf-8"));
  });

  client.on("error", (err) => {
    console.error("[MQTT] error", err.message);
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
  const parsed = parseMqttTopic(topic);
  if (!parsed) return;

  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    body = { message: raw };
  }

  if (parsed.channel === "heartbeat") {
    recordHeartbeat(parsed.deviceId, (body.platform as string) ?? "mqtt");
    broadcast({
      type: "heartbeat",
      payload: { deviceId: parsed.deviceId, ...body },
      at: new Date().toISOString(),
    });
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
  console.log("[MQTT] mock subscriber active (local/demo)");
  mockTimer = setInterval(() => {
    const tenant = config.defaultTenantId;
    const topic = `tisly/${tenant}/demo-test-site/MOCK-MQTT-001/heartbeat`;
    void handleMessage(
      topic,
      JSON.stringify({ status: "ok", platform: "mock", ts: Date.now() })
    );
  }, 120_000);
}
