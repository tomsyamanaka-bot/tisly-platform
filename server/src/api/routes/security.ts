import { randomBytes } from "crypto";
import { Router } from "express";
import { v4 as uuid } from "uuid";
import { requireAdminAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import {
  getFailedLoginCount,
  getIngestErrorCount,
  isAuthConfigured,
} from "../../auth/admin-auth.js";
import { config } from "../../config.js";
import { getDatabase } from "../../db/database.js";
import { setPlatformSetting } from "../../db/database.js";
import { auditContextFromRequest, logAudit } from "../../provisioning/audit-log.js";
import { hashSecret } from "../../provisioning/site-provisioner.js";
import { listAuditLogs } from "../../provisioning/audit-log.js";
import { runBackup } from "../../backup/backup-manager.js";
import { listRecentBackups } from "../../backup/backup-status.js";

export const securityRouter = Router();

securityRouter.use(requireAdminAuth);

function generateSecret(): string {
  return randomBytes(24).toString("base64url");
}

securityRouter.post("/rotate-ingest-secret", (req: AuthedRequest, res) => {
  const newSecret = generateSecret();
  const before = config.ingestSecret ? "[set]" : "";
  process.env.INGEST_SECRET = newSecret;
  setPlatformSetting("ingest_secret_rotated_at", { at: new Date().toISOString() });
  logAudit({
    userId: req.admin?.userId,
    actorLabel: req.admin?.username,
    action: "security.rotate_ingest_secret",
    targetType: "platform",
    targetId: "ingest",
    beforeJson: { configured: Boolean(before) },
    afterJson: { configured: true, note: "secret returned once in response" },
    ...auditContextFromRequest(req),
  });
  res.json({
    ok: true,
    ingestSecret: newSecret,
    warning: "Update Node-RED INGEST_SECRET and restart flows. Do not log this value.",
  });
});

securityRouter.get("/overview", (req: AuthedRequest, res) => {
  const db = getDatabase();
  const deviceCreds = (
    db.prepare("SELECT COUNT(*) as c FROM device_credentials WHERE status = 'active'").get() as {
      c: number;
    }
  ).c;
  const tvTotal = (
    db.prepare("SELECT COUNT(*) as c FROM tv_devices").get() as { c: number }
  ).c;
  const tvPaired = (
    db
      .prepare("SELECT COUNT(*) as c FROM tv_devices WHERE status = 'paired'")
      .get() as { c: number }
  ).c;
  const tvRevoked = (
    db
      .prepare("SELECT COUNT(*) as c FROM tv_devices WHERE status = 'revoked'")
      .get() as { c: number }
  ).c;
  const tvPairing = (
    db
      .prepare("SELECT COUNT(*) as c FROM tv_devices WHERE status = 'pairing'")
      .get() as { c: number }
  ).c;

  res.json({
    auth: {
      configured: isAuthConfigured(),
      user: req.admin,
      failedLoginCount: getFailedLoginCount(),
    },
    deviceSecrets: {
      active: deviceCreds,
      ingestConfigured: Boolean(config.ingestSecret),
    },
    tvPairing: {
      total: tvTotal,
      paired: tvPaired,
      pairing: tvPairing,
      revoked: tvRevoked,
    },
    ingestErrors: getIngestErrorCount(),
    auditLogSample: listAuditLogs({ limit: 20 }),
  });
});

securityRouter.post("/devices/:id/rotate-secret", (req: AuthedRequest, res) => {
  const deviceId = String(req.params.id);
  const db = getDatabase();
  const cred = db
    .prepare(
      `SELECT id, secret_hash, site_id, tenant_id FROM device_credentials
       WHERE device_id = ? AND status = 'active'`
    )
    .get(deviceId) as
    | { id: string; secret_hash: string; site_id: string; tenant_id: string }
    | undefined;
  if (!cred) {
    res.status(404).json({ error: "device credentials not found" });
    return;
  }
  const newSecret = generateSecret();
  const newHash = hashSecret(newSecret);
  db.prepare(
    `UPDATE device_credentials SET secret_hash = ?, rotated_at = datetime('now')
     WHERE device_id = ?`
  ).run(newHash, deviceId);

  logAudit({
    userId: req.admin?.userId,
    siteId: cred.site_id,
    tenantId: cred.tenant_id,
    actorLabel: req.admin?.username,
    action: "device.rotate_secret",
    targetType: "device",
    targetId: deviceId,
    beforeJson: { hadSecret: true },
    afterJson: { rotated: true },
    ...auditContextFromRequest(req),
  });

  res.json({
    ok: true,
    deviceId,
    secret: newSecret,
    warning: "Secret shown once. Update device firmware / Node-RED.",
  });
});

securityRouter.post("/backup/run", async (req: AuthedRequest, res) => {
  const targets = (req.body?.targets as string[] | undefined) ?? [
    "sqlite",
    "events",
    "reports",
    "settings",
  ];
  const result = await runBackup(
    targets as Array<"sqlite" | "events" | "reports" | "settings">,
    { userId: req.admin?.userId, username: req.admin?.username }
  );
  res.json({ ...result, recent: listRecentBackups(5) });
});
