import { Router } from "express";
import os from "os";
import { config } from "../../config.js";
import { getDatabase } from "../../db/database.js";
import { getDbProvider } from "../../db/db-provider.js";
import { PostgresProvider } from "../../db/postgres-provider.js";
import { isAuthConfigured } from "../../auth/admin-auth.js";
import { getFailedLoginCount, getIngestErrorCount } from "../../auth/admin-auth.js";
import { getSessionStoreStatus } from "../../auth/session-store.js";
import { isQnapSmbConfigured, getQnapMode } from "../../qnap/smb-client.js";
import { getLatestBackupStatus, listRecentBackups } from "../../backup/backup-status.js";
import { getRetentionPolicy } from "../../qnap/retention-manager.js";
import { getIngestDuplicateCount } from "../../security/event-idempotency.js";
import {
  getSignatureErrorCount,
  getRateLimitProviderStatus,
} from "../../security/security-metrics.js";
import { getReplayBlockedCount } from "../../security/replay-protection.js";
import { getSiemExportStatus } from "../../security/siem-exporter.js";
import { pingRedis } from "../../redis/redis-client.js";
import { getRateLimitProviderName } from "../../redis/rate-limit-redis.js";
import { getInfrastructureStatuses } from "../../infrastructure/status.js";
import { getBuildVersion } from "../../deploy/build-version.js";
import { getWsClientCount } from "../../ws/hub.js";
import { getGoogleMapsApiKey, isGoogleMapsApiConfigured } from "../../schedule/google-maps-service.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..", "..", "..");

function nginxHasWebSocket(): boolean {
  const confPath = path.join(serverRoot, "deploy/nginx/tisly.jp.conf");
  if (!fs.existsSync(confPath)) return false;
  const conf = fs.readFileSync(confPath, "utf8");
  return conf.includes("location /ws") && conf.includes("Upgrade");
}

export const healthFullRouter = Router();

