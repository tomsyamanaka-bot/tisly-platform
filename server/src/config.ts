import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env"), override: true });
dotenv.config({ path: path.join(process.cwd(), "..", ".env"), override: true });

function env(key: string, fallback = ""): string {
  return (process.env[key] ?? fallback).trim();
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
    get mode() {
      const m = env("MQTT_MODE", "mock").toLowerCase();
      return m === "real" ? ("real" as const) : ("mock" as const);
    },
    url: env("MQTT_URL", "mqtt://mqtt.tisly.jp:1883"),
    username: env("MQTT_USERNAME"),
    password: env("MQTT_PASSWORD"),
    topicPrefix: env("MQTT_TOPIC_PREFIX", "tisly"),
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
    return env("TISLY_DEMO_MODE") === "true" || env("DEMO_MODE") === "true";
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
  rc1Phase: "1461-1500-conoha-vps-auto-deploy",
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
    get require2fa() {
      return env("REQUIRE_2FA", "false") === "true";
    },
    get customerLoginLockMinutes() {
      return Number(env("CUSTOMER_LOGIN_LOCK_MINUTES", "15"));
    },
    get customerLoginMaxAttempts() {
      return Number(env("CUSTOMER_LOGIN_MAX_ATTEMPTS", "5"));
    },
  },
  siem: {
    get provider() {
      return (env("SIEM_PROVIDER", "none") as "none" | "loki" | "elastic" | "syslog");
    },
    lokiUrl: env("SIEM_LOKI_URL"),
    elasticUrl: env("SIEM_ELASTIC_URL"),
    elasticIndex: env("SIEM_ELASTIC_INDEX", "tisly-security"),
    syslogHost: env("SIEM_SYSLOG_HOST", "127.0.0.1"),
    syslogPort: Number(env("SIEM_SYSLOG_PORT", "514")),
  },
  tv: {
    get certPinningEnabled() {
      return env("TV_CERT_PINNING_ENABLED", "false") === "true";
    },
    get certFingerprint() {
      return env("TV_CERT_FINGERPRINT", "sha256/PLACEHOLDER_REPLACE_BEFORE_PRODUCTION");
    },
  },
  infrastructure: {
    get vpsLabel() {
      return env("VPS_LABEL", "ConoHa VPS");
    },
    get nodeRedUrl() {
      return env("NODE_RED_URL", "");
    },
  },
  storage: {
    get provider() {
      return (env("STORAGE_PROVIDER", "local") as "local" | "s3");
    },
    s3: {
      endpoint: env("S3_ENDPOINT"),
      bucket: env("S3_BUCKET"),
      accessKey: env("S3_ACCESS_KEY"),
      secretKey: env("S3_SECRET_KEY"),
    },
  },
  get mqttUrlConfigured() {
    return !!process.env.MQTT_URL?.trim();
  },
  shelly: {
    get mode() {
      const m = env("SHELLY_MODE", "mock").toLowerCase();
      return m === "real" ? ("real" as const) : ("mock" as const);
    },
    baseUrl: env("SHELLY_BASE_URL"),
    authToken: env("SHELLY_AUTH_TOKEN"),
  },
  demoReset: {
    get enabled() {
      return env("DEMO_RESET_ENABLED", "false") === "true";
    },
    cronExpr: env("DEMO_RESET_CRON", "0 6 * * *"),
    timezone: env("DEMO_RESET_TZ", "Asia/Tokyo"),
  },
  field: {
    get liveMode() {
      return env("FIELD_LIVE_MODE", "false") === "true";
    },
    get mqttAckRequired() {
      return env("MQTT_ACK_REQUIRED", "false") === "true";
    },
    get certProvisioningMode() {
      const mode = env("CERT_PROVISIONING_MODE", "mock");
      if (mode === "ca" || mode === "acme") return mode;
      return "mock" as const;
    },
  },
  lock: {
    get provider() {
      const p = env("LOCK_PROVIDER", "switchbot").toLowerCase();
      if (p === "sesame" || p === "mock") return p as "sesame" | "mock";
      return "switchbot" as const;
    },
  },
  switchbot: {
    get mode() {
      const m = env("SWITCHBOT_MODE", "mock").toLowerCase();
      if (m === "real") return "real" as const;
      if (m === "dryrun") return "dryRun" as const;
      return "mock" as const;
    },
    get token() {
      return env("SWITCHBOT_TOKEN");
    },
    get secret() {
      return env("SWITCHBOT_SECRET");
    },
    get lockDeviceId() {
      return env("SWITCHBOT_LOCK_DEVICE_ID");
    },
    get autoArmEnabled() {
      return env("SWITCHBOT_AUTO_ARM_ENABLED", "false") === "true";
    },
    get autoDisarmEnabled() {
      return env("SWITCHBOT_AUTO_DISARM_ENABLED", "false") === "true";
    },
    get pollIntervalMs() {
      return Number(env("SWITCHBOT_POLL_INTERVAL_MS", "30000"));
    },
    get focusCustomerCode() {
      return env("SECURITY_FOCUS_CUSTOMER_CODE", "TOMS001").toUpperCase();
    },
  },
  securityAutomation: {
    get eventLogEnabled() {
      return env("SECURITY_EVENT_LOG_ENABLED", "true") === "true";
    },
    get unknownDevicePolicy() {
      const p = env("SECURITY_UNKNOWN_DEVICE_POLICY", "block_auto_arm");
      if (p === "unknown_as_away" || p === "unknown_as_home") return p;
      return "block_auto_arm" as const;
    },
    get unlockCooldownSec() {
      return Number(env("SECURITY_UNLOCK_COOLDOWN_SEC", "120"));
    },
  },
};
