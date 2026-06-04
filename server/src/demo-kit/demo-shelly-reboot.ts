import { getDatabase } from "../db/database.js";
import { appendDeviceTimeline } from "../device/device-timeline.js";
import { getCustomerByCode } from "../customer/customer-store.js";
import { DEMO_PACK_CODES } from "./demo-customer-pack.js";

export function runDemoShellyReboot(customerCode = "TOMS001"): {
  ok: boolean;
  customerCode: string;
  deviceId: string;
  steps: string[];
} {
  const code = customerCode.toUpperCase();
  if (!DEMO_PACK_CODES.includes(code as (typeof DEMO_PACK_CODES)[number])) {
    throw new Error(`Unknown demo customer: ${code}`);
  }
  const customer = getCustomerByCode(code);
  if (!customer) throw new Error(`Customer not found: ${code}`);

  const deviceId = `${code}-SHELLY-01`;
  const db = getDatabase();

  db.prepare(`UPDATE devices SET device_status = 'WARNING' WHERE device_id = ?`).run(deviceId);
  appendDeviceTimeline({
    customerId: customer.customer_id,
    deviceId,
    eventType: "notification",
    title: "Shelly 再起動デモ（開始）",
    detail: "リレー応答なし → 自動再起動を試行（mock）",
    actor: "demo-kit",
  });

  db.prepare(`UPDATE devices SET device_status = 'ONLINE', last_seen = datetime('now') WHERE device_id = ?`).run(
    deviceId
  );
  appendDeviceTimeline({
    customerId: customer.customer_id,
    deviceId,
    eventType: "heartbeat_recovered",
    title: "Shelly 再起動完了（デモ）",
    detail: "照明制御が復旧しました",
    actor: "demo-kit",
  });

  return {
    ok: true,
    customerCode: code,
    deviceId,
    steps: ["WARNING", "reboot_mock", "ONLINE"],
  };
}