async function buildFullHealthResponse() {
  const db = getDatabase();
  let dbOk = true;
  try {
    db.prepare("SELECT 1").get();
  } catch {
    dbOk = false;
  }

  const dbProvider = getDbProvider();
  const providerInfo = dbProvider.info();
  let postgresReachable = providerInfo.provider === "postgres" ? providerInfo.reachable : null;
  if (dbProvider instanceof PostgresProvider) {
    postgresReachable = await dbProvider.pingAsync();
  }

  const redisReachable = await pingRedis();

  const tvCount = (
    db.prepare("SELECT COUNT(*) as c FROM tv_devices").get() as { c: number }
  ).c;
  const pairedTv = (
    db
      .prepare("SELECT COUNT(*) as c FROM tv_devices WHERE paired_at IS NOT NULL AND status = 'paired'")
      .get() as { c: number }
  ).c;
  const tvPairing = (
    db.prepare("SELECT COUNT(*) as c FROM tv_devices WHERE status = 'pairing'").get() as {
      c: number;
    }
  ).c;

  let notificationQueue: { status: string; pending: number | null } = {
    status: "unknown",
    pending: null,
  };
  try {
    const pendingNotifications = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM notification_deliveries WHERE status = 'pending'`
        )
        .get() as { c: number }
    ).c;
    notificationQueue = {
      status: pendingNotifications > 50 ? "busy" : "ok",
      pending: pendingNotifications,
    };
  } catch {
    notificationQueue = { status: "n/a", pending: null };
  }

  const backupLatest = getLatestBackupStatus();
  const retention = getRetentionPolicy();
  const sessionStore = getSessionStoreStatus();
  const rateLimitStatus = getRateLimitProviderStatus();
  const siemStatus = getSiemExportStatus();
  const infrastructure = await getInfrastructureStatuses();

  const mqttStatus =
    process.env.MQTT_SUBSCRIBER_ENABLED === "true"
      ? "ok"
      : process.env.MQTT_MOCK_MODE === "true"
        ? "mock"
        : "standby";

  const memFreePct = (os.freemem() / os.totalmem()) * 100;
  const buildVersion = getBuildVersion();
  const wsReady = nginxHasWebSocket();
  const publicUrl = config.publicUrl;
  const googleMapsApiConfigured = isGoogleMapsApiConfigured();
  const googleMapsApiKeyPresent = Boolean(getGoogleMapsApiKey());

  return {
    status: dbOk ? "ok" : "degraded",
    buildVersion,
    commitShort: buildVersion.commitShort,
    googleMapsApiConfigured,
    googleMapsApiKeyPresent,
    uptime: Math.round(process.uptime()),
    database: {
      status: dbOk ? "ok" : "error",
      provider: providerInfo.provider,
    },
    websocket: {
      status: wsReady ? "ok" : "not-configured",
      path: "/ws",
      clients: getWsClientCount(),
      nginxReady: wsReady,
    },
    productionUrl: publicUrl,
    phase: config.rc1Phase,
    integrations: {
      googleMapsApiConfigured,
      googleMapsApiKeyPresent,
    },
    db_provider: providerInfo.provider,
    postgres: {
      reachable: postgresReachable,
      configured: config.dbProvider === "postgres",
    },
    redis: {
      reachable: redisReachable,
      provider: getRateLimitProviderName(),
    },
    mqtt: {
      status: mqttStatus,
      url: config.mqtt.url,
      subscriberEnabled: process.env.MQTT_SUBSCRIBER_ENABLED === "true",
    },
    tv: {
      status: tvPairing > 10 ? "busy" : "ok",
      registered: tvCount,
      paired: pairedTv,
      pairingActive: tvPairing,
    },
    qnap: {
      status: getQnapMode() === "real" && isQnapSmbConfigured() ? "real-ready" : "mock",
      mode: getQnapMode(),
    },
    disk: { status: memFreePct < 10 ? "low" : "ok", memoryFreePercent: Math.round(memFreePct) },
    memory: {
      status: os.loadavg()[0]! > os.cpus().length * 2 ? "high-load" : "ok",
      loadAvg: os.loadavg()[0],
    },
    postgres_reachable: postgresReachable,
    redis_reachable: redisReachable,
    session_store: sessionStore,
    rate_limit_provider: getRateLimitProviderName(),
    signature_check_enabled: config.security.signatureCheckEnabled,
    replay_protection_enabled: config.security.replayProtectionEnabled,
    siem_export_status: siemStatus,
    infrastructure,
    components: {
      server: { status: "ok", port: config.port, nodeEnv: config.nodeEnv },
      database: {
        status: dbOk ? "ok" : "error",
        path: config.dbPath,
        provider: providerInfo.provider,
      },
      mqtt: {
        status: mqttStatus,
        url: config.mqtt.url,
        mockMode: process.env.MQTT_MOCK_MODE === "true",
        tlsRecommended: true,
      },
      nodeRed: {
        status: config.ingestSecret ? "configured" : "missing-ingest-secret",
        ingestPath: "/api/events/ingest",
      },
      qnap: {
        status: getQnapMode() === "real" && isQnapSmbConfigured() ? "real-ready" : "mock",
        mode: getQnapMode(),
        smbConfigured: isQnapSmbConfigured(),
        retentionDays: retention.days,
      },
      tv: {
        status: "ok",
        registered: tvCount,
        paired: pairedTv,
        pairingActive: tvPairing,
        connections: pairedTv,
      },
      auth: {
        status: isAuthConfigured() ? "configured" : "not-configured",
        failedLogins: getFailedLoginCount(),
      },
      notificationQueue,
      backup: {
        status: backupLatest?.status ?? "never",
        lastRun: backupLatest,
        recent: listRecentBackups(3),
      },
      security: {
        ingestErrors: getIngestErrorCount(),
        ingestDuplicates: getIngestDuplicateCount(),
        signatureErrors: getSignatureErrorCount(),
        replayBlocked: getReplayBlockedCount(),
        rateLimit: rateLimitStatus,
      },
    },
    demoMode: config.demoMode,
  };
}

healthFullRouter.get("/", async (_req, res) => {
  res.json(await buildFullHealthResponse());
});

healthFullRouter.get("/full", async (_req, res) => {
  const body = await buildFullHealthResponse();
  res.json({ ...body, endpoint: "/api/health/full" });
});
