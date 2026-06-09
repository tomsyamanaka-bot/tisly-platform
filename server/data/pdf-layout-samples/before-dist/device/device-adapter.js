/**
 * Phase901 — Device Adapter Layer
 * mock / esp / shelly / mixed を統一 API で扱う
 */
import { getDatabase } from "../db/database.js";
import { recordDeviceHeartbeat } from "./device-heartbeat.js";
import { deviceModeUsesEsp, deviceModeUsesMock, deviceModeUsesShelly, getDeviceMode, } from "./device-mode-store.js";
import { normalizeDeviceStatus } from "./device-state.js";
import { fetchShellyTelemetry, listShellyBridgeConfigs } from "./shelly-bridge.js";
function inferKind(deviceType, deviceId) {
    const t = deviceType.toLowerCase();
    const id = deviceId.toUpperCase();
    if (t.includes("shelly") || id.includes("SHELLY"))
        return "Shelly";
    if (t.includes("camera") || t.includes("cam") || id.includes("CAM"))
        return "Camera";
    if (t.includes("plc") || id.includes("PLC"))
        return "PLC";
    if (t.includes("esp") || t.includes("gateway") || id.includes("ESP"))
        return "ESP";
    return "Other";
}
export function listUnifiedDevices(customerCode) {
    const db = getDatabase();
    const mode = getDeviceMode();
    let sql = `SELECT d.device_id, d.label, d.device_type, d.device_status, d.last_seen, d.last_heartbeat_at,
                    d.metadata_json, c.customer_code
             FROM devices d
             LEFT JOIN customers c ON c.customer_id = d.customer_id`;
    const params = [];
    if (customerCode) {
        sql += ` WHERE UPPER(c.customer_code) = ?`;
        params.push(customerCode.toUpperCase());
    }
    sql += ` ORDER BY d.label, d.device_id`;
    const rows = db.prepare(sql).all(...params);
    const out = [];
    for (const r of rows) {
        const status = normalizeDeviceStatus(r.device_status);
        const kind = inferKind(r.device_type, r.device_id);
        let source = "db";
        if (kind === "ESP" && deviceModeUsesEsp())
            source = "esp";
        else if (kind === "Shelly" && deviceModeUsesShelly())
            source = "shelly";
        else if (deviceModeUsesMock())
            source = "mock";
        const view = {
            deviceId: r.device_id,
            name: r.label ?? r.device_id,
            kind,
            status,
            lastSeen: r.last_heartbeat_at ?? r.last_seen,
            customerCode: r.customer_code,
            source,
        };
        if (kind === "Shelly" && deviceModeUsesShelly()) {
            const tel = fetchShellyTelemetry(r.device_id);
            if (tel)
                view.telemetry = { ...tel };
        }
        out.push(view);
    }
    if (mode === "mock" && out.length === 0) {
        return getMockFallbackDevices();
    }
    return out;
}
function getMockFallbackDevices() {
    const now = new Date().toISOString();
    return [
        { deviceId: "DEMO-ESP-LIVING", name: "リビング ESP", kind: "ESP", status: "ONLINE", lastSeen: now, customerCode: "TOMS001", source: "mock" },
        { deviceId: "DEMO-ESP-ENTRANCE", name: "玄関 ESP", kind: "ESP", status: "ONLINE", lastSeen: now, customerCode: "TOMS001", source: "mock" },
        { deviceId: "TOMS001-SHELLY-01", name: "照明 Shelly", kind: "Shelly", status: "ONLINE", lastSeen: now, customerCode: "TOMS001", source: "mock", telemetry: { relay: true, voltage: 100.2, current: 0.42, powerW: 42 } },
        { deviceId: "TOMS001-CAM-01", name: "玄関カメラ", kind: "Camera", status: "ONLINE", lastSeen: now, customerCode: "TOMS001", source: "mock" },
    ];
}
export function getDeviceAdapterStatus() {
    const devices = listUnifiedDevices();
    return {
        deviceMode: getDeviceMode(),
        usesMock: deviceModeUsesMock(),
        usesEsp: deviceModeUsesEsp(),
        usesShelly: deviceModeUsesShelly(),
        deviceCount: devices.length,
        onlineCount: devices.filter((d) => d.status === "ONLINE").length,
        warningCount: devices.filter((d) => d.status === "WARNING").length,
        offlineCount: devices.filter((d) => d.status === "OFFLINE").length,
        shellyConfigs: listShellyBridgeConfigs(),
    };
}
/** 共通 ingest — ESP heartbeat 等 */
export function ingestDeviceSignal(deviceId, platform, payload) {
    const mode = getDeviceMode();
    if (mode === "mock" && !deviceId.startsWith("DEMO-") && !deviceId.includes("-ESP-")) {
        /* mixed でもデモ ID は通す */
    }
    const status = recordDeviceHeartbeat(deviceId, platform);
    if (payload && Object.keys(payload).length > 0) {
        const db = getDatabase();
        const row = db.prepare(`SELECT metadata_json FROM devices WHERE device_id = ?`).get(deviceId);
        const meta = row?.metadata_json ? JSON.parse(row.metadata_json) : {};
        meta.last_signal = { at: new Date().toISOString(), ...payload };
        db.prepare(`UPDATE devices SET metadata_json = ?, updated_at = datetime('now') WHERE device_id = ?`).run(JSON.stringify(meta), deviceId);
    }
    return { status, mode };
}
