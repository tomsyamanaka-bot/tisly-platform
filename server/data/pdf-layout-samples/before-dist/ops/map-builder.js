import { getDatabase } from "../db/database.js";
import { listDevicesForCustomer, listSitesForCustomer } from "../customer/customer-store.js";
import { getCustomerByCode } from "../customer/customer-store.js";
import { getFloorById } from "../site-builder/floor-store.js";
function siteSeverity(offline, total) {
    if (total === 0)
        return "info";
    if (offline > total / 2)
        return "critical";
    if (offline > 0)
        return "warning";
    return "info";
}
export function buildOpsMap(customerCode) {
    const customer = getCustomerByCode(customerCode);
    if (!customer)
        return null;
    const sites = listSitesForCustomer(customer.customer_id);
    const devices = listDevicesForCustomer(customer.customer_id);
    const db = getDatabase();
    const siteNameById = new Map(sites.map((s) => [s.site_id, s.site_name]));
    const zoneRows = db
        .prepare(`SELECT z.id as zone_id, z.name, z.site_id, z.floor_id, s.name as site_name
       FROM zones z
       JOIN sites s ON s.id = z.site_id
       WHERE s.customer_id = ? OR s.tenant_id = ?
       ORDER BY z.name`)
        .all(customer.customer_id, customer.tenant_id ?? customer.customer_id);
    const floorRows = db
        .prepare(`SELECT f.id, f.site_id, f.name, f.floor_plan_path
       FROM floors f
       JOIN sites s ON s.id = f.site_id
       WHERE s.customer_id = ? OR s.tenant_id = ?
       ORDER BY f.order_no`)
        .all(customer.customer_id, customer.tenant_id ?? customer.customer_id);
    const deviceExtras = new Map(db
        .prepare(`SELECT device_id, id, pos_x, pos_y, icon_type, rotation, zone_id, floor_id
           FROM devices WHERE customer_id = ? OR site_id IN (SELECT id FROM sites WHERE customer_id = ?)`)
        .all(customer.customer_id, customer.customer_id).map((r) => [r.device_id || r.id, r]));
    const zoneNameById = new Map(zoneRows.map((z) => [z.zone_id, z.name]));
    const markers = sites.map((site, idx) => {
        const siteDevices = devices.filter((d) => d.siteId === site.site_id);
        const offline = siteDevices.filter((d) => !d.online).length;
        const lat = site.lat ?? placeholderLat(idx);
        const lng = site.lng ?? placeholderLng(idx);
        const hasMapCoords = siteDevices.some((d) => {
            const ex = deviceExtras.get(d.deviceId);
            return ex?.pos_x != null && ex?.pos_y != null;
        });
        return {
            siteId: site.site_id,
            name: site.site_name,
            address: site.address,
            lat,
            lng,
            deviceCount: siteDevices.length,
            status: offline > 0 ? (offline > siteDevices.length / 2 ? "alarm" : "warning") : "ok",
            severity: siteSeverity(offline, siteDevices.length),
            coordinatesTodo: site.lat == null && !hasMapCoords ? "placeholder" : undefined,
        };
    });
    const zones = zoneRows.map((z) => ({
        zoneId: z.zone_id,
        name: z.name,
        siteId: z.site_id,
        siteName: z.site_name,
        floorId: z.floor_id,
        deviceCount: devices.filter((d) => {
            const ex = deviceExtras.get(d.deviceId);
            return ex?.zone_id === z.zone_id;
        }).length,
    }));
    return {
        customerCode: customer.customer_code,
        sites: markers,
        zones,
        floors: floorRows.map((f) => ({
            floorId: f.id,
            siteId: f.site_id,
            name: f.name,
            hasFloorPlan: !!f.floor_plan_path,
        })),
        devices: devices.map((d, i) => {
            const ex = deviceExtras.get(d.deviceId);
            const hasPos = ex?.pos_x != null && ex?.pos_y != null;
            return {
                deviceId: d.deviceId,
                label: d.label,
                siteId: d.siteId,
                siteName: d.siteId ? siteNameById.get(d.siteId) ?? null : null,
                zone: ex?.zone_id ? zoneNameById.get(ex.zone_id) ?? null : null,
                floorId: ex?.floor_id ?? null,
                deviceType: d.deviceType,
                heartbeatStatus: d.heartbeatStatus,
                online: d.online,
                severity: d.online ? "info" : "warning",
                mapPosition: hasPos
                    ? {
                        x: ex.pos_x,
                        y: ex.pos_y,
                        iconType: ex.icon_type,
                        rotation: ex.rotation,
                    }
                    : null,
                coordinates: {
                    lat: hasPos
                        ? ex.pos_y
                        : d.siteId
                            ? markers.find((m) => m.siteId === d.siteId)?.lat ?? placeholderLat(i)
                            : placeholderLat(i),
                    lng: hasPos
                        ? ex.pos_x
                        : d.siteId
                            ? markers.find((m) => m.siteId === d.siteId)?.lng ?? placeholderLng(i)
                            : placeholderLng(i),
                    placeholder: !hasPos,
                },
            };
        }),
        dataSource: "real",
    };
}
function placeholderLat(index) {
    return 35.68 + (index % 5) * 0.02;
}
function placeholderLng(index) {
    return 139.76 + (index % 5) * 0.015;
}
export function buildOpsAlarms(customerCode, limit = 50) {
    const customer = getCustomerByCode(customerCode);
    if (!customer)
        return null;
    const db = getDatabase();
    const alarms = db
        .prepare(`SELECT * FROM events
       WHERE event_type IN ('intrusion', 'perimeter', 'window_open', 'door_open', 'estop', 'motion', 'alarm')
         AND (tenant_id = ? OR site_id IN (SELECT id FROM sites WHERE customer_id = ?))
       ORDER BY created_at DESC LIMIT ?`)
        .all(customer.tenant_id ?? customer.customer_id, customer.customer_id, limit);
    const counts = { critical: 0, alarm: 0, warning: 0 };
    for (const a of alarms) {
        const sev = (a.severity ?? "warning").toLowerCase();
        if (sev === "critical")
            counts.critical++;
        else if (sev === "alarm")
            counts.alarm++;
        else
            counts.warning++;
    }
    return { customerCode, alarms, counts, dataSource: "real" };
}
export function buildOpsDevices(customerCode) {
    const customer = getCustomerByCode(customerCode);
    if (!customer)
        return null;
    const devices = listDevicesForCustomer(customer.customer_id);
    const sites = listSitesForCustomer(customer.customer_id);
    const siteMap = new Map(sites.map((s) => [s.site_id, s.site_name]));
    const db = getDatabase();
    const extras = new Map(db
        .prepare(`SELECT device_id, id, pos_x, pos_y, floor_id, zone_id FROM devices WHERE customer_id = ?`)
        .all(customer.customer_id).map((r) => [r.device_id || r.id, r]));
    return {
        customerCode,
        dataSource: "real",
        devices: devices.map((d) => {
            const ex = extras.get(d.deviceId);
            return {
                ...d,
                siteName: d.siteId ? siteMap.get(d.siteId) : null,
                floorId: ex?.floor_id ?? null,
                mapPosition: ex?.pos_x != null ? { x: ex.pos_x, y: ex.pos_y } : null,
                anomalyCount: 0,
                lastHeartbeatAt: d.lastSeen,
            };
        }),
    };
}
export function buildOpsTv(customerCode) {
    const customer = getCustomerByCode(customerCode);
    if (!customer)
        return null;
    const db = getDatabase();
    const devices = db
        .prepare(`SELECT id, device_id, display_name, serial, last_seen_at, status, cert_status, site_id, tenant_id
       FROM tv_devices
       WHERE tenant_id = ? OR site_id IN (SELECT id FROM sites WHERE customer_id = ?)
       ORDER BY updated_at DESC`)
        .all(customer.tenant_id ?? customer.customer_id, customer.customer_id);
    return { customerCode, devices, dataSource: "real" };
}
export function buildOpsQnap(customerCode) {
    const customer = getCustomerByCode(customerCode);
    if (!customer)
        return null;
    const db = getDatabase();
    let archives = [];
    try {
        archives = db
            .prepare(`SELECT * FROM qnap_archives
         WHERE customer_id = ? OR tenant_id = ?
         ORDER BY created_at DESC LIMIT 20`)
            .all(customer.customer_id, customer.tenant_id ?? customer.customer_id);
    }
    catch {
        archives = [];
    }
    return { customerCode, archives, mode: process.env.QNAP_MODE ?? "mock", dataSource: "real" };
}
/** Incident map jump target from device/floor position. */
export function resolveIncidentMapLocation(incident) {
    if (incident.pos_x != null && incident.pos_y != null) {
        return {
            floorId: incident.floor_id ?? null,
            x: incident.pos_x,
            y: incident.pos_y,
            siteId: incident.site_id ?? null,
        };
    }
    if (incident.device_id) {
        const db = getDatabase();
        const row = db
            .prepare(`SELECT floor_id, pos_x, pos_y, site_id FROM devices WHERE device_id = ? OR id = ? LIMIT 1`)
            .get(incident.device_id, incident.device_id);
        if (row?.pos_x != null) {
            return {
                floorId: row.floor_id,
                x: row.pos_x,
                y: row.pos_y,
                siteId: row.site_id,
            };
        }
    }
    if (incident.floor_id) {
        const floor = getFloorById(incident.floor_id);
        return { floorId: incident.floor_id, x: 0.5, y: 0.5, siteId: floor?.site_id ?? incident.site_id ?? null };
    }
    return { floorId: null, x: null, y: null, siteId: incident.site_id ?? null };
}
