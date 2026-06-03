import { getDatabase } from "../db/database.js";
import { ensureTenant } from "../provisioning/site-provisioner.js";
import type {
  CustomerBrandingRow,
  CustomerPlan,
  CustomerRow,
  CustomerSiteRow,
  CustomerStatus,
  DeviceTypePro,
} from "./types.js";

export function getCustomerByCode(code: string): CustomerRow | undefined {
  return getDatabase()
    .prepare(
      `SELECT customer_id, customer_code, customer_name, plan, status, tenant_id, created_at, updated_at
       FROM customers WHERE customer_code = ? COLLATE NOCASE AND status != 'deleted'`
    )
    .get(code.toUpperCase()) as CustomerRow | undefined;
}

export function getCustomerById(id: string): CustomerRow | undefined {
  return getDatabase()
    .prepare(
      `SELECT customer_id, customer_code, customer_name, plan, status, tenant_id, created_at, updated_at
       FROM customers WHERE customer_id = ? AND status != 'deleted'`
    )
    .get(id) as CustomerRow | undefined;
}

export function listCustomers(activeOnly = true): CustomerRow[] {
  const sql = activeOnly
    ? `SELECT customer_id, customer_code, customer_name, plan, status, tenant_id, created_at, updated_at
       FROM customers WHERE status = 'active' ORDER BY customer_name`
    : `SELECT customer_id, customer_code, customer_name, plan, status, tenant_id, created_at, updated_at
       FROM customers ORDER BY customer_name`;
  return getDatabase().prepare(sql).all() as CustomerRow[];
}

export function getBranding(customerId: string): CustomerBrandingRow | null {
  const row = getDatabase()
    .prepare(
      `SELECT customer_id, logo_url, company_color, company_name FROM customer_branding WHERE customer_id = ?`
    )
    .get(customerId) as CustomerBrandingRow | undefined;
  return row ?? null;
}

export function listSitesForCustomer(customerId: string): CustomerSiteRow[] {
  return getDatabase()
    .prepare(
      `SELECT id as site_id, customer_id, name as site_name, address, timezone, lat, lng
       FROM sites WHERE customer_id = ? OR tenant_id = (SELECT tenant_id FROM customers WHERE customer_id = ?)
       ORDER BY name`
    )
    .all(customerId, customerId) as CustomerSiteRow[];
}

export interface CustomerDeviceView {
  deviceId: string;
  id: string;
  deviceType: string;
  label: string | null;
  siteId: string | null;
  serialNumber: string | null;
  firmwareVersion: string | null;
  lastSeen: string | null;
  firstSeen?: string | null;
  heartbeatStatus: string;
  deviceStatus?: string;
  online: boolean;
}

function isOnline(lastSeen: string | null, heartbeatStatus: string): boolean {
  if (heartbeatStatus === "ok" || heartbeatStatus === "online") return true;
  if (!lastSeen) return false;
  const t = Date.parse(lastSeen);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < 5 * 60 * 1000;
}

export function listDevicesForCustomer(customerId: string): CustomerDeviceView[] {
  const customer = getCustomerById(customerId);
  if (!customer) return [];
  const rows = getDatabase()
    .prepare(
      `SELECT id, device_id, device_type, label, site_id, customer_id, serial_number,
              firmware_version, last_seen, last_heartbeat_at, first_seen, heartbeat_status,
              device_status, metadata_json
       FROM devices
       WHERE customer_id = ? OR json_extract(metadata_json, '$.tenant_id') = ?
       ORDER BY device_type, label`
    )
    .all(customerId, customer.tenant_id ?? customerId) as Array<{
    id: string;
    device_id: string;
    device_type: string;
    label: string | null;
    site_id: string | null;
    customer_id: string | null;
    serial_number: string | null;
    firmware_version: string | null;
    last_seen: string | null;
    last_heartbeat_at: string | null;
    first_seen: string | null;
    heartbeat_status: string;
    device_status: string | null;
    metadata_json: string | null;
  }>;

  return rows.map((r) => {
    const lastSeen = r.last_seen ?? r.last_heartbeat_at;
    const deviceStatus = (r.device_status ?? "UNKNOWN").toUpperCase();
    const online =
      deviceStatus === "ONLINE" ||
      (deviceStatus !== "OFFLINE" && isOnline(lastSeen, r.heartbeat_status));
    return {
      id: r.id,
      deviceId: r.device_id,
      deviceType: r.device_type,
      label: r.label,
      siteId: r.site_id,
      serialNumber: r.serial_number,
      firmwareVersion: r.firmware_version,
      lastSeen,
      firstSeen: r.first_seen,
      heartbeatStatus: r.heartbeat_status,
      deviceStatus,
      online,
    };
  });
}

export function upsertCustomer(input: {
  customerId: string;
  customerCode: string;
  customerName: string;
  plan: CustomerPlan;
  status?: CustomerStatus;
  tenantId?: string;
  branding?: { logoUrl?: string; companyColor?: string; companyName?: string };
}): CustomerRow {
  const db = getDatabase();
  const tenantId = input.tenantId ?? input.customerId;
  ensureTenant(tenantId, input.customerName);
  db.prepare(
    `INSERT INTO customers (customer_id, customer_code, customer_name, plan, status, tenant_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(customer_id) DO UPDATE SET
       customer_code = excluded.customer_code,
       customer_name = excluded.customer_name,
       plan = excluded.plan,
       status = excluded.status,
       tenant_id = excluded.tenant_id,
       updated_at = datetime('now')`
  ).run(
    input.customerId,
    input.customerCode.toUpperCase(),
    input.customerName,
    input.plan,
    input.status ?? "active",
    tenantId
  );
  if (input.branding) {
    db.prepare(
      `INSERT INTO customer_branding (customer_id, logo_url, company_color, company_name, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(customer_id) DO UPDATE SET
         logo_url = excluded.logo_url,
         company_color = excluded.company_color,
         company_name = excluded.company_name,
         updated_at = datetime('now')`
    ).run(
      input.customerId,
      input.branding.logoUrl ?? null,
      input.branding.companyColor ?? "#1a7f37",
      input.branding.companyName ?? input.customerName
    );
  }
  return getCustomerById(input.customerId)!;
}

