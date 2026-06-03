import { getDatabase } from "../db/database.js";
import { getFloorById } from "./floor-store.js";
import { getSiteById } from "./site-store.js";

export interface MapDevicePosition {
  deviceId: string;
  label: string | null;
  deviceType: string;
  siteId: string | null;
  zoneId: string | null;
  floorId: string | null;
  posX: number | null;
  posY: number | null;
  iconType: string | null;
  rotation: number | null;
  online: boolean;
  heartbeatStatus: string;
}

export interface FloorMapView {
  floorId: string;
  siteId: string;
  floorName: string;
  imageUrl: string | null;
  imagePath: string | null;
  devices: MapDevicePosition[];
}

function deviceOnline(lastSeen: string | null, heartbeatStatus: string | null): boolean {
  if (!lastSeen) return heartbeatStatus === "ok" || heartbeatStatus === "online";
  const t = new Date(lastSeen).getTime();
  return Date.now() - t < 5 * 60 * 1000;
}

export function listMapDevicesForCustomer(customerId: string, tenantId?: string | null): MapDevicePosition[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT d.id, d.device_id, d.label, d.device_type, d.site_id, d.zone_id, d.floor_id,
              d.pos_x, d.pos_y, d.icon_type, d.rotation, d.last_seen, d.heartbeat_status
       FROM devices d
       WHERE d.customer_id = ? OR d.site_id IN (SELECT id FROM sites WHERE customer_id = ? OR tenant_id = ?)
       ORDER BY d.label, d.device_id`
    )
    .all(customerId, customerId, tenantId ?? customerId) as Array<{
    id: string;
    device_id: string;
    label: string | null;
    device_type: string;
    site_id: string | null;
    zone_id: string | null;
    floor_id: string | null;
    pos_x: number | null;
    pos_y: number | null;
    icon_type: string | null;
    rotation: number | null;
    last_seen: string | null;
    heartbeat_status: string | null;
  }>;

  return rows.map((r) => ({
    deviceId: r.device_id || r.id,
    label: r.label,
    deviceType: r.device_type,
    siteId: r.site_id,
    zoneId: r.zone_id,
    floorId: r.floor_id,
    posX: r.pos_x,
    posY: r.pos_y,
    iconType: r.icon_type,
    rotation: r.rotation,
    online: deviceOnline(r.last_seen, r.heartbeat_status),
    heartbeatStatus: r.heartbeat_status ?? "unknown",
  }));
}

export function updateDeviceMapPosition(
  deviceRowId: string,
  patch: {
    posX?: number | null;
    posY?: number | null;
    iconType?: string | null;
    rotation?: number | null;
    zoneId?: string | null;
    floorId?: string | null;
    siteId?: string | null;
  }
): boolean {
  const db = getDatabase();
  const existing = db.prepare(`SELECT id FROM devices WHERE id = ? OR device_id = ?`).get(deviceRowId, deviceRowId) as
    | { id: string }
    | undefined;
  if (!existing) return false;
  const cols: string[] = [];
  const vals: unknown[] = [];
  if (patch.posX !== undefined) {
    cols.push("pos_x = ?");
    vals.push(patch.posX);
  }
  if (patch.posY !== undefined) {
    cols.push("pos_y = ?");
    vals.push(patch.posY);
  }
  if (patch.iconType !== undefined) {
    cols.push("icon_type = ?");
    vals.push(patch.iconType);
  }
  if (patch.rotation !== undefined) {
    cols.push("rotation = ?");
    vals.push(patch.rotation);
  }
  if (patch.zoneId !== undefined) {
    cols.push("zone_id = ?");
    vals.push(patch.zoneId);
  }
  if (patch.floorId !== undefined) {
    cols.push("floor_id = ?");
    vals.push(patch.floorId);
  }
  if (patch.siteId !== undefined) {
    cols.push("site_id = ?");
    vals.push(patch.siteId);
  }
  if (cols.length === 0) return true;
  cols.push("updated_at = ?");
  vals.push(new Date().toISOString());
  vals.push(existing.id);
  db.prepare(`UPDATE devices SET ${cols.join(", ")} WHERE id = ?`).run(...vals);
  return true;
}

export function clearDeviceMapPosition(deviceRowId: string): boolean {
  return updateDeviceMapPosition(deviceRowId, {
    posX: null,
    posY: null,
    iconType: null,
    rotation: null,
  });
}

export function getFloorMapView(floorId: string): FloorMapView | null {
  const floor = getFloorById(floorId);
  if (!floor) return null;
  const site = getSiteById(floor.site_id);
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT d.id, d.device_id, d.label, d.device_type, d.site_id, d.zone_id, d.floor_id,
              d.pos_x, d.pos_y, d.icon_type, d.rotation, d.last_seen, d.heartbeat_status
       FROM devices d WHERE d.floor_id = ? OR (d.site_id = ? AND d.pos_x IS NOT NULL)`
    )
    .all(floorId, floor.site_id) as Array<{
    id: string;
    device_id: string;
    label: string | null;
    device_type: string;
    site_id: string | null;
    zone_id: string | null;
    floor_id: string | null;
    pos_x: number | null;
    pos_y: number | null;
    icon_type: string | null;
    rotation: number | null;
    last_seen: string | null;
    heartbeat_status: string | null;
  }>;

  const imagePath = floor.floor_plan_path;
  const imageUrl = imagePath ? `/uploads/floorplans/${imagePath.replace(/^.*[/\\]/, "")}` : null;

  return {
    floorId: floor.id,
    siteId: floor.site_id,
    floorName: floor.name,
    imageUrl,
    imagePath,
    devices: rows
      .filter((r) => r.floor_id === floorId || r.pos_x != null)
      .map((r) => ({
        deviceId: r.device_id || r.id,
        label: r.label,
        deviceType: r.device_type,
        siteId: r.site_id,
        zoneId: r.zone_id,
        floorId: r.floor_id,
        posX: r.pos_x,
        posY: r.pos_y,
        iconType: r.icon_type,
        rotation: r.rotation,
        online: deviceOnline(r.last_seen, r.heartbeat_status),
        heartbeatStatus: r.heartbeat_status ?? "unknown",
      })),
  };
}

export function assertSiteOwnedByCustomer(siteId: string, customerId: string): boolean {
  const site = getSiteById(siteId);
  return site?.customer_id === customerId;
}
