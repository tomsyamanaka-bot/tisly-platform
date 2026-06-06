import { v4 as uuid } from "uuid";
import mqtt from "mqtt";
import { config } from "../config.js";
import { getDatabase, getPlatformSetting } from "../db/database.js";
import { sendDiscord } from "./channels/discord.js";
import { sendEmail, queueFailedDelivery } from "./channels/email.js";
import { configureWebPush, sendWebPush } from "./channels/web-push.js";
import { persistEvent, parseMqttPayload, shouldNotify } from "./event-processor.js";
import { processEventAnalytics } from "../analytics/analytics-engine.js";
import {
  applyAiPriorityToEvent,
  handleEventRecovery,
} from "../recovery/recovery-engine.js";
import { broadcastFromMqtt } from "../ws/hub.js";
import { recordHeartbeat, startHeartbeatMonitor } from "./heartbeat-monitor.js";
import { startDeviceHeartbeatMonitor } from "../device/device-heartbeat.js";
import type {
  DeliveryResult,
  NotificationChannel,
  NotificationPayload,
  TislyEvent,
} from "./types.js";

interface ChannelFlags {
  push?: boolean;
  discord?: boolean;
  email?: boolean;
}

export class NotificationService {
  private mqttClient: mqtt.MqttClient | null = null;

  start(): void {
    configureWebPush();
    this.connectMqtt();
    startHeartbeatMonitor(this);
    startDeviceHeartbeatMonitor((change) => {
      if (change.status === "OFFLINE" || change.status === "WARNING") {
        void this.processEvent({
          deviceId: change.deviceId,
          eventType: change.status === "OFFLINE" ? "heartbeat_alarm" : "heartbeat_warning",
          title:
            change.status === "OFFLINE"
              ? `通信断 — ${change.deviceId}`
              : `通信遅延 — ${change.deviceId}`,
          body: `Device status: ${change.status}`,
          severity: change.status === "OFFLINE" ? "alarm" : "warning",
        });
      }
    });
    console.log("[TiSLY Notification] Service started");
  }

  stop(): void {
    this.mqttClient?.end();
  }

  private connectMqtt(): void {
    // Phase 2251–2300 — mqtt-subscriber に一本化（二重購読防止）
    const subEnabled =
      process.env.MQTT_SUBSCRIBER_ENABLED === "true" || process.env.MQTT_MODE === "real";
    if (subEnabled) {
      console.log("[MQTT] notification-service: subscriber handles MQTT — skip duplicate connect");
      return;
    }
    if (!config.mqtt.url) return;
    const opts: mqtt.IClientOptions = {
      clientId: config.mqtt.clientId,
      reconnectPeriod: 5000,
    };
    if (config.mqtt.username) {
      opts.username = config.mqtt.username;
      opts.password = config.mqtt.password;
    }
    this.mqttClient = mqtt.connect(config.mqtt.url, opts);

    this.mqttClient.on("connect", () => {
      console.log("[MQTT] Connected:", config.mqtt.url);
      this.mqttClient?.subscribe(config.mqtt.topicPrefix, (err) => {
        if (err) console.error("[MQTT] Subscribe error:", err);
        else console.log("[MQTT] Subscribed:", config.mqtt.topicPrefix);
      });
    });

    this.mqttClient.on("message", (topic, buf) => {
      const raw = buf.toString();
      broadcastFromMqtt(topic, raw);
      const parsed = parseMqttPayload(topic, raw);
      if (!parsed) return;
      if (parsed.eventType === "heartbeat") {
        recordHeartbeat(parsed.deviceId, parsed.payload?.platform as string);
        return;
      }
      void this.processEvent(parsed);
    });

    this.mqttClient.on("error", (err) => console.error("[MQTT]", err.message));
  }

  async processEvent(event: TislyEvent, channels?: ChannelFlags): Promise<string> {
    const analytics = processEventAnalytics(event);
    const enriched = applyAiPriorityToEvent(event, analytics.priority);
    enriched.severity = analytics.priority;
    const id = persistEvent(enriched);
    enriched.id = id;
    void handleEventRecovery(enriched, {
      riskScore: analytics.riskScore,
      priority: analytics.priority,
    });

    if (!shouldNotify(enriched.eventType)) {
      return id;
    }

    const priorityLabel =
      analytics.priority === "critical"
        ? "【重大】"
        : analytics.priority === "alarm"
          ? "【警報】"
          : analytics.priority === "warning"
            ? "【注意】"
            : "";
    const payload: NotificationPayload = {
      title: `${priorityLabel}${enriched.title}`,
      body: `${enriched.body ?? ""} (Risk: ${analytics.riskScore})`.trim(),
      eventType: enriched.eventType,
      deviceId: enriched.deviceId,
      url: `${config.publicUrl}/app/notifications`,
      data: { ...enriched.payload, aiPriority: analytics.priority, riskScore: analytics.riskScore },
    };

    const flags = channels ?? this.getEnabledChannels();
    const results: DeliveryResult[] = [];

    if (flags.push) results.push(await sendWebPush(payload));
    if (flags.discord) results.push(await sendDiscord(payload));
    if (flags.email) results.push(await sendEmail(payload));

    for (const r of results) {
      this.logDelivery(enriched, payload, r);
    }

    return id;
  }

  private getEnabledChannels(): ChannelFlags {
    const push = getPlatformSetting<{ enabled: boolean }>("push");
    const discord = getPlatformSetting<{ enabled: boolean }>("discord");
    const email = getPlatformSetting<{ enabled: boolean }>("email");
    return {
      push: push?.enabled ?? false,
      discord: discord?.enabled ?? false,
      email: email?.enabled ?? false,
    };
  }

  private logDelivery(
    event: TislyEvent,
    payload: NotificationPayload,
    result: DeliveryResult
  ): void {
    const logId = uuid();
    const db = getDatabase();
    db.prepare(
      `INSERT INTO notification_logs (id, device_id, event_type, channel, title, body, payload_json, status, sent_at, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      logId,
      event.deviceId,
      event.eventType,
      result.channel,
      payload.title,
      payload.body,
      JSON.stringify(payload),
      result.success ? "sent" : "failed",
      result.success ? new Date().toISOString() : null,
      result.error ?? null
    );

    if (!result.success) {
      queueFailedDelivery(logId, result.channel, payload);
    }
  }

  async sendTest(channel: NotificationChannel): Promise<DeliveryResult> {
    const payload: NotificationPayload = {
      title: "TiSLY テスト通知",
      body: "通知基盤のテスト送信です。",
      eventType: "test",
      deviceId: "tisly-platform",
    };
    switch (channel) {
      case "web_push":
        return sendWebPush(payload);
      case "discord":
        return sendDiscord(payload);
      case "email":
        return sendEmail(payload);
      default:
        return { channel, success: false, error: "Channel not implemented" };
    }
  }
}

let instance: NotificationService | null = null;

export function getNotificationService(): NotificationService {
  if (!instance) instance = new NotificationService();
  return instance;
}
