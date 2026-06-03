import { getDatabase } from "../db/database.js";
import { placeProMapPin } from "../pro-remote/floor-map-stack.js";
import { DEMO_PACK_CUSTOMERS } from "./demo-customer-pack.js";

const PIN_LAYOUT: Array<{
  tier: string;
  name: string;
  order: number;
  pins: Array<{ pinType: string; label: string; posX: number; posY: number; deviceSuffix: string }>;
}> = [
  {
    tier: "perimeter",
    name: "外周",
    order: 0,
    pins: [
      { pinType: "beam", label: "外周ビーム", posX: 0.15, posY: 0.2, deviceSuffix: "ESP-01" },
      { pinType: "camera", label: "駐車場カメラ", posX: 0.85, posY: 0.25, deviceSuffix: "CAM-01" },
      { pinType: "door", label: "正門", posX: 0.5, posY: 0.08, deviceSuffix: "ESP-02" },
    ],
  },
  {
    tier: "1f",
    name: "1F",
    order: 1,
    pins: [
      { pinType: "esp", label: "1F ESP", posX: 0.3, posY: 0.55, deviceSuffix: "ESP-01" },
      { pinType: "shelly", label: "照明 Shelly", posX: 0.7, posY: 0.45, deviceSuffix: "SHELLY-01" },
      { pinType: "pir", label: "PIR", posX: 0.5, posY: 0.6, deviceSuffix: "ESP-02" },
      { pinType: "light", label: "照明", posX: 0.72, posY: 0.48, deviceSuffix: "SHELLY-01" },
    ],
  },
  {
    tier: "2f",
    name: "2F",
    order: 2,
    pins: [
      { pinType: "pir", label: "窓センサー", posX: 0.2, posY: 0.35, deviceSuffix: "ESP-02" },
      { pinType: "camera", label: "廊下カメラ", posX: 0.55, posY: 0.4, deviceSuffix: "CAM-01" },
      { pinType: "esp", label: "2F ESP", posX: 0.4, posY: 0.7, deviceSuffix: "ESP-01" },
    ],
  },
];

export function ensureDemoFloorMapsForAllCustomers(): { layers: number; pins: number } {
  const db = getDatabase();
  let layers = 0;
  let pins = 0;

  for (const c of DEMO_PACK_CUSTOMERS) {
    const site = db
      .prepare(`SELECT id FROM sites WHERE customer_id = ? ORDER BY name LIMIT 1`)
      .get(c.customerId) as { id: string } | undefined;
    if (!site) continue;

    for (const t of PIN_LAYOUT) {
      let floorRow = db
        .prepare(`SELECT id FROM floors WHERE site_id = ? AND name = ? LIMIT 1`)
        .get(site.id, t.name) as { id: string } | undefined;
      if (!floorRow) {
        const fid = `floor-${c.customerCode}-${t.tier}`;
        db.prepare(
          `INSERT OR IGNORE INTO floors (id, site_id, name, order_no, created_at, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
        ).run(fid, site.id, t.name, t.order);
        floorRow = { id: fid };
      }

      const layerId = `layer-${c.customerCode}-${t.tier}`;
      db.prepare(
        `INSERT OR IGNORE INTO pro_floor_layers (id, customer_id, site_id, tier, display_name, sort_order, floor_id, image_kind)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'svg')`
      ).run(layerId, c.customerId, site.id, t.tier, t.name, t.order, floorRow.id);

      db.prepare(
        `UPDATE pro_floor_layers SET image_path = COALESCE(image_path, ?), image_kind = 'svg'
         WHERE id = ?`
      ).run(`/assets/demo-floor/${t.tier}.svg`, layerId);

      layers += 1;

      const existingPins = (
        db.prepare(`SELECT COUNT(*) as c FROM pro_map_pins WHERE layer_id = ?`).get(layerId) as { c: number }
      ).c;
      if (existingPins >= t.pins.length) {
        pins += existingPins;
        continue;
      }

      db.prepare(`DELETE FROM pro_map_pins WHERE layer_id = ?`).run(layerId);

      for (const p of t.pins) {
        const deviceId = `${c.customerCode}-${p.deviceSuffix}`;
        placeProMapPin({
          layerId,
          pinType: p.pinType,
          posX: p.posX,
          posY: p.posY,
          label: p.label,
          deviceId,
        });
        pins += 1;
      }
    }
  }

  return { layers, pins };
}

export function clearDemoFloorMaps(): void {
  const db = getDatabase();
  for (const c of DEMO_PACK_CUSTOMERS) {
    for (const tier of ["perimeter", "1f", "2f"]) {
      const layerId = `layer-${c.customerCode}-${tier}`;
      db.prepare(`DELETE FROM pro_map_pins WHERE layer_id = ?`).run(layerId);
    }
  }
}

export function getDemoFloorMapStatus(): Array<{
  customerCode: string;
  tiers: Array<{ tier: string; pinCount: number }>;
}> {
  const db = getDatabase();
  return DEMO_PACK_CUSTOMERS.map((c) => ({
    customerCode: c.customerCode,
    tiers: ["perimeter", "1f", "2f"].map((tier) => {
      const layerId = `layer-${c.customerCode}-${tier}`;
      const pinCount = (
        db.prepare(`SELECT COUNT(*) as c FROM pro_map_pins WHERE layer_id = ?`).get(layerId) as { c: number }
      ).c;
      return { tier, pinCount };
    }),
  }));
}
