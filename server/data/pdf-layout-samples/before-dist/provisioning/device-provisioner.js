import { randomBytes } from "crypto";
import { v4 as uuid } from "uuid";
import { config } from "../config.js";
import { getDatabase } from "../db/database.js";
import { logAudit } from "./audit-log.js";
import { hashSecret } from "./site-provisioner.js";
import { encryptDeviceSecret } from "../security/secret-crypto.js";
function generateDeviceId(siteId, kind) {
    const suffix = randomBytes(4).toString("hex");
    return `${siteId}-${kind}-${suffix}`;
}
function generateSecret() {
    return randomBytes(24).toString("base64url");
}
export function provisionDevice(input) {
    const db = getDatabase();
    const site = db.prepare("SELECT tenant_id FROM sites WHERE id = ?").get(input.siteId);
    if (!site) {
        throw new Error("site not found");
    }
    const tenantId = input.tenantId ?? site.tenant_id ?? config.defaultTenantId;
    let zoneId = input.zoneId ?? null;
    if (!zoneId) {
        const firstZone = db
            .prepare("SELECT id FROM zones WHERE site_id = ? ORDER BY sort_order LIMIT 1")
            .get(input.siteId);
        zoneId = firstZone?.id ?? null;
    }
    const kind = input.deviceType ?? "gateway";
    const deviceId = generateDeviceId(input.siteId, kind);
    const secret = generateSecret();
    const id = uuid();
    const meta = {
        tenant_id: tenantId,
        site_id: input.siteId,
        zone_id: zoneId,
        source_type: kind,
        provisioned: true,
        integration_phase: "141-160-rc1",
    };
    db.prepare(`INSERT INTO devices (id, device_type, platform, device_id, label, metadata_json, heartbeat_status)
     VALUES (?, ?, ?, ?, ?, ?, 'unknown')`).run(id, kind, input.platform ?? "unknown", deviceId, input.label ?? deviceId, JSON.stringify(meta));
    db.prepare(`INSERT INTO device_credentials (id, device_id, secret_hash, secret_encrypted, site_id, zone_id, tenant_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`).run(id, deviceId, hashSecret(secret), encryptDeviceSecret(secret), input.siteId, zoneId, tenantId);
    const registrationUrl = `${config.publicUrl}/setup?device=${encodeURIComponent(deviceId)}&token=${encodeURIComponent(secret)}`;
    const qrPayload = JSON.stringify({
        v: 1,
        deviceId,
        secret,
        siteId: input.siteId,
        zoneId,
        tenantId,
        url: registrationUrl,
    });
    logAudit({
        tenantId,
        siteId: input.siteId,
        actorId: input.actorId,
        actorLabel: input.actorLabel ?? "Operator",
        action: "device.provision",
        entityType: "device",
        entityId: deviceId,
        details: { zoneId, deviceType: kind },
    });
    return {
        id,
        deviceId,
        secret,
        siteId: input.siteId,
        zoneId,
        tenantId,
        registrationUrl,
        qrPayload,
    };
}
export function buildQrSvg(data) {
    const size = 21;
    const cell = 8;
    const hash = Buffer.from(data).toString("hex");
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size * cell}" height="${size * cell}" viewBox="0 0 ${size * cell} ${size * cell}">`;
    svg += `<rect width="100%" height="100%" fill="#fff"/>`;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = (x * size + y) % hash.length;
            const on = parseInt(hash[idx], 16) % 2 === 0;
            if ((x < 7 && y < 7) ||
                (x >= size - 7 && y < 7) ||
                (x < 7 && y >= size - 7)) {
                const frame = x === 0 ||
                    y === 0 ||
                    x === 6 ||
                    y === 6 ||
                    (x >= size - 7 && (x === size - 7 || x === size - 1)) ||
                    (y < 7 && (y === 0 || y === 6));
                if (frame || (x >= 2 && x <= 4 && y >= 2 && y <= 4)) {
                    svg += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="#000"/>`;
                }
                continue;
            }
            if (on) {
                svg += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="#000"/>`;
            }
        }
    }
    svg += "</svg>";
    return svg;
}
export function getDeviceQr(deviceId) {
    const db = getDatabase();
    const cred = db
        .prepare(`SELECT dc.site_id, dc.zone_id, dc.tenant_id, d.label
       FROM device_credentials dc
       JOIN devices d ON d.device_id = dc.device_id
       WHERE dc.device_id = ? AND dc.status = 'active'`)
        .get(deviceId);
    if (!cred) {
        throw new Error("device credentials not found — use POST /api/provisioning/devices");
    }
    const qrPayload = JSON.stringify({
        v: 1,
        deviceId,
        siteId: cred.site_id,
        zoneId: cred.zone_id,
        tenantId: cred.tenant_id,
        note: "secret は初回発行時のみ。再発行はローテーション API を使用",
    });
    const svg = buildQrSvg(qrPayload);
    return {
        deviceId,
        label: cred.label,
        siteId: cred.site_id,
        qrPayload,
        qrSvg: svg,
        qrDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
        registrationUrl: `${config.publicUrl}/setup?device=${encodeURIComponent(deviceId)}`,
    };
}
