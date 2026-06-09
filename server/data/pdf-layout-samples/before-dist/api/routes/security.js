import { randomBytes } from "crypto";
import { Router } from "express";
import { requireAdminAuth } from "../../auth/auth-middleware.js";
import { getFailedLoginCount, getIngestErrorCount, isAuthConfigured, } from "../../auth/admin-auth.js";
import { config } from "../../config.js";
import { getDatabase } from "../../db/database.js";
import { setPlatformSetting } from "../../db/database.js";
import { auditContextFromRequest, logAudit } from "../../provisioning/audit-log.js";
import { hashSecret } from "../../provisioning/site-provisioner.js";
import { listAuditLogs } from "../../provisioning/audit-log.js";
import { runBackup } from "../../backup/backup-manager.js";
import { listRecentBackups } from "../../backup/backup-status.js";
import { encryptDeviceSecret } from "../../security/secret-crypto.js";
import { getIngestDuplicateCount } from "../../security/event-idempotency.js";
import { getSignatureErrorCount, getRateLimitProviderStatus } from "../../security/security-metrics.js";
import { getReplayBlockedCount } from "../../security/replay-protection.js";
import { getSiemExportStatus } from "../../security/siem-exporter.js";
import { getDbProvider } from "../../db/db-provider.js";
import { listActiveSessions } from "../../auth/session-store.js";
import { getRateLimitProviderName } from "../../security/rate-limit-redis.js";
export const securityRouter = Router();
securityRouter.use(requireAdminAuth);
function generateSecret() {
    return randomBytes(24).toString("base64url");
}
securityRouter.post("/rotate-ingest-secret", (req, res) => {
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
securityRouter.get("/overview", (req, res) => {
    const db = getDatabase();
    const deviceCreds = db.prepare("SELECT COUNT(*) as c FROM device_credentials WHERE status = 'active'").get().c;
    const tvTotal = db.prepare("SELECT COUNT(*) as c FROM tv_devices").get().c;
    const tvPaired = db
        .prepare("SELECT COUNT(*) as c FROM tv_devices WHERE status = 'paired'")
        .get().c;
    const tvRevoked = db
        .prepare("SELECT COUNT(*) as c FROM tv_devices WHERE status = 'revoked'")
        .get().c;
    const tvPairing = db
        .prepare("SELECT COUNT(*) as c FROM tv_devices WHERE status = 'pairing'")
        .get().c;
    res.json({
        auth: {
            configured: isAuthConfigured(),
            user: req.admin,
            failedLoginCount: getFailedLoginCount(),
        },
        sessions: listActiveSessions(req.admin?.userId),
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
        ingestDuplicates: getIngestDuplicateCount(),
        signatureErrors: getSignatureErrorCount(),
        replayBlocked: getReplayBlockedCount(),
        rateLimit: { ...getRateLimitProviderStatus(), provider: getRateLimitProviderName() },
        siemExport: getSiemExportStatus(),
        dbProvider: getDbProvider().info(),
        auditLogSample: listAuditLogs({ limit: 20 }),
    });
});
securityRouter.post("/devices/:id/rotate-secret", (req, res) => {
    const deviceId = String(req.params.id);
    const db = getDatabase();
    const cred = db
        .prepare(`SELECT id, secret_hash, site_id, tenant_id FROM device_credentials
       WHERE device_id = ? AND status = 'active'`)
        .get(deviceId);
    if (!cred) {
        res.status(404).json({ error: "device credentials not found" });
        return;
    }
    const newSecret = generateSecret();
    const newHash = hashSecret(newSecret);
    db.prepare(`UPDATE device_credentials SET secret_hash = ?, secret_encrypted = ?, rotated_at = datetime('now')
     WHERE device_id = ?`).run(newHash, encryptDeviceSecret(newSecret), deviceId);
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
securityRouter.post("/backup/run", async (req, res) => {
    const targets = req.body?.targets ?? [
        "sqlite",
        "events",
        "reports",
        "settings",
    ];
    const result = await runBackup(targets, { userId: req.admin?.userId, username: req.admin?.username });
    res.json({ ...result, recent: listRecentBackups(5) });
});
