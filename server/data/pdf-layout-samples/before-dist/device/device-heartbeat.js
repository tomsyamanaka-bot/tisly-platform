import { v4 as uuid } from "uuid";
import { config } from "../config.js";
import { getDatabase } from "../db/database.js";
import { statusFromHeartbeatAge, updateDeviceStatusFields, } from "./device-state.js";
import { appendDeviceTimeline } from "./device-timeline.js";
const WARN_SEC = 5 * 60;
const OFFLINE_SEC = 15 * 60;
const lastNotified = new Map();
export function getHeartbeatThresholds() {
    return {
        warnSec: Number(process.env.DEVICE_HEARTBEAT_WARN_SEC ?? String(WARN_SEC)),
        offlineSec: Number(process.env.DEVICE_HEARTBEAT_OFFLINE_SEC ?? String(OFFLINE_SEC)),
    };
}
export function recordDeviceHeartbeat(deviceId, platform) {
    const db = getDatabase();
    const now = new Date().toISOString();
    const existing = db
        .prepare("SELECT id, first_seen, device_status FROM devices WHERE device_id = ?")
        .get(deviceId);
    if (existing) {
        db.prepare(`UPDATE devices SET last_heartbeat_at = ?, last_seen = ?, heartbeat_status = 'ok',
        device_status = 'ONLINE', platform = COALESCE(?, platform),
        first_seen = COALESCE(first_seen, ?), updated_at = datetime('now')
       WHERE device_id = ?`).run(now, now, platform ?? null, now, deviceId);
    }
    else {
        const id = uuid();
        db.prepare(`INSERT INTO devices (id, device_id, device_type, platform, label, last_heartbeat_at, last_seen,
        first_seen, heartbeat_status, device_status)
       VALUES (?, ?, 'gateway', ?, ?, ?, ?, ?, 'ok', 'ONLINE')`).run(id, deviceId, platform ?? "unknown", deviceId, now, now, now);
    }
    db.prepare(`INSERT INTO device_heartbeats (id, device_id, received_at, payload_json)
     VALUES (?, ?, ?, ?)`).run(uuid(), deviceId, now, JSON.stringify({ platform: platform ?? null }));
    const prev = lastNotified.get(deviceId);
    if (prev && prev !== "ONLINE") {
        appendDeviceTimeline({
            deviceId,
            eventType: "heartbeat_recovered",
            title: "Heartbeat 復旧",
            detail: `${deviceId} が ONLINE に復帰`,
        });
    }
    lastNotified.set(deviceId, "ONLINE");
    return "ONLINE";
}
export function evaluateDeviceHeartbeatStatuses() {
    const db = getDatabase();
    const { warnSec, offlineSec } = getHeartbeatThresholds();
    const now = Date.now();
    const rows = db
        .prepare(`SELECT device_id, last_heartbeat_at, device_status, commissioning_status
       FROM devices
       WHERE last_heartbeat_at IS NOT NULL OR device_status = 'COMMISSIONING'`)
        .all();
    const changes = [];
    for (const d of rows) {
        if (d.commissioning_status === "draft" && !d.last_heartbeat_at) {
            if (d.device_status !== "COMMISSIONING") {
                updateDeviceStatusFields(d.device_id, "COMMISSIONING");
            }
            continue;
        }
        if (!d.last_heartbeat_at)
            continue;
        const elapsed = (now - new Date(d.last_heartbeat_at).getTime()) / 1000;
        const next = statusFromHeartbeatAge(elapsed, warnSec, offlineSec);
        const prev = lastNotified.get(d.device_id) ?? d.device_status;
        if (next !== prev) {
            updateDeviceStatusFields(d.device_id, next, {
                lastHeartbeat: d.last_heartbeat_at,
            });
            lastNotified.set(d.device_id, next);
            if (next === "WARNING") {
                appendDeviceTimeline({
                    deviceId: d.device_id,
                    eventType: "heartbeat_warning",
                    title: "Heartbeat 遅延",
                    detail: `${Math.floor(elapsed / 60)}分間未受信`,
                });
            }
            else if (next === "OFFLINE") {
                appendDeviceTimeline({
                    deviceId: d.device_id,
                    eventType: "heartbeat_offline",
                    title: "Heartbeat 切断",
                    detail: `${Math.floor(elapsed / 60)}分間未受信`,
                });
            }
            changes.push({ deviceId: d.device_id, status: next, elapsedSec: elapsed });
        }
    }
    return changes;
}
export function startDeviceHeartbeatMonitor(onStatusChange) {
    const intervalMs = Number(process.env.DEVICE_HEARTBEAT_POLL_MS ?? "30000");
    setInterval(() => {
        const changes = evaluateDeviceHeartbeatStatuses();
        for (const c of changes) {
            onStatusChange?.(c);
        }
    }, intervalMs);
    if (config.demoMode) {
        console.log("[DeviceHeartbeat] monitor started (demo mode)");
    }
    else {
        console.log("[DeviceHeartbeat] monitor started");
    }
}