export function ensureDemoSite(
  customerId: string,
  siteId: string,
  siteName: string,
  address?: string
): void {
  const db = getDatabase();
  const customer = getCustomerById(customerId);
  if (!customer) return;
  const existing = db.prepare("SELECT id FROM sites WHERE id = ?").get(siteId);
  if (existing) {
    db.prepare(
      `UPDATE sites SET customer_id = ?, name = ?, address = ?, timezone = COALESCE(timezone, 'Asia/Tokyo')
       WHERE id = ?`
    ).run(customerId, siteName, address ?? null, siteId);
    return;
  }
  db.prepare(
    `INSERT INTO sites (id, tenant_id, customer_id, name, address, timezone, status)
     VALUES (?, ?, ?, ?, ?, 'Asia/Tokyo', 'active')`
  ).run(siteId, customer.tenant_id ?? customerId, customerId, siteName, address ?? null);
}

export function ensureDemoDevice(input: {
  id: string;
  customerId: string;
  siteId: string;
  deviceId: string;
  deviceType: DeviceTypePro;
  label: string;
  serialNumber?: string;
  firmwareVersion?: string;
  online?: boolean;
}): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  const status = input.online !== false ? "ok" : "offline";
  const existing = db.prepare("SELECT id FROM devices WHERE id = ? OR device_id = ?").get(input.id, input.deviceId);
  if (existing) {
    db.prepare(
      `UPDATE devices SET customer_id = ?, site_id = ?, device_type = ?, label = ?,
        serial_number = ?, firmware_version = ?, last_seen = ?, last_heartbeat_at = ?,
        heartbeat_status = ?, metadata_json = ?, updated_at = datetime('now')
       WHERE id = ? OR device_id = ?`
    ).run(
      input.customerId,
      input.siteId,
      input.deviceType,
      input.label,
      input.serialNumber ?? null,
      input.firmwareVersion ?? "1.0.0",
      now,
      now,
      status,
      JSON.stringify({ tenant_id: input.customerId, site_id: input.siteId }),
      input.id,
      input.deviceId
    );
    return;
  }
  db.prepare(
    `INSERT INTO devices (id, device_type, platform, device_id, label, customer_id, site_id,
      serial_number, firmware_version, last_seen, last_heartbeat_at, heartbeat_status, metadata_json)
     VALUES (?, ?, 'pro-remote', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.deviceType,
    input.deviceId,
    input.label,
    input.customerId,
    input.siteId,
    input.serialNumber ?? `SN-${input.deviceId}`,
    input.firmwareVersion ?? "1.0.0",
    now,
    now,
    status,
    JSON.stringify({ tenant_id: input.customerId, site_id: input.siteId })
  );
}

export function getDashboardSummary(customerId: string): {
  overallStatus: "normal" | "warning" | "abnormal";
  deviceCount: number;
  onlineCount: number;
  offlineCount: number;
  notificationCount: number;
  lastEvent: { at: string; type: string; message: string } | null;
} {
  const devices = listDevicesForCustomer(customerId);
  const onlineCount = devices.filter((d) => d.online).length;
  const offlineCount = devices.length - onlineCount;
  const customer = getCustomerById(customerId);
  const tenantId = customer?.tenant_id ?? customerId;

  const db = getDatabase();
  let notificationCount = 0;
  try {
    notificationCount = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM notification_logs
           WHERE status IN ('pending', 'sent') AND created_at > datetime('now', '-24 hours')`
        )
        .get() as { c: number }
    ).c;
  } catch {
    notificationCount = 0;
  }

  const lastEventRow = db
    .prepare(
      `SELECT created_at, event_type, COALESCE(message, title, '') as message
       FROM events WHERE tenant_id = ? OR site_id IN (SELECT id FROM sites WHERE customer_id = ?)
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(tenantId, customerId) as
    | { created_at: string; event_type: string; message: string }
    | undefined;

  const alarmCount = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM events
         WHERE (tenant_id = ? OR site_id IN (SELECT id FROM sites WHERE customer_id = ?))
           AND severity IN ('critical', 'alarm')
           AND created_at > datetime('now', '-1 hour')`
      )
      .get(tenantId, customerId) as { c: number }
  ).c;

  let overallStatus: "normal" | "warning" | "abnormal" = "normal";
  if (alarmCount > 0 || (devices.length > 0 && offlineCount > devices.length / 2)) {
    overallStatus = "abnormal";
  } else if (offlineCount > 0) {
    overallStatus = "warning";
  }

  return {
    overallStatus,
    deviceCount: devices.length,
    onlineCount,
    offlineCount,
    notificationCount,
    lastEvent: lastEventRow
      ? { at: lastEventRow.created_at, type: lastEventRow.event_type, message: lastEventRow.message }
      : null,
  };
}

export function customerUrls(code: string): {
  customer: string;
  tv: string;
  admin: string;
} {
  const c = code.toUpperCase();
  return {
    customer: `/customer/${c}`,
    tv: `/tv/${c}`,
    admin: `/admin/${c}`,
  };
}
