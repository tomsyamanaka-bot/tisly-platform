import { getDatabase } from "../db/database.js";
import { listDevicesForCustomer, listSitesForCustomer } from "../customer/customer-store.js";
import { getCustomerByCode } from "../customer/customer-store.js";

export interface MapSiteMarker {
  siteId: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  deviceCount: number;
  status: "ok" | "warning" | "alarm";
  severity: "info" | "warning" | "critical";
  coordinatesTodo?: string;
}

export interface MapZoneView {
  zoneId: string;
  name: string;
  siteId: string;
  siteName: string;
  deviceCount: number;
}

export interface OpsMapPayload {
  customerCode: string;
  sites: MapSiteMarker[];
  zones: MapZoneView[];
  devices: Array<{
    deviceId: string;
    label: string | null;
    siteId: string | null;
    siteName: string | null;
    zone: string | null;
    deviceType: string;
    heartbeatStatus: string;
    online: boolean;
    severity: string;
    coordinates: { lat: number | null; lng: number | null; placeholder: boolean };
  }>;
  floorPlanUploadTodo: "Upload site floor plans for precise coordinates (Phase 321+)",
}

function siteSeverity(offline: number, total: number): MapSiteMarker["severity"] {
  if (total === 0) return "info";
  if (offline > total / 2) return "critical";
  if (offline > 0) return "warning";
  return "info";
}

export function buildOpsMap(customerCode: string): OpsMapPayload | null {
  const customer = getCustomerByCode(customerCode);
  if (!customer) return null;

  const sites = listSitesForCustomer(customer.customer_id);
  const devices = listDevicesForCustomer(customer.customer_id);
  const db = getDatabase();

  const siteNameById = new Map(sites.map((s) => [s.site_id, s.site_name]));

  const zoneRows = db
    .prepare(
      `SELECT z.id as zone_id, z.name, z.site_id, s.name as site_name
       FROM zones z
       JOIN sites s ON s.id = z.site_id
       WHERE s.customer_id = ? OR s.tenant_id = ?
       ORDER BY z.name`
    )
    .all(customer.customer_id, customer.tenant_id ?? customer.customer_id) as Array<{
    zone_id: string;
    name: string;
    site_id: string;
    site_name: string;
  }>;

  const markers: MapSiteMarker[] = sites.map((site, idx) => {
    const siteDevices = devices.filter((d) => d.siteId === site.site_id);
    const offline = siteDevices.filter((d) => !d.online).length;
    const lat = site.lat ?? placeholderLat(idx);
    const lng = site.lng ?? placeholderLng(idx);
    return {
      siteId: site.site_id,
      name: site.site_name,
      address: site.address,
      lat,
      lng,
      deviceCount: siteDevices.length,
      status: offline > 0 ? (offline > siteDevices.length / 2 ? "alarm" : "warning") : "ok",
      severity: siteSeverity(offline, siteDevices.length),
      coordinatesTodo: site.lat == null ? "placeholder" : undefined,
    };
  });

  const zones: MapZoneView[] = zoneRows.map((z) => ({
    zoneId: z.zone_id,
    name: z.name,
    siteId: z.site_id,
    siteName: z.site_name,
    deviceCount: devices.filter((d) => d.siteId === z.site_id).length,
  }));

  return {
    customerCode: customer.customer_code,
    sites: markers,
    zones,
    devices: devices.map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label,
      siteId: d.siteId,
      siteName: d.siteId ? siteNameById.get(d.siteId) ?? null : null,
      zone: null,
      deviceType: d.deviceType,
      heartbeatStatus: d.heartbeatStatus,
      online: d.online,
      severity: d.online ? "info" : "warning",
      coordinates: {
        lat: d.siteId ? markers.find((m) => m.siteId === d.siteId)?.lat ?? placeholderLat(i) : placeholderLat(i),
        lng: d.siteId ? markers.find((m) => m.siteId === d.siteId)?.lng ?? placeholderLng(i) : placeholderLng(i),
        placeholder: true,
      },
    })),
    floorPlanUploadTodo: "Upload site floor plans for precise coordinates (Phase 321+)",
  };
}

function placeholderLat(index: number): number {
  return 35.68 + (index % 5) * 0.02;
}

function placeholderLng(index: number): number {
  return 139.76 + (index % 5) * 0.015;
}

export function buildOpsAlarms(customerCode: string, limit = 50) {
  const customer = getCustomerByCode(customerCode);
  if (!customer) return null;
  const db = getDatabase();
  const alarms = db
    .prepare(
      `SELECT * FROM events
       WHERE event_type IN ('intrusion', 'perimeter', 'window_open', 'door_open', 'estop', 'motion', 'alarm')
         AND (tenant_id = ? OR site_id IN (SELECT id FROM sites WHERE customer_id = ?))
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(customer.tenant_id ?? customer.customer_id, customer.customer_id, limit);

  const counts = { critical: 0, alarm: 0, warning: 0 };
  for (const a of alarms as Array<{ severity?: string }>) {
    const sev = (a.severity ?? "warning").toLowerCase();
    if (sev === "critical") counts.critical++;
    else if (sev === "alarm") counts.alarm++;
    else counts.warning++;
  }
  return { customerCode, alarms, counts };
}

export function buildOpsDevices(customerCode: string) {
  const customer = getCustomerByCode(customerCode);
  if (!customer) return null;
  const devices = listDevicesForCustomer(customer.customer_id);
  const sites = listSitesForCustomer(customer.customer_id);
  const siteMap = new Map(sites.map((s) => [s.site_id, s.site_name]));
  return {
    customerCode,
    devices: devices.map((d) => ({
      ...d,
      siteName: d.siteId ? siteMap.get(d.siteId) : null,
      zone: null,
      anomalyCount: 0,
      lastHeartbeatAt: d.lastSeen,
    })),
  };
}

export function buildOpsTv(customerCode: string) {
  const customer = getCustomerByCode(customerCode);
  if (!customer) return null;
  const db = getDatabase();
  const devices = db
    .prepare(
      `SELECT * FROM tv_devices
       WHERE tenant_id = ? OR site_id IN (SELECT id FROM sites WHERE customer_id = ?)
       ORDER BY updated_at DESC`
    )
    .all(customer.tenant_id ?? customer.customer_id, customer.customer_id);
  return { customerCode, devices };
}

export function buildOpsQnap(customerCode: string) {
  const customer = getCustomerByCode(customerCode);
  if (!customer) return null;
  const db = getDatabase();
  let archives: unknown[] = [];
  try {
    archives = db
      .prepare(
        `SELECT * FROM qnap_archives
         WHERE customer_id = ? OR tenant_id = ?
         ORDER BY created_at DESC LIMIT 20`
      )
      .all(customer.customer_id, customer.tenant_id ?? customer.customer_id);
  } catch {
    archives = [];
  }
  return { customerCode, archives, mode: process.env.QNAP_MODE ?? "mock" };
}
