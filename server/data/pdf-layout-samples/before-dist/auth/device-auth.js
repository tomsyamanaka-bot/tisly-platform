import { config } from "../config.js";
import { getDatabase } from "../db/database.js";
import { hashSecret } from "../provisioning/site-provisioner.js";
import { recordIngestError } from "./admin-auth.js";
export function verifyDeviceSecret(deviceId, secret) {
    const row = getDatabase()
        .prepare(`SELECT secret_hash FROM device_credentials
       WHERE device_id = ? AND status = 'active'`)
        .get(deviceId);
    if (!row)
        return false;
    return hashSecret(secret) === row.secret_hash;
}
export function verifyIngestSecret(secret) {
    if (!config.ingestSecret)
        return false;
    return secret === config.ingestSecret;
}
export function requireIngestOrDeviceAuth(req, res, next) {
    const ingestSecret = req.header("x-tisly-ingest-secret");
    if (config.ingestSecret && ingestSecret === config.ingestSecret) {
        next();
        return;
    }
    const deviceId = req.header("x-tisly-device-id");
    const deviceSecret = req.header("x-tisly-device-secret");
    if (deviceId && deviceSecret && verifyDeviceSecret(deviceId, deviceSecret)) {
        next();
        return;
    }
    recordIngestError(deviceId ?? undefined);
    if (!config.ingestSecret) {
        res.status(503).json({ error: "INGEST_SECRET not configured on server" });
        return;
    }
    res.status(401).json({ error: "Invalid device or ingest credentials" });
}
