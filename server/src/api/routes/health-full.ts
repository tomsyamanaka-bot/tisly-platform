import { Router } from "express";
import { config } from "../../config.js";
import { getDatabase } from "../../db/database.js";
import { isAuthConfigured } from "../../auth/admin-auth.js";
import { getFailedLoginCount, getIngestErrorCount } from "../../auth/admin-auth.js";
import { isQnapSmbConfigured, getQnapMode } from "../../qnap/smb-client.js";
import { getLatestBackupStatus, listRecentBackups } from "../../backup/backup-status.js";
import { getRetentionPolicy } from "../../qnap/retention-manager.js";

export const healthFullRouter = Router();

healthFullRouter.get("/", (_req, res) => {
  const db = getDatabase();
  let dbOk = true;
  try {
    db.prepare("SELECT 1").get();
  } catch {
    dbOk = false;
  }

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

  res.json({
    status: dbOk ? "ok" : "degraded",
    phase: "161-180-security-rc1",
    components: {
      server: { status: "ok", port: config.port, nodeEnv: config.nodeEnv },
      database: { status: dbOk ? "ok" : "error", path: config.dbPath },
      mqtt: {
        status: process.env.MQTT_SUBSCRIBER_ENABLED === "true" ? "enabled" : "standby",
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
      },
    },
    demoMode: config.demoMode,
  });
});
