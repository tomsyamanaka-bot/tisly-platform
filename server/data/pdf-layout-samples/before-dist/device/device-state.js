import { getDatabase } from "../db/database.js";
export function normalizeDeviceStatus(raw) {
    const u = (raw ?? "UNKNOWN").toUpperCase();
    if (u === "ONLINE" ||
        u === "OFFLINE" ||
        u === "WARNING" ||
        u === "COMMISSIONING" ||
        u === "UNKNOWN") {
        return u;
    }
    if (u === "OK" || u === "ON")
        return "ONLINE";
    if (u === "ALARM" || u === "DOWN")
        return "OFFLINE";
    return "UNKNOWN";
}
export function statusFromHeartbeatAge(elapsedSec, warnSec, offlineSec) {
    if (elapsedSec >= offlineSec)
        return "OFFLINE";
    if (elapsedSec >= warnSec)
        return "WARNING";
    return "ONLINE";
}
export function updateDeviceStatusFields(deviceId, status, opts) {
    const db = getDatabase();
    const now = opts?.lastSeen ?? new Date().toISOString();
    const hb = opts?.lastHeartbeat ?? now;
    const row = db
        .prepare(`SELECT id, first_seen, device_status FROM devices WHERE device_id = ?`)
        .get(deviceId);
    if (!row)
        return;
    const firstSeen = opts?.setFirstSeen && !row.first_seen ? now : row.first_seen ?? null;
    db.prepare(`UPDATE devices SET device_status = ?, last_heartbeat_at = COALESCE(?, last_heartbeat_at),
      last_seen = ?, first_seen = COALESCE(first_seen, ?),
      heartbeat_status = CASE
        WHEN ? = 'ONLINE' THEN 'ok'
        WHEN ? = 'WARNING' THEN 'warning'
        WHEN ? = 'OFFLINE' THEN 'alarm'
        ELSE heartbeat_status
      END,
      updated_at = datetime('now')
     WHERE device_id = ?`).run(status, hb, now, firstSeen, status, status, status, deviceId);
}
export function setDeviceCommissioning(deviceId) {
    updateDeviceStatusFields(deviceId, "COMMISSIONING", { setFirstSeen: true });
}
export function getDeviceStatusSummary(customerId) {
    const db = getDatabase();
    const rows = db
        .prepare(`SELECT COALESCE(device_status, 'UNKNOWN') as device_status, COUNT(*) as c
       FROM devices WHERE customer_id = ? GROUP BY device_status`)
        .all(customerId);
    const out = {
        total: 0,
        online: 0,
        warning: 0,
        offline: 0,
        commissioning: 0,
        unknown: 0,
    };
    for (const r of rows) {
        const s = normalizeDeviceStatus(r.device_status);
        out.total += r.c;
        if (s === "ONLINE")
            out.online += r.c;
        else if (s === "WARNING")
            out.warning += r.c;
        else if (s === "OFFLINE")
            out.offline += r.c;
        else if (s === "COMMISSIONING")
            out.commissioning += r.c;
        else
            out.unknown += r.c;
    }
    return out;
}
