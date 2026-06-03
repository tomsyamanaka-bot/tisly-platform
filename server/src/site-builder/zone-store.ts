import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";

export interface ZoneRow {
  id: string;
  site_id: string;
  floor_id: string | null;
  name: string;
  zone_type: string | null;
  sort_order: number;
  metadata_json: string | null;
  created_at: string;
}

export function listZonesForSite(siteId: string): ZoneRow[] {
  return getDatabase()
    .prepare(
      `SELECT id, site_id, floor_id, name, zone_type, sort_order, metadata_json, created_at
       FROM zones WHERE site_id = ? ORDER BY sort_order, name`
    )
    .all(siteId) as ZoneRow[];
}

export function listZonesForFloor(floorId: string): ZoneRow[] {
  return getDatabase()
    .prepare(
      `SELECT id, site_id, floor_id, name, zone_type, sort_order, metadata_json, created_at
       FROM zones WHERE floor_id = ? ORDER BY sort_order, name`
    )
    .all(floorId) as ZoneRow[];
}

export function getZoneById(zoneId: string): ZoneRow | null {
  const row = getDatabase()
    .prepare(
      `SELECT id, site_id, floor_id, name, zone_type, sort_order, metadata_json, created_at FROM zones WHERE id = ?`
    )
    .get(zoneId) as ZoneRow | undefined;
  return row ?? null;
}

export function createZone(input: {
  siteId: string;
  floorId?: string | null;
  name: string;
  type?: string;
  sortOrder?: number;
}): ZoneRow {
  const id = uuid();
  const now = new Date().toISOString();
  const sortOrder = input.sortOrder ?? 0;
  const zoneType = input.type ?? "room";
  getDatabase()
    .prepare(
      `INSERT INTO zones (id, site_id, floor_id, name, zone_type, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, input.siteId, input.floorId ?? null, input.name, zoneType, sortOrder, now);
  return getZoneById(id)!;
}

export function updateZone(
  zoneId: string,
  patch: Partial<{ name: string; type: string; floorId: string | null; sortOrder: number }>
): ZoneRow | null {
  const existing = getZoneById(zoneId);
  if (!existing) return null;
  getDatabase()
    .prepare(
      `UPDATE zones SET name = ?, zone_type = ?, floor_id = ?, sort_order = ? WHERE id = ?`
    )
    .run(
      patch.name ?? existing.name,
      patch.type ?? existing.zone_type ?? "room",
      patch.floorId !== undefined ? patch.floorId : existing.floor_id,
      patch.sortOrder ?? existing.sort_order,
      zoneId
    );
  return getZoneById(zoneId);
}

export function deleteZone(zoneId: string): boolean {
  const r = getDatabase().prepare(`DELETE FROM zones WHERE id = ?`).run(zoneId);
  return r.changes > 0;
}
