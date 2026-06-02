import { v4 as uuid } from "uuid";
import type Database from "better-sqlite3";
import { getDatabase } from "../db/database.js";
import { config } from "../config.js";
import type { UnifiedEvent } from "../event/unified-event.js";
import { getNotificationService } from "../notification/notification-service.js";
import { unifiedToTislyEvent } from "../event/unified-event.js";
import { broadcast } from "../ws/hub.js";
import {
  DEMO_SITES,
  DEMO_ZONES,
  DEVICE_TEMPLATES,
  type DemoDeviceKind,
} from "./demo-sites.js";

export interface DemoVirtualDevice {
  deviceId: string;
  siteId: string;
  siteName: string;
  kind: DemoDeviceKind;
  label: string;
  zone: string;
  platform: string;
}

const EVENT_SCENARIOS: Array<{
  event_type: string;
  severity: "info" | "warning" | "alarm" | "critical";
  message: string;
  weight: number;
}> = [
  { event_type: "motion", message: "人感検知", severity: "warning", weight: 18 },
  { event_type: "window_open", message: "窓開検知", severity: "warning", weight: 12 },
  { event_type: "intrusion", message: "侵入検知 — 警戒中", severity: "alarm", weight: 8 },
  { event_type: "perimeter", message: "外周ビーム作動", severity: "alarm", weight: 6 },
  { event_type: "temperature_high", message: "温度上昇（閾値超過）", severity: "warning", weight: 10 },
  { event_type: "heartbeat", message: "デバイス正常 — heartbeat", severity: "info", weight: 28 },
  { event_type: "recovery", message: "復旧 — 通常監視へ", severity: "info", weight: 14 },
  { event_type: "door_open", message: "ドア開", severity: "warning", weight: 8 },
  { event_type: "estop", message: "非常停止", severity: "critical", weight: 2 },
  { event_type: "camera_motion", message: "カメラ動体検知", severity: "warning", weight: 4 },
];

function pickWeighted<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1]!;
}

let virtualDevices: DemoVirtualDevice[] = [];

export function getVirtualDevices(): DemoVirtualDevice[] {
  return [...virtualDevices];
}

export function buildVirtualDevices(): DemoVirtualDevice[] {
  const list: DemoVirtualDevice[] = [];
  for (const site of DEMO_SITES) {
    const zonesForSite = DEMO_ZONES.filter((z) => z.siteIds.includes(site.id));
    for (const tmpl of DEVICE_TEMPLATES) {
      const zone = zonesForSite[Math.floor(Math.random() * zonesForSite.length)]?.name ?? "外周";
      const deviceId = `${site.id}-${tmpl.suffix}-01`;
      list.push({
        deviceId,
        siteId: site.id,
        siteName: site.name,
        kind: tmpl.kind,
        label: `${tmpl.labelPrefix} — ${site.name}`,
        zone,
        platform: tmpl.platform,
      });
    }
  }
  virtualDevices = list;
  return list;
}

export function seedDemoDevices(db: Database.Database = getDatabase()): number {
  const devices = buildVirtualDevices();
  const insert = db.prepare(
    `INSERT INTO devices (id, device_type, platform, device_id, label, last_heartbeat_at, heartbeat_status, metadata_json)
     VALUES (?, ?, ?, ?, ?, datetime('now'), 'ok', ?)
     ON CONFLICT(id) DO UPDATE SET
       device_type = excluded.device_type,
       platform = excluded.platform,
       label = excluded.label,
       last_heartbeat_at = excluded.last_heartbeat_at,
       heartbeat_status = excluded.heartbeat_status,
       metadata_json = excluded.metadata_json,
       updated_at = datetime('now')`
  );

  let count = 0;
  for (const d of devices) {
    const id = d.deviceId;
    insert.run(
      id,
      d.kind,
      d.platform,
      d.deviceId,
      d.label,
      JSON.stringify({ site_id: d.siteId, site_name: d.siteName, zone: d.zone, demo: true })
    );
    count++;
  }
  return count;
}

export function pickRandomDevice(): DemoVirtualDevice {
  if (virtualDevices.length === 0) buildVirtualDevices();
  return virtualDevices[Math.floor(Math.random() * virtualDevices.length)]!;
}

export function createRandomUnifiedEvent(): UnifiedEvent {
  const device = pickRandomDevice();
  const scenario = pickWeighted(EVENT_SCENARIOS);
  const sourceType =
    device.kind === "esp32"
      ? "esp32"
      : device.kind === "rp2350"
        ? "rp2350"
        : device.kind === "plc"
          ? "plc"
          : device.kind === "camera"
            ? "system"
            : "node-red";

  return {
    event_id: uuid(),
    tenant_id: config.defaultTenantId,
    site_id: device.siteId,
    device_id: device.deviceId,
    source_type: sourceType as UnifiedEvent["source_type"],
    event_type: scenario.event_type,
    severity: scenario.severity,
    zone: device.zone,
    message: `[${device.siteName}] ${scenario.message} — ${device.label}`,
    payload: {
      demo: true,
      site_name: device.siteName,
      device_kind: device.kind,
    },
    created_at: new Date().toISOString(),
  };
}

export async function emitDemoEvent(unified?: UnifiedEvent): Promise<string> {
  const u = unified ?? createRandomUnifiedEvent();
  const event = unifiedToTislyEvent(u);
  event.siteId = u.site_id;
  event.tenantId = u.tenant_id;
  event.sourceType = u.source_type;
  event.zone = u.zone;

  const service = getNotificationService();
  const id = await service.processEvent(event);

  const db = getDatabase();
  const hbStatus =
    u.severity === "critical" || u.severity === "alarm"
      ? "alarm"
      : u.severity === "warning"
        ? "warning"
        : "ok";
  db.prepare(
    `UPDATE devices SET last_heartbeat_at = datetime('now'), heartbeat_status = ? WHERE device_id = ?`
  ).run(hbStatus, u.device_id);

  const wsType =
    u.severity === "alarm" || u.severity === "critical" ? "alarm" : "event";
  broadcast({
    type: wsType,
    payload: {
      ...u,
      id,
      deviceName: u.device_id,
      title: u.message,
      eventType: u.event_type,
      occurredAt: u.created_at,
    },
    at: u.created_at,
  });

  return id;
}

export function getDemoMapMarkers() {
  return DEMO_SITES.map((s) => ({
    siteId: s.id,
    name: s.name,
    type: s.type,
    lat: s.lat,
    lng: s.lng,
    address: s.address,
    deviceCount: virtualDevices.filter((d) => d.siteId === s.id).length,
    status: Math.random() > 0.85 ? "warning" : "ok",
  }));
}
