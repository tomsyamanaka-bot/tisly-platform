import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getCustomerByCode } from "../customer/customer-store.js";
import {
  getFloorMapView,
  listMapDevicesForCustomer,
  type MapDevicePosition,
} from "../site-builder/map-store.js";
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
] as const;

export type ProPinType = (typeof PRO_PIN_TYPES)[number];

export const PRO_FLOOR_TIERS = ["perimeter", "1f", "2f"] as const;

export interface ProFloorLayerView {
  layerId: string;
  tier: string;
  displayName: string;
  sortOrder: number;
  floorId: string | null;
  imageUrl: string | null;
  imageKind: string;
  pins: ProMapPinView[];
  devices: MapDevicePosition[];
}

export interface ProMapPinView {
  id: string;
  pinType: string;
  label: string | null;
  posX: number;
  posY: number;
  deviceId: string | null;
  status: "ONLINE" | "WARNING" | "OFFLINE";
}

export function isValidProPinType(t: string): t is ProPinType {
  return (PRO_PIN_TYPES as readonly string[]).includes(t);
}

/** Idempotent demo seed — run after customer/site seed. */
export function ensureProFloorLayersSeed(): void {
  const database = getDatabase();
  const customers = database
    .prepare(`SELECT customer_id, customer_code FROM customers WHERE customer_code = 'TOMS001'`)
    .all() as Array<{ customer_id: string; customer_code: string }>;
  for (const c of customers) {
    const site = database
      .prepare(`SELECT id, name FROM sites WHERE customer_id = ? ORDER BY name LIMIT 1`)
      .get(c.customer_id) as { id: string; name: string } | undefined;
    if (!site) continue;
    const tiers: Array<{ tier: string; name: string; order: number }> = [
      { tier: "perimeter", name: "外周", order: 0 },
      { tier: "1f", name: "1F", order: 1 },
      { tier: "2f", name: "2F", order: 2 },
    ];
    for (const t of tiers) {
      let floorRow = database
        .prepare(`SELECT id FROM floors WHERE site_id = ? AND name = ? LIMIT 1`)
        .get(site.id, t.name) as { id: string } | undefined;
      if (!floorRow) {
        const fid = `floor-${c.customer_code}-${t.tier}`;
        database
          .prepare(
            `INSERT OR IGNORE INTO floors (id, site_id, name, order_no, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
          )
          .run(fid, site.id, t.name, t.order);
        floorRow = { id: fid };
      }
      const layerId = `layer-${c.customer_code}-${t.tier}`;
      database
        .prepare(
          `INSERT OR IGNORE INTO pro_floor_layers (id, customer_id, site_id, tier, display_name, sort_order, floor_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(layerId, c.customer_id, site.id, t.tier, t.name, t.order, floorRow.id);
    }
  }
}

function pinStatusFromDevice(deviceId: string | null, customerId: string): "ONLINE" | "WARNING" | "OFFLINE" {
  if (!deviceId) return "OFFLINE";
  const row = getDatabase()
    .prepare(`SELECT device_status, last_seen FROM devices WHERE device_id = ? AND customer_id = ?`)
    .get(deviceId, customerId) as { device_status: string | null; last_seen: string | null } | undefined;
  if (!row) return "OFFLINE";
  const s = normalizeDeviceStatus(row.device_status);
  if (s === "ONLINE") return "ONLINE";
  if (s === "WARNING") return "WARNING";
  if (row.last_seen && Date.now() - new Date(row.last_seen).getTime() < 5 * 60 * 1000) return "ONLINE";
  return "OFFLINE";
}

export function listProFloorLayers(customerCode: string): ProFloorLayerView[] {
  const customer = getCustomerByCode(customerCode);
  if (!customer) return [];
  const layers = getDatabase()
    .prepare(
      `SELECT id, tier, display_name, sort_order, floor_id, image_path, image_kind
       FROM pro_floor_layers WHERE customer_id = ? ORDER BY sort_order`
    )
    .all(customer.customer_id) as Array<{
    id: string;
    tier: string;
    display_name: string;
    sort_order: number;
    floor_id: string | null;
    image_path: string | null;
    image_kind: string;
  }>;

  const allDevices = listMapDevicesForCustomer(customer.customer_id, customer.tenant_id);

  return layers.map((layer) => {
    const pins = getDatabase()
      .prepare(
        `SELECT id, pin_type, label, pos_x, pos_y, device_id, status FROM pro_map_pins WHERE layer_id = ?`
      )
      .all(layer.id) as Array<{
      id: string;
      pin_type: string;
      label: string | null;
      pos_x: number;
      pos_y: number;
      device_id: string | null;
      status: string;
    }>;

    const pinViews: ProMapPinView[] = pins.map((p) => {
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

    let floorDevices: ProFloorLayerView["devices"] = [];
    let imageUrl: string | null = null;
    if (layer.image_path) {
      imageUrl = `/uploads/floorplans/${layer.image_path.replace(/^.*[/\\]/, "")}`;
    }
    if (layer.floor_id) {
      const view = getFloorMapView(layer.floor_id);
      if (view) {
        if (!imageUrl && view.imageUrl) imageUrl = view.imageUrl;
        floorDevices = view.devices.map((d) => ({
          ...d,
          deviceStatus: normalizeDeviceStatus(d.deviceStatus) as string,
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

export function placeProMapPin(input: {
  layerId: string;
  pinType: string;
  posX: number;
  posY: number;
  label?: string;
  deviceId?: string;
}): ProMapPinView {
  const pinType = isValidProPinType(input.pinType) ? input.pinType : "esp";
  const layer = getDatabase()
    .prepare(`SELECT customer_id FROM pro_floor_layers WHERE id = ?`)
    .get(input.layerId) as { customer_id: string } | undefined;
  if (!layer) throw new Error("layer not found");
  const status = pinStatusFromDevice(input.deviceId ?? null, layer.customer_id);
  const id = uuid();
  getDatabase()
    .prepare(
      `INSERT INTO pro_map_pins (id, layer_id, pin_type, label, pos_x, pos_y, device_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
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

export function deleteProMapPin(pinId: string): boolean {
  const r = getDatabase().prepare(`DELETE FROM pro_map_pins WHERE id = ?`).run(pinId);
  return r.changes > 0;
}

export function findAlertFloorTier(customerCode: string): {
  tier: string | null;
  layerId: string | null;
  reason: string;
} {
  const layers = listProFloorLayers(customerCode);
  for (const tier of ["2f", "1f", "perimeter"] as const) {
    const layer = layers.find((l) => l.tier === tier);
    if (!layer) continue;
    const badPin = layer.pins.find((p) => p.status === "OFFLINE" || p.status === "WARNING");
    const badDev = layer.devices.find(
      (d) => d.deviceStatus === "OFFLINE" || d.deviceStatus === "WARNING"
    );
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
