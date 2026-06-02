import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), "..", ".env") });

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.TISLY_PORT ?? process.env.PORT ?? 3080),
  host: process.env.TISLY_HOST ?? "0.0.0.0",
  publicUrl:
    process.env.TISLY_PUBLIC_URL ??
    process.env.PUBLIC_BASE_URL ??
    "https://tisly.jp",
  dbPath:
    process.env.TISLY_DB_PATH ??
    (process.env.DATABASE_URL?.startsWith("sqlite://")
      ? process.env.DATABASE_URL.replace("sqlite://", "")
      : "./data/tisly_notifications.db"),
  defaultTenantId: process.env.DEFAULT_TENANT_ID ?? "default",
  ingestSecret: process.env.INGEST_SECRET ?? "",
  mqtt: {
    url: process.env.MQTT_URL ?? "mqtt://127.0.0.1:1883",
    username: process.env.MQTT_USERNAME ?? "",
    password: process.env.MQTT_PASSWORD ?? "",
    topicPrefix: process.env.MQTT_TOPIC_PREFIX ?? "tisly/#",
    clientId: process.env.MQTT_CLIENT_ID ?? "tisly-notification-core",
  },
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY ?? "",
    privateKey: process.env.VAPID_PRIVATE_KEY ?? "",
    subject: process.env.VAPID_SUBJECT ?? "mailto:admin@tisly.jp",
  },
  discord: {
    webhookUrl: process.env.DISCORD_WEBHOOK_URL ?? "",
  },
  smtp: {
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD ?? "",
    from: process.env.SMTP_FROM ?? "noreply@tisly.jp",
    adminEmail: process.env.ADMIN_EMAIL ?? "",
  },
  heartbeat: {
    warnSec: Number(process.env.HEARTBEAT_WARN_SEC ?? 30),
    alarmSec: Number(process.env.HEARTBEAT_ALARM_SEC ?? 300),
  },
  demoMode: process.env.TISLY_DEMO_MODE === "true",
  demoAutoStart: process.env.TISLY_DEMO_AUTO_START === "true",
  qnap: {
    mode: (process.env.QNAP_MODE ?? "mock") as "mock" | "real",
    host: process.env.QNAP_HOST ?? "",
    share: process.env.QNAP_SHARE ?? "TiSLY",
    username: process.env.QNAP_USERNAME ?? "",
    password: process.env.QNAP_PASSWORD ?? "",
    basePath: process.env.QNAP_BASE_PATH ?? "/TiSLY",
  },
  rc1Phase: "141-160-rc1",
};
