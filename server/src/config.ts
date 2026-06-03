import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), "..", ".env") });

function env(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

export const config = {
  nodeEnv: env("NODE_ENV", "development"),
  port: Number(env("TISLY_PORT") || env("PORT") || "3080"),
  host: env("TISLY_HOST", "0.0.0.0"),
  get publicUrl() {
    return env("TISLY_PUBLIC_URL") || env("PUBLIC_BASE_URL") || "https://tisly.jp";
  },
  get dbPath() {
    const url = env("DATABASE_URL");
    if (url.startsWith("sqlite://")) return url.replace("sqlite://", "");
    return env("TISLY_DB_PATH", "./data/tisly_notifications.db");
  },
  defaultTenantId: env("DEFAULT_TENANT_ID", "default"),
  get ingestSecret() {
    return env("INGEST_SECRET");
  },
  mqtt: {
    url: env("MQTT_URL", "mqtt://127.0.0.1:1883"),
    username: env("MQTT_USERNAME"),
    password: env("MQTT_PASSWORD"),
    topicPrefix: env("MQTT_TOPIC_PREFIX", "tisly/#"),
    clientId: env("MQTT_CLIENT_ID", "tisly-notification-core"),
  },
  vapid: {
    publicKey: env("VAPID_PUBLIC_KEY"),
    privateKey: env("VAPID_PRIVATE_KEY"),
    subject: env("VAPID_SUBJECT", "mailto:admin@tisly.jp"),
  },
  discord: {
    get webhookUrl() {
      return env("DISCORD_WEBHOOK_URL");
    },
  },
  smtp: {
    host: env("SMTP_HOST", "smtp.gmail.com"),
    port: Number(env("SMTP_PORT", "587")),
    user: env("SMTP_USER"),
    pass: env("SMTP_PASS") || env("SMTP_PASSWORD"),
    from: env("SMTP_FROM", "noreply@tisly.jp"),
    adminEmail: env("ADMIN_EMAIL"),
  },
  heartbeat: {
    warnSec: Number(env("HEARTBEAT_WARN_SEC", "30")),
    alarmSec: Number(env("HEARTBEAT_ALARM_SEC", "300")),
  },
  get demoMode() {
    return env("TISLY_DEMO_MODE") === "true";
  },
  get demoAutoStart() {
    return env("TISLY_DEMO_AUTO_START") === "true";
  },
  qnap: {
    get mode() {
      return (env("QNAP_MODE", "mock") as "mock" | "real");
    },
    host: env("QNAP_HOST"),
    share: env("QNAP_SHARE", "TiSLY"),
    username: env("QNAP_USERNAME"),
    password: env("QNAP_PASSWORD"),
    basePath: env("QNAP_BASE_PATH", "/TiSLY"),
  },
  rc1Phase: "181-200-production-security",
  get dbProvider() {
    return (env("DB_PROVIDER", "sqlite") as "sqlite" | "postgres");
  },
  postgres: {
    host: env("POSTGRES_HOST", "127.0.0.1"),
    port: Number(env("POSTGRES_PORT", "5432")),
    database: env("POSTGRES_DB", "tisly"),
    user: env("POSTGRES_USER", "tisly"),
    password: env("POSTGRES_PASSWORD"),
    ssl: env("POSTGRES_SSL", "false") === "true",
  },
  get rateLimitProvider() {
    return (env("RATE_LIMIT_PROVIDER", "memory") as "memory" | "redis");
  },
  redis: {
    url: env("REDIS_URL", "redis://127.0.0.1:6379"),
  },
  security: {
    get signatureCheckEnabled() {
      return env("SIGNATURE_CHECK_ENABLED", "false") === "true";
    },
    get replayProtectionEnabled() {
      return env("REPLAY_PROTECTION_ENABLED", "true") === "true";
    },
    get siemExportEnabled() {
      return env("SIEM_EXPORT_ENABLED", "true") === "true";
    },
    signatureMaxAgeSec: Number(env("SIGNATURE_MAX_AGE_SEC", "300")),
  },
  auth: {
    get jwtSecret() {
      return env("JWT_SECRET");
    },
    get adminUsername() {
      return env("ADMIN_USERNAME", "admin");
    },
    get adminPasswordHash() {
      return env("ADMIN_PASSWORD_HASH");
    },
    get sessionExpiresMinutes() {
      return Number(env("SESSION_EXPIRES_MINUTES", "480"));
    },
  },
};
