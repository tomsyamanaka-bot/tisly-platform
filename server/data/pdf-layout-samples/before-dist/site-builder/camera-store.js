import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
export function listCamerasForCustomer(customerId) {
    return getDatabase()
        .prepare(`SELECT * FROM camera_devices WHERE customer_id = ? ORDER BY camera_name`)
        .all(customerId);
}
export function createCamera(input) {
    const id = uuid();
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`INSERT INTO camera_devices (id, customer_id, site_id, zone_id, device_id, channel, rtsp_url, camera_name, camera_group, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, input.customerId, input.siteId ?? null, input.zoneId ?? null, input.deviceId ?? null, input.channel ?? 1, input.rtspUrl ?? null, input.cameraName, input.cameraGroup ?? null, now, now);
    return getCamera(input.customerId, id);
}
export function getCamera(customerId, id) {
    const row = getDatabase()
        .prepare(`SELECT * FROM camera_devices WHERE customer_id = ? AND id = ?`)
        .get(customerId, id);
    return row ?? null;
}
export function updateCamera(customerId, id, patch) {
    const existing = getCamera(customerId, id);
    if (!existing)
        return null;
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`UPDATE camera_devices SET site_id = ?, zone_id = ?, channel = ?, rtsp_url = ?, camera_name = ?, camera_group = ?, updated_at = ?
       WHERE id = ? AND customer_id = ?`)
        .run(patch.siteId !== undefined ? patch.siteId : existing.site_id, patch.zoneId !== undefined ? patch.zoneId : existing.zone_id, patch.channel ?? existing.channel, patch.rtspUrl !== undefined ? patch.rtspUrl : existing.rtsp_url, patch.cameraName ?? existing.camera_name, patch.cameraGroup !== undefined ? patch.cameraGroup : existing.camera_group, now, id, customerId);
    return getCamera(customerId, id);
}
export function deleteCamera(customerId, id) {
    const r = getDatabase().prepare(`DELETE FROM camera_devices WHERE customer_id = ? AND id = ?`).run(customerId, id);
    return r.changes > 0;
}
