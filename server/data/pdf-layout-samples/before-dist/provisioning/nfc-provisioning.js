import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { hashSecret } from "./site-provisioner.js";
import { logAudit } from "./audit-log.js";
export function claimNfcProvisioning(input) {
    const uid = input.nfcUid?.trim();
    if (!uid || uid.length < 4) {
        throw new Error("nfcUid required (min 4 chars)");
    }
    const db = getDatabase();
    const deviceId = input.deviceId ?? `nfc-${uid.toLowerCase().replace(/[^a-z0-9]/gi, "")}`;
    const deviceType = input.deviceType ?? "ESP32";
    const serialNumber = input.serialNumber ?? uid;
    const tokenHash = hashSecret(`nfc:${uid}:${input.customerId}`);
    const now = new Date().toISOString();
    const existing = db
        .prepare(`SELECT id FROM devices WHERE device_id = ? AND customer_id = ?`)
        .get(deviceId, input.customerId);
    let deviceRowId;
    if (existing) {
        deviceRowId = existing.id;
        db.prepare(`UPDATE devices SET commissioning_status = 'claimed', commissioned_at = ?, commissioned_by = ?,
         provisioning_token_hash = ?, install_note = ?, serial_number = ?, updated_at = ?
       WHERE id = ?`).run(now, input.claimedBy ?? null, tokenHash, `nfc_uid:${uid}`, serialNumber, now, deviceRowId);
    }
    else {
        deviceRowId = uuid();
        db.prepare(`INSERT INTO devices (id, customer_id, site_id, floor_id, zone_id, device_type, device_id, label, serial_number,
         commissioning_status, commissioned_at, commissioned_by, provisioning_token_hash, install_note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'claimed', ?, ?, ?, ?, ?, ?)`).run(deviceRowId, input.customerId, input.siteId ?? null, input.floorId ?? null, input.zoneId ?? null, deviceType, deviceId, deviceId, serialNumber, now, input.claimedBy ?? null, tokenHash, `nfc_uid:${uid}`, now, now);
    }
    logAudit({
        tenantId: input.customerId,
        actorId: input.claimedBy,
        action: "nfc.claim",
        entityType: "device",
        entityId: deviceId,
        details: { nfcUid: uid, placeholder: "smartphone NFC read TODO" },
    });
    return { deviceRowId, deviceId };
}
