import path from "path";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getCustomerByCode } from "../customer/customer-store.js";
import { getFloorMapView, listMapDevicesForCustomer, } from "../site-builder/map-store.js";
import { normalizeDeviceStatus } from "../device/device-state.js";
export const PRO_PIN_TYPES = [
    "camera",
    "beam",
    "pir",
    "door",
    "window",
    "relay",
    "esp",
    "shelly",
    "speaker",
    "light",
];
export const PRO_FLOOR_TIERS = ["perimeter", "1f", "2f"];
export function isValidProPinType(t) {
    return PRO_PIN_TYPES.includes(t);
}
/** Resolve DB image_path to a browser-loadable URL (assets vs uploads). */
export function resolveProFloorImageUrl(imagePath) {
    const normalized = imagePath.replace(/\\/g, "/");
    if (normalized.startsWith("/assets/") || normalized.startsWith("/uploads/")) {
        return normalized;
    }
    const base = path.basename(normalized);
    return `/uploads/floorplans/${base}`;
}
/** Idempotent demo seed — run after customer/site seed. */
export function ensureProFloorLayersSeed() {
    const database = getDatabase();
    const customers = database
        .prepare(`SELECT customer_id, customer_code FROM customers WHERE customer_code = 'TOMS001'`)
        .all();
    for (const c of customers) {
        const site = database
            .prepare(`SELECT id, name FROM sites WHERE customer_id = ? ORDER BY name LIMIT 1`)
            .get(c.customer_id);
        if (!site)
            continue;
        const tiers = [
            { tier: "perimeter", name: "外周", order: 0 },
            { tier: "1f", name: "1F", order: 1 },
            { tier: "2f", name: "2F", order: 2 },
        ];
        for (const t of tiers) {
            let floorRow = database
                .prepare(`SELECT id FROM floors WHERE site_id = ? AND name = ? LIMIT 1`)
                .get(site.id, t.name);
            if (!floorRow) {
                const fid = `floor-${c.customer_code}-${t.tier}`;
                database
                    .prepare(`INSERT OR IGNORE INTO floors (id, site_id, name, order_no, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`)
                    .run(fid, site.id, t.name, t.order);
                floorRow = { id: fid };
            }
            const layerId = `layer-${c.customer_code}-${t.tier}`;
            database
                .prepare(`INSERT OR IGNORE INTO pro_floor_layers (id, customer_id, site_id, tier, display_name, sort_order, floor_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`)
                .run(layerId, c.customer_id, site.id, t.tier, t.name, t.order, floorRow.id);
        }
    }
}
function pinStatusFromDevice(deviceId, customerId) {
    if (!deviceId)
        return "OFFLINE";
    const row = getDatabase()
        .prepare(`SELECT device_status, last_seen FROM devices WHERE device_id = ? AND customer_id = ?`)
        .get(deviceId, customerId);
    if (!row)
        return "OFFLINE";
    const s = normalizeDeviceStatus(row.device_status);
    if (s === "ONLINE")
        return "ONLINE";
    if (s === "WARNING")
        return "WARNING";
    if (row.last_seen && Date.now() - new Date(row.last_seen).getTime() < 5 * 60 * 1000)
        return "ONLINE";
    return "OFFLINE";
}
export function listProFloorLayers(customerCode) {
    const customer = getCustomerByCode(customerCode);
    if (!customer)
        return [];
    const layers = getDatabase()
        .prepare(`SELECT id, tier, display_name, sort_order, floor_id, image_path, image_kind
       FROM pro_floor_layers WHERE customer_id = ? ORDER BY sort_order`)
        .all(customer.customer_id);
    const allDevices = listMapDevicesForCustomer(customer.customer_id, customer.tenant_id);
    return layers.map((layer) => {
        const pins = getDatabase()
            .prepare(`SELECT id, pin_type, label, pos_x, pos_y, device_id, status FROM pro_map_pins WHERE layer_id = ?`)
            .all(layer.id);
        const pinViews = pins.map((p) => {
            const live = pinStatusFromDevice(p.device_id, customer.customer_id);
            return {
                id: p.id,
                pinType: p.pin_type,
                label: p.label,
                posX: p.pos_x,
                posY: p.pos_y,
                deviceId: p.device_id,
                status: live,
            };
        });
        let floorDevices = [];
        let imageUrl = null;
        if (layer.image_path) {
            imageUrl = resolveProFloorImageUrl(layer.image_path);
        }
        if (layer.floor_id) {
            const view = getFloorMapView(layer.floor_id);
            if (view) {
                if (!imageUrl && view.imageUrl)
                    imageUrl = view.imageUrl;
                floorDevices = view.devices.map((d) => ({
                    ...d,
                    deviceStatus: normalizeDeviceStatus(d.deviceStatus),
                }));
            }
        }
        const layerDeviceIds = new Set(floorDevices.map((d) => d.deviceId));
        for (const d of allDevices) {
            if (d.floorId === layer.floor_id && !layerDeviceIds.has(d.deviceId)) {
                floorDevices.push(d);
            }
        }
        return {
            layerId: layer.id,
            tier: layer.tier,
            displayName: layer.display_name,
            sortOrder: layer.sort_order,
            floorId: layer.floor_id,
            imageUrl,
            imageKind: layer.image_kind,
            pins: pinViews,
            devices: floorDevices,
        };
    });
}
export function placeProMapPin(input) {
    const pinType = isValidProPinType(input.pinType) ? input.pinType : "esp";
    const layer = getDatabase()
        .prepare(`SELECT customer_id FROM pro_floor_layers WHERE id = ?`)
        .get(input.layerId);
    if (!layer)
        throw new Error("layer not found");
    const status = pinStatusFromDevice(input.deviceId ?? null, layer.customer_id);
    const id = uuid();
    getDatabase()
        .prepare(`INSERT INTO pro_map_pins (id, layer_id, pin_type, label, pos_x, pos_y, device_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, input.layerId, pinType, input.label ?? null, input.posX, input.posY, input.deviceId ?? null, status);
    return {
        id,
        pinType,
        label: input.label ?? null,
        posX: input.posX,
        posY: input.posY,
        deviceId: input.deviceId ?? null,
        status,
    };
}
export function deleteProMapPin(pinId) {
    const r = getDatabase().prepare(`DELETE FROM pro_map_pins WHERE id = ?`).run(pinId);
    return r.changes > 0;
}
export function moveProMapPin(pinId, posX, posY) {
    const row = getDatabase()
        .prepare(`SELECT layer_id, pin_type, label, device_id FROM pro_map_pins WHERE id = ?`)
        .get(pinId);
    if (!row)
        return null;
    const layer = getDatabase()
        .prepare(`SELECT customer_id FROM pro_floor_layers WHERE id = ?`)
        .get(row.layer_id);
    if (!layer)
        return null;
    const status = pinStatusFromDevice(row.device_id, layer.customer_id);
    getDatabase()
        .prepare(`UPDATE pro_map_pins SET pos_x = ?, pos_y = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(posX, posY, pinId);
    return {
        id: pinId,
        pinType: row.pin_type,
        label: row.label,
        posX,
        posY,
        deviceId: row.device_id,
        status,
    };
}
export function updateProFloorLayerDisplayName(layerId, displayName) {
    const r = getDatabase()
        .prepare(`UPDATE pro_floor_layers SET display_name = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(displayName.trim(), layerId);
    return r.changes > 0;
}
export function findAlertFloorTier(customerCode) {
    const layers = listProFloorLayers(customerCode);
    for (const tier of ["2f", "1f", "perimeter"]) {
        const layer = layers.find((l) => l.tier === tier);
        if (!layer)
            continue;
        const badPin = layer.pins.find((p) => p.status === "OFFLINE" || p.status === "WARNING");
        const badDev = layer.devices.find((d) => d.deviceStatus === "OFFLINE" || d.deviceStatus === "WARNING");
        if (badPin || badDev) {
            return {
                tier: layer.tier,
                layerId: layer.layerId,
                reason: badPin ? `pin:${badPin.id}` : `device:${badDev?.deviceId}`,
            };
        }
    }
    return { tier: null, layerId: null, reason: "none" };
}
