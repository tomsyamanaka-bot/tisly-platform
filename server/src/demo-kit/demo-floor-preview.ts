import { findAlertFloorTier, listProFloorLayers } from "../pro-remote/floor-map-stack.js";
import { getCustomerByCode } from "../customer/customer-store.js";
import { DEMO_PACK_CODES } from "./demo-customer-pack.js";

export function getDemoFloorPreview(customerCode = "TOMS001") {
  const code = customerCode.toUpperCase();
  if (!DEMO_PACK_CODES.includes(code as (typeof DEMO_PACK_CODES)[number])) {
    throw new Error(`Unknown demo customer: ${code}`);
  }
  const customer = getCustomerByCode(code);
  if (!customer) throw new Error(`Customer not found: ${code}`);

  const layers = listProFloorLayers(code)
    .filter((l) => ["perimeter", "1f", "2f"].includes(l.tier))
    .map((l) => ({
      layerId: l.layerId,
      tier: l.tier,
      displayName: l.displayName,
      sortOrder: l.sortOrder,
      imageUrl: `/assets/demo-floor/${l.tier}.svg`,
      pins: l.pins.map((p) => ({
        id: p.id,
        pinType: p.pinType,
        label: p.label,
        posX: p.posX,
        posY: p.posY,
        deviceId: p.deviceId,
        status: p.status,
      })),
    }));

  const alert = findAlertFloorTier(code);
  return {
    customerCode: code,
    customerName: customer.customer_name,
    layers,
    alert: {
      tier: alert.tier,
      layerId: alert.layerId,
      reason: alert.reason,
    },
    statusColors: {
      ONLINE: "#22c55e",
      WARNING: "#f59e0b",
      OFFLINE: "#ef4444",
    },
  };
}
