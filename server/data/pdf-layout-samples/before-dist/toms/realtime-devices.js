import { getDatabase } from "../db/database.js";
import { getBusinessProject } from "../business/business-store.js";
import { normalizeDeviceStatus } from "../device/device-state.js";
function resolveCustomerCode(projectId) {
    const project = getBusinessProject(projectId);
    if (!project)
        return null;
    if (project.customerId.startsWith("BCU-"))
        return "TOMS001";
    const row = getDatabase()
        .prepare(`SELECT customer_code FROM customers WHERE customer_id = ? LIMIT 1`)
        .get(project.customerId);
    return row?.customer_code ?? "TOMS001";
}
function floorLabel(floorId) {
    if (!floorId)
        return null;
    const row = getDatabase()
        .prepare(`SELECT name FROM floors WHERE id = ?`)
        .get(floorId);
    if (!row)
        return null;
    const n = row.name;
    if (/外周|perimeter/i.test(n))
        return "perimeter";
    if (/1\s*F|1F/i.test(n))
        return "1f";
    if (/2\s*F|2F/i.test(n))
        return "2f";
    return n;
}
function zoneLabel(zoneId) {
    if (!zoneId)
        return null;
    try {
        const row = getDatabase()
            .prepare(`SELECT name FROM zones WHERE id = ?`)
            .get(zoneId);
        return row?.name ?? zoneId;
    }
    catch {
        return zoneId;
    }
}
function liveStatus(deviceStatus, lastSeen) {
    const s = normalizeDeviceStatus(deviceStatus);
    if (s === "ONLINE")
        return "ONLINE";
    if (s === "WARNING")
        return "WARNING";
    if (lastSeen && Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000)
        return "ONLINE";
    if (lastSeen && Date.now() - new Date(lastSeen).getTime() < 15 * 60 * 1000)
        return "WARNING";
    return "OFFLINE";
}
export function listProjectLiveDevices(projectId) {
    const code = resolveCustomerCode(projectId);
    if (!code)
        return [];
    const customer = getDatabase()
        .prepare(`SELECT customer_id FROM customers WHERE customer_code = ?`)
        .get(code);
    if (!customer)
        return [];
    const rows = getDatabase()
        .prepare(`SELECT device_id, label, device_type, device_status, last_seen, floor_id, zone_id,
              pos_x, pos_y, rssi, firmware_version
       FROM devices WHERE customer_id = ?
       ORDER BY device_type, label`)
        .all(customer.customer_id);
    return rows.map((r) => ({
        device_id: r.device_id,
        device_type: r.device_type,
        name: r.label ?? r.device_id,
        status: liveStatus(r.device_status, r.last_seen),
        last_seen: r.last_seen,
        floor: floorLabel(r.floor_id),
        zone: zoneLabel(r.zone_id),
        pos_x: r.pos_x,
        pos_y: r.pos_y,
        battery: null,
        rssi: r.rssi,
        firmware_version: r.firmware_version,
    }));
}
