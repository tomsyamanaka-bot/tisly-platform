/**
 * Phase903 — Shelly Gen3 実機ブリッジ（mock 切替対応）
 */
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { deviceModeUsesMock, deviceModeUsesShelly } from "./device-mode-store.js";
import { recordDeviceHeartbeat } from "./device-heartbeat.js";

export interface ShellyBridgeConfig {
  id: string;
  deviceId: string;
  ip: string;
  name: string;
  location: string;
  enabled: boolean;
}

export interface ShellyTelemetry {
  relay: boolean;
  voltage: number;
  current: number;
  powerW: number;
  fetchedAt: string;
  mock: boolean;
}

const configs = new Map<string, ShellyBridgeConfig>();

function ensureShellyTable(): void {
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

export function listShellyBridgeConfigs(): ShellyBridgeConfig[] {
  ensureShellyTable();
  if (configs.size === 0) {
    const db = getDatabase();
    const rows = db
      .prepare(`SELECT id, device_id, ip, name, location, enabled FROM shelly_bridge_configs ORDER BY name`)
      .all() as Array<{
      id: string;
      device_id: string;
      ip: string;
      name: string;
      location: string | null;
      enabled: number;
    }>;
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

export function upsertShellyBridgeConfig(input: {
  deviceId: string;
  ip: string;
  name: string;
  location?: string;
  enabled?: boolean;
}): ShellyBridgeConfig {
  ensureShellyTable();
  const db = getDatabase();
  const existing = configs.get(input.deviceId);
  const id = existing?.id ?? uuid();
  const cfg: ShellyBridgeConfig = {
    id,
    deviceId: input.deviceId,
    ip: input.ip,
    name: input.name,
    location: input.location ?? "",
    enabled: input.enabled !== false,
  };
  db.prepare(
    `INSERT INTO shelly_bridge_configs (id, device_id, ip, name, location, enabled, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(device_id) DO UPDATE SET
       ip = excluded.ip, name = excluded.name, location = excluded.location,
       enabled = excluded.enabled, updated_at = datetime('now')`
  ).run(id, cfg.deviceId, cfg.ip, cfg.name, cfg.location, cfg.enabled ? 1 : 0);
  configs.set(cfg.deviceId, cfg);
  return cfg;
}

async function fetchRealShellyRpc(ip: string): Promise<Partial<ShellyTelemetry> | null> {
  const url = `http://${ip}/rpc/Shelly.GetStatus`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const sw = (data["switch:0"] ?? data.switch0) as Record<string, unknown> | undefined;
    const em = (data["em:0"] ?? data.em0) as Record<string, unknown> | undefined;
    return {
      relay: Boolean(sw?.output ?? sw?.on),
      voltage: Number(em?.voltage ?? sw?.voltage ?? 100),
      current: Number(em?.current ?? 0),
      powerW: Number(em?.act_power ?? em?.power ?? 0),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export function fetchShellyTelemetry(deviceId: string): ShellyTelemetry | null {
  const cfg = listShellyBridgeConfigs().find((c) => c.deviceId === deviceId && c.enabled);
  const now = new Date().toISOString();

  if (deviceModeUsesMock() && !deviceModeUsesShelly()) {
    return {
      relay: true,
      voltage: 100.1,
      current: 0.38,
      powerW: 38,
      fetchedAt: now,
      mock: true,
    };
  }

  if (!cfg) {
    if (deviceModeUsesMock()) {
      return { relay: true, voltage: 100, current: 0.4, powerW: 40, fetchedAt: now, mock: true };
    }
    return null;
  }

  if (deviceModeUsesMock()) {
    return { relay: true, voltage: 100.2, current: 0.42, powerW: 42, fetchedAt: now, mock: true };
  }

  return null;
}

export async function pollShellyDevices(): Promise<Array<{ deviceId: string; telemetry: ShellyTelemetry }>> {
  const results: Array<{ deviceId: string; telemetry: ShellyTelemetry }> = [];
  const now = new Date().toISOString();

  for (const cfg of listShellyBridgeConfigs()) {
    if (!cfg.enabled) continue;
    let tel: ShellyTelemetry;

    if (deviceModeUsesMock() && !deviceModeUsesShelly()) {
      tel = { relay: true, voltage: 100, current: 0.4, powerW: 40, fetchedAt: now, mock: true };
    } else if (deviceModeUsesShelly()) {
      const real = await fetchRealShellyRpc(cfg.ip);
      if (real) {
        tel = { ...real, relay: real.relay ?? false, voltage: real.voltage ?? 0, current: real.current ?? 0, powerW: real.powerW ?? 0, fetchedAt: now, mock: false };
        recordDeviceHeartbeat(cfg.deviceId, "shelly-gen3");
      } else {
        tel = { relay: false, voltage: 0, current: 0, powerW: 0, fetchedAt: now, mock: false };
      }
    } else {
      tel = { relay: true, voltage: 100, current: 0.4, powerW: 40, fetchedAt: now, mock: true };
    }

    const db = getDatabase();
    const row = db.prepare(`SELECT metadata_json FROM devices WHERE device_id = ?`).get(cfg.deviceId) as
      | { metadata_json: string | null }
      | undefined;
    const meta = row?.metadata_json ? JSON.parse(row.metadata_json) : {};
    meta.shelly_telemetry = tel;
    db.prepare(`UPDATE devices SET metadata_json = ?, updated_at = datetime('now') WHERE device_id = ?`).run(
      JSON.stringify(meta),
      cfg.deviceId
    );
    results.push({ deviceId: cfg.deviceId, telemetry: tel });
  }
  return results;
}
