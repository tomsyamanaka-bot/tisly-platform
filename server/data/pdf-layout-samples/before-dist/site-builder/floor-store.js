import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
export function listFloorsForSite(siteId) {
    return getDatabase()
        .prepare(`SELECT id, site_id, name, order_no, floor_plan_path, created_at, updated_at
       FROM floors WHERE site_id = ? ORDER BY order_no, name`)
        .all(siteId);
}
export function getFloorById(floorId) {
    const row = getDatabase()
        .prepare(`SELECT id, site_id, name, order_no, floor_plan_path, created_at, updated_at FROM floors WHERE id = ?`)
        .get(floorId);
    return row ?? null;
}
export function createFloor(input) {
    const id = uuid();
    const now = new Date().toISOString();
    const orderNo = input.orderNo ??
        (getDatabase().prepare(`SELECT COALESCE(MAX(order_no), -1) + 1 as n FROM floors WHERE site_id = ?`).get(input.siteId).n);
    getDatabase()
        .prepare(`INSERT INTO floors (id, site_id, name, order_no, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, input.siteId, input.name, orderNo, now, now);
    return getFloorById(id);
}
export function updateFloor(floorId, patch) {
    const existing = getFloorById(floorId);
    if (!existing)
        return null;
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`UPDATE floors SET name = ?, order_no = ?, floor_plan_path = COALESCE(?, floor_plan_path), updated_at = ? WHERE id = ?`)
        .run(patch.name ?? existing.name, patch.orderNo ?? existing.order_no, patch.floorPlanPath !== undefined ? patch.floorPlanPath : existing.floor_plan_path, now, floorId);
    return getFloorById(floorId);
}
export function deleteFloor(floorId) {
    const r = getDatabase().prepare(`DELETE FROM floors WHERE id = ?`).run(floorId);
    return r.changes > 0;
}
export function setFloorPlanPath(floorId, relativePath) {
    return updateFloor(floorId, { floorPlanPath: relativePath });
}
