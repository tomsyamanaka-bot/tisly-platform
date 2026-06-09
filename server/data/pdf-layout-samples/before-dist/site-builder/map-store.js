import { getDatabase } from "../db/database.js";
import { normalizeDeviceStatus } from "../device/device-state.js";
import { getFloorById } from "./floor-store.js";
import { getSiteById } from "./site-store.js";
function deviceOnline(lastSeen, heartbeatStatus) {
    if (!lastSeen)
        return heartbeatStatus === "ok" || heartbeatStatus === "online";
    const t = new Date(lastSeen).getTime();
    return Date.now() - t < 5 * 60 * 1000;
}
export function listMapDevicesForCustomer(customerId, tenantId) {
    const db = getDatabase();
    const rows = db
        .prepare(`SELECT d.id, d.device_id, d.label, d.device_type, d.site_id, d.zone_id, d.floor_id,
              d.pos_x, d.pos_y, d.icon_type, d.rotation, d.last_seen, d.heartbeat_status, d.device_status
       FROM devices d
       WHERE d.customer_id = ? OR d.site_id IN (SELECT id FROM sites WHERE customer_id = ? OR tenant_id = ?)
       ORDER BY d.label, d.device_id`)
        .all(customerId, customerId, tenantId ?? customerId);
    return rows.map((r) => {
        const deviceStatus = normalizeDeviceStatus(r.device_status);
        const online = deviceStatus === "ONLINE" ||
            (deviceStatus !== "OFFLINE" && deviceOnline(r.last_seen, r.heartbeat_status));
        return {
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
            online,
            heartbeatStatus: r.heartbeat_status ?? "unknown",
            deviceStatus,
        };
    });
}
export function updateDeviceMapPosition(deviceRowId, patch) {
    const db = getDatabase();
    const existing = db.prepare(`SELECT id FROM devices WHERE id = ? OR device_id = ?`).get(deviceRowId, deviceRowId);
    if (!existing)
        return false;
    const cols = [];
    const vals = [];
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
    if (cols.length === 0)
        return true;
    cols.push("updated_at = ?");
    vals.push(new Date().toISOString());
    vals.push(existing.id);
    db.prepare(`UPDATE devices SET ${cols.join(", ")} WHERE id = ?`).run(...vals);
    return true;
}
export function clearDeviceMapPosition(deviceRowId) {
    return updateDeviceMapPosition(deviceRowId, {
        posX: null,
        posY: null,
        iconType: null,
        rotation: null,
    });
}
export function getFloorMapView(floorId) {
    const floor = getFloorById(floorId);
    if (!floor)
        return null;
    const site = getSiteById(floor.site_id);
    const db = getDatabase();
    const rows = db
        .prepare(`SELECT d.id, d.device_id, d.label, d.device_type, d.site_id, d.zone_id, d.floor_id,
              d.pos_x, d.pos_y, d.icon_type, d.rotation, d.last_seen, d.heartbeat_status, d.device_status
       FROM devices d WHERE d.floor_id = ? OR (d.site_id = ? AND d.pos_x IS NOT NULL)`)
        .all(floorId, floor.site_id);
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
            .map((r) => {
            const deviceStatus = normalizeDeviceStatus(r.device_status);
            const online = deviceStatus === "ONLINE" ||
                (deviceStatus !== "OFFLINE" && deviceOnline(r.last_seen, r.heartbeat_status));
            return {
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
                online,
                heartbeatStatus: r.heartbeat_status ?? "unknown",
                deviceStatus,
            };
        }),
    };
}
export function assertSiteOwnedByCustomer(siteId, customerId) {
    const site = getSiteById(siteId);
    return site?.customer_id === customerId;
}
