import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getCustomerByCode } from "../customer/customer-store.js";
import { normalizeDeviceStatus } from "../device/device-state.js";

export interface ShellyDeviceView {
  deviceId: string;
  label: string | null;
  deviceType: string;
  siteId: string | null;
  status: string;
  online: boolean;
  lastSeen: string | null;
}

function isShellyType(deviceType: string): boolean {
  return deviceType.toLowerCase().includes("shelly");
}

export function listShellyDevices(customerCode: string): ShellyDeviceView[] {
  const customer = getCustomerByCode(customerCode);
  if (!customer) return [];
  const rows = getDatabase()
    .prepare(
      `SELECT device_id, label, device_type, site_id, device_status, last_seen, heartbeat_status
       FROM devices WHERE customer_id = ? ORDER BY label, device_id`
    )
    .all(customer.customer_id) as Array<{
    device_id: string;
    label: string | null;
    device_type: string;
    site_id: string | null;
    device_status: string | null;
    last_seen: string | null;
    heartbeat_status: string | null;
  }>;
  return rows
    .filter((r) => isShellyType(r.device_type))
    .map((r) => {
      const status = normalizeDeviceStatus(r.device_status);
      const online =
        status === "ONLINE" ||
        (status !== "OFFLINE" &&
          !!r.last_seen &&
          Date.now() - new Date(r.last_seen).getTime() < 5 * 60 * 1000);
      return {
        deviceId: r.device_id,
        label: r.label,
        deviceType: r.device_type,
        siteId: r.site_id,
        status,
        online,
        lastSeen: r.last_seen,
      };
    });
}

export function rebootShellyDevice(deviceId: string, actorId?: string): {
  ok: boolean;
  actionId: string;
  deviceId: string;
  note: string;
} {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT device_id, device_type, metadata_json, site_id FROM devices WHERE device_id = ?`)
    .get(deviceId) as {
    device_id: string;
    device_type: string;
    metadata_json: string | null;
    site_id: string | null;
  } | undefined;
  if (!row || !isShellyType(row.device_type)) {
    throw new Error("Shelly device not found");
  }
  const actionId = uuid();
  const meta = row.metadata_json ? JSON.parse(row.metadata_json) : {};
  meta.last_shelly_reboot = {
    actionId,
    requestedAt: new Date().toISOString(),
    actorId: actorId ?? "maintenance_api",
    status: "pending",
  };
  db.prepare(`UPDATE devices SET metadata_json = ?, updated_at = datetime('now') WHERE device_id = ?`).run(
    JSON.stringify(meta),
    deviceId
  );
  db.prepare(
    `INSERT INTO recovery_runs (id, rule_id, device_id, incident_id, status, steps_json, started_at, completed_at)
     VALUES (?, ?, ?, ?, 'completed', ?, datetime('now'), datetime('now'))`
  ).run(
    actionId,
    "shelly-maintenance-reboot",
    deviceId,
    null,
    JSON.stringify([{ step: "shelly_reboot", actor: actorId ?? "maintenance", ok: true }])
  );
  return {
    ok: true,
    actionId,
    deviceId,
    note: "Shelly 再起動要求を記録しました（MQTT/relay 経由で適用）",
  };
}
