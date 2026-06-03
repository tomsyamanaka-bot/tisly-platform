import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";

export interface SiteRow {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  name: string;
  address: string | null;
  timezone: string | null;
  site_type: string | null;
  status: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
  updated_at: string;
}

export function listSitesForCustomerId(customerId: string, tenantId?: string | null): SiteRow[] {
  return getDatabase()
    .prepare(
      `SELECT id, tenant_id, customer_id, name, address, timezone, site_type, status, lat, lng, created_at, updated_at
       FROM sites WHERE customer_id = ? OR tenant_id = ?
       ORDER BY name`
    )
    .all(customerId, tenantId ?? customerId) as SiteRow[];
}

export function getSiteById(siteId: string): SiteRow | null {
  const row = getDatabase()
    .prepare(
      `SELECT id, tenant_id, customer_id, name, address, timezone, site_type, status, lat, lng, created_at, updated_at
       FROM sites WHERE id = ?`
    )
    .get(siteId) as SiteRow | undefined;
  return row ?? null;
}

export function createSite(input: {
  tenantId: string;
  customerId: string;
  name: string;
  address?: string | null;
  timezone?: string;
  siteType?: string;
}): SiteRow {
  const id = uuid();
  const now = new Date().toISOString();
  const tz = input.timezone ?? "Asia/Tokyo";
  getDatabase()
    .prepare(
      `INSERT INTO sites (id, tenant_id, customer_id, name, address, timezone, site_type, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
    )
    .run(
      id,
      input.tenantId,
      input.customerId,
      input.name,
      input.address ?? null,
      tz,
      input.siteType ?? "commercial",
      now,
      now
    );
  return getSiteById(id)!;
}

export function updateSite(
  siteId: string,
  patch: Partial<{ name: string; address: string | null; timezone: string; status: string }>
): SiteRow | null {
  const existing = getSiteById(siteId);
  if (!existing) return null;
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `UPDATE sites SET name = ?, address = ?, timezone = ?, status = COALESCE(?, status), updated_at = ?
       WHERE id = ?`
    )
    .run(
      patch.name ?? existing.name,
      patch.address !== undefined ? patch.address : existing.address,
      patch.timezone ?? existing.timezone ?? "Asia/Tokyo",
      patch.status ?? existing.status,
      now,
      siteId
    );
  return getSiteById(siteId);
}

export function deleteSite(siteId: string): boolean {
  const r = getDatabase().prepare(`DELETE FROM sites WHERE id = ?`).run(siteId);
  return r.changes > 0;
}
