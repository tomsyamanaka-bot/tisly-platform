/**
 * Phase903 / Phase981 — Shelly Gen3 実機ブリッジ（SHELLY_MODE mock/real 連携）
 */
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { deviceModeUsesMock, deviceModeUsesShelly } from "./device-mode-store.js";
import { recordDeviceHeartbeat } from "./device-heartbeat.js";
import { getShellyEnvMode, fetchShellyDeviceStatus } from "./shelly-real-client.js";
import { config } from "../config.js";
const configs = new Map();
function ensureShellyTable() {
    const db = getDatabase();
    db.exec(`
    CREATE TABLE IF NOT EXISTS shelly_bridge_configs (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL UNIQUE,
      ip TEXT NOT NULL,
      name TEXT NOT NULL,
      location TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
}
export function listShellyBridgeConfigs() {
    ensureShellyTable();
    if (configs.size === 0) {
        const db = getDatabase();
        const rows = db
            .prepare(`SELECT id, device_id, ip, name, location, enabled FROM shelly_bridge_configs ORDER BY name`)
            .all();
        for (const r of rows) {
            configs.set(r.device_id, {
                id: r.id,
                deviceId: r.device_id,
                ip: r.ip,
                name: r.name,
                location: r.location ?? "",
                enabled: !!r.enabled,
            });
        }
    }
    return [...configs.values()];
}
export function upsertShellyBridgeConfig(input) {
    ensureShellyTable();
    const db = getDatabase();
    const existing = configs.get(input.deviceId);
    const id = existing?.id ?? uuid();
    const cfg = {
        id,
        deviceId: input.deviceId,
        ip: input.ip,
        name: input.name,
        location: input.location ?? "",
        enabled: input.enabled !== false,
    };
    db.prepare(`INSERT INTO shelly_bridge_configs (id, device_id, ip, name, location, enabled, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(device_id) DO UPDATE SET
       ip = excluded.ip, name = excluded.name, location = excluded.location,
       enabled = excluded.enabled, updated_at = datetime('now')`).run(id, cfg.deviceId, cfg.ip, cfg.name, cfg.location, cfg.enabled ? 1 : 0);
    configs.set(cfg.deviceId, cfg);
    return cfg;
}
async function fetchRealShellyRpc(ip) {
    const url = `http://${ip}/rpc/Shelly.GetStatus`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok)
            return null;
        const data = (await res.json());
        const sw = (data["switch:0"] ?? data.switch0);
        const em = (data["em:0"] ?? data.em0);
        return {
            relay: Boolean(sw?.output ?? sw?.on),
            voltage: Number(em?.voltage ?? sw?.voltage ?? 100),
            current: Number(em?.current ?? 0),
            powerW: Number(em?.act_power ?? em?.power ?? 0),
        };
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(t);
    }
}
function statusToTelemetry(status, baseUrl) {
    const now = new Date().toISOString();
    return {
        online: status.online,
        relay: status.relay ?? false,
        voltage: status.voltage ?? 0,
        current: status.current ?? 0,
        powerW: status.powerW ?? 0,
        uptimeSec: status.uptimeSec,
        wifiRssi: status.wifiRssi,
        temperatureC: status.temperatureC,
        fetchedAt: now,
        mock: status.mock,
        connectionError: status.connectionError,
        envMode: status.mode,
    };
}
export async function fetchShellyTelemetryAsync(deviceId) {
    const cfg = listShellyBridgeConfigs().find((c) => c.deviceId === deviceId && c.enabled);
    const now = new Date().toISOString();
    const envMode = getShellyEnvMode();
    if (envMode === "mock" || (deviceModeUsesMock() && !deviceModeUsesShelly())) {
        return {
            online: true,
            relay: true,
            voltage: 100.1,
            current: 0.38,
            powerW: 38,
            fetchedAt: now,
            mock: true,
            envMode: "mock",
        };
    }
    if (!cfg && !config.shelly.baseUrl) {
        if (deviceModeUsesMock()) {
            return {
                online: true,
                relay: true,
                voltage: 100,
                current: 0.4,
                powerW: 40,
                fetchedAt: now,
                mock: true,
                envMode: "mock",
            };
        }
        return null;
    }
    const baseUrl = cfg ? `http://${cfg.ip}` : config.shelly.baseUrl;
    const status = await fetchShellyDeviceStatus(baseUrl ?? undefined);
    if (!status.online && !status.mock) {
        return {
            online: false,
            relay: false,
            voltage: 0,
            current: 0,
            powerW: 0,
            fetchedAt: now,
            mock: false,
            connectionError: status.connectionError ?? "real接続失敗",
            envMode: "real",
        };
    }
    return statusToTelemetry(status, baseUrl ?? undefined);
}
/** 同期 API 互換（キャッシュ / mock のみ即返却） */
export function fetchShellyTelemetry(deviceId) {
    const envMode = getShellyEnvMode();
    const now = new Date().toISOString();
    if (envMode === "mock" || (deviceModeUsesMock() && !deviceModeUsesShelly())) {
        return {
            online: true,
            relay: true,
            voltage: 100.1,
            current: 0.38,
            powerW: 38,
            fetchedAt: now,
            mock: true,
            envMode: "mock",
        };
    }
    const cfg = listShellyBridgeConfigs().find((c) => c.deviceId === deviceId && c.enabled);
    if (!cfg && !config.shelly.baseUrl) {
        return deviceModeUsesMock()
            ? { online: true, relay: true, voltage: 100, current: 0.4, powerW: 40, fetchedAt: now, mock: true, envMode: "mock" }
            : null;
    }
    return {
        online: false,
        relay: false,
        voltage: 0,
        current: 0,
        powerW: 0,
        fetchedAt: now,
        mock: false,
        connectionError: "real接続失敗（POST /api/demo-kit/shelly/poll で更新）",
        envMode: "real",
    };
}
export async function getShellyConnectionSummary() {
    const envMode = getShellyEnvMode();
    if (envMode === "mock") {
        const tel = await fetchShellyTelemetryAsync("lab");
        return { envMode, online: true, message: "SHELLY_MODE=mock", telemetry: tel };
    }
    const status = await fetchShellyDeviceStatus();
    if (!status.online) {
        return {
            envMode: "real",
            online: false,
            message: status.connectionError ?? "real接続失敗",
            telemetry: statusToTelemetry(status),
        };
    }
    return {
        envMode: "real",
        online: true,
        message: `real 接続 OK (${status.baseUrl ?? "—"})`,
        telemetry: statusToTelemetry(status),
    };
}
export async function pollShellyDevices() {
    const results = [];
    const now = new Date().toISOString();
    for (const cfg of listShellyBridgeConfigs()) {
        if (!cfg.enabled)
            continue;
        let tel;
        if (deviceModeUsesMock() && !deviceModeUsesShelly()) {
            tel = { online: true, relay: true, voltage: 100, current: 0.4, powerW: 40, fetchedAt: now, mock: true };
        }
        else if (deviceModeUsesShelly()) {
            const envMode = getShellyEnvMode();
            if (envMode === "real") {
                const baseUrl = `http://${cfg.ip}`;
                const status = await fetchShellyDeviceStatus(baseUrl);
                if (status.online) {
                    tel = statusToTelemetry(status, baseUrl);
                    recordDeviceHeartbeat(cfg.deviceId, "shelly-gen3");
                }
                else {
                    tel = {
                        online: false,
                        relay: false,
                        voltage: 0,
                        current: 0,
                        powerW: 0,
                        fetchedAt: now,
                        mock: false,
                        connectionError: status.connectionError ?? "real接続失敗",
                        envMode: "real",
                    };
                }
            }
            else {
                const real = await fetchRealShellyRpc(cfg.ip);
                if (real) {
                    tel = {
                        online: true,
                        ...real,
                        relay: real.relay ?? false,
                        voltage: real.voltage ?? 0,
                        current: real.current ?? 0,
                        powerW: real.powerW ?? 0,
                        fetchedAt: now,
                        mock: false,
                        envMode: "mock",
                    };
                    recordDeviceHeartbeat(cfg.deviceId, "shelly-gen3");
                }
                else {
                    tel = {
                        online: false,
                        relay: false,
                        voltage: 0,
                        current: 0,
                        powerW: 0,
                        fetchedAt: now,
                        mock: false,
                        connectionError: "real接続失敗",
                        envMode: "real",
                    };
                }
            }
        }
        else {
            tel = { online: true, relay: true, voltage: 100, current: 0.4, powerW: 40, fetchedAt: now, mock: true };
        }
        const db = getDatabase();
        const row = db.prepare(`SELECT metadata_json FROM devices WHERE device_id = ?`).get(cfg.deviceId);
        const meta = row?.metadata_json ? JSON.parse(row.metadata_json) : {};
        meta.shelly_telemetry = tel;
        db.prepare(`UPDATE devices SET metadata_json = ?, updated_at = datetime('now') WHERE device_id = ?`).run(JSON.stringify(meta), cfg.deviceId);
        results.push({ deviceId: cfg.deviceId, telemetry: tel });
    }
    return results;
}
