import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
export function listSitesForCustomerId(customerId, tenantId) {
    return getDatabase()
        .prepare(`SELECT id, tenant_id, customer_id, name, address, timezone, site_type, status, lat, lng, created_at, updated_at
       FROM sites WHERE customer_id = ? OR tenant_id = ?
       ORDER BY name`)
        .all(customerId, tenantId ?? customerId);
}
export function getSiteById(siteId) {
    const row = getDatabase()
        .prepare(`SELECT id, tenant_id, customer_id, name, address, timezone, site_type, status, lat, lng, created_at, updated_at
       FROM sites WHERE id = ?`)
        .get(siteId);
    return row ?? null;
}
export function createSite(input) {
    const id = uuid();
    const now = new Date().toISOString();
    const tz = input.timezone ?? "Asia/Tokyo";
    getDatabase()
        .prepare(`INSERT INTO sites (id, tenant_id, customer_id, name, address, timezone, site_type, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`)
        .run(id, input.tenantId, input.customerId, input.name, input.address ?? null, tz, input.siteType ?? "commercial", now, now);
    return getSiteById(id);
}
export function updateSite(siteId, patch) {
    const existing = getSiteById(siteId);
    if (!existing)
        return null;
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`UPDATE sites SET name = ?, address = ?, timezone = ?, status = COALESCE(?, status), updated_at = ?
       WHERE id = ?`)
        .run(patch.name ?? existing.name, patch.address !== undefined ? patch.address : existing.address, patch.timezone ?? existing.timezone ?? "Asia/Tokyo", patch.status ?? existing.status, now, siteId);
    return getSiteById(siteId);
}
export function deleteSite(siteId) {
    const r = getDatabase().prepare(`DELETE FROM sites WHERE id = ?`).run(siteId);
    return r.changes > 0;
}
