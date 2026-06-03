import { hashPassword } from "../auth/password.js";
import { getDatabase } from "../db/database.js";
import {
  ensureDemoDevice,
  ensureDemoSite,
  upsertCustomer,
} from "./customer-store.js";

const DEMO_CUSTOMERS = [
  {
    customerId: "cust-toms",
    customerCode: "TOMS001",
    customerName: "トムズ設備デモ",
    plan: "PRO_REMOTE" as const,
    companyColor: "#1a7f37",
    siteId: "site-toms-main",
    siteName: "本社ビル",
    address: "茨城県つくば市",
  },
  {
    customerId: "cust-hotel",
    customerCode: "HOTEL001",
    customerName: "ホテルセキュリティデモ",
    plan: "PRO" as const,
    companyColor: "#2563eb",
    siteId: "site-hotel-main",
    siteName: "本館",
    address: "東京都港区",
  },
  {
    customerId: "cust-plant",
    customerCode: "PLANT001",
    customerName: "プラント監視デモ",
    plan: "Standard" as const,
    companyColor: "#b45309",
    siteId: "site-plant-main",
    siteName: "第1工場",
    address: "千葉県市川市",
  },
];

export function seedProRemoteCustomers(): void {
  const db = getDatabase();
  const has = db.prepare("SELECT customer_id FROM customers LIMIT 1").get();
  if (has) return;

  const demoPassword = process.env.CUSTOMER_DEMO_PASSWORD ?? "demo-remote-2026";
  const hash = hashPassword(demoPassword);

  for (const c of DEMO_CUSTOMERS) {
    upsertCustomer({
      customerId: c.customerId,
      customerCode: c.customerCode,
      customerName: c.customerName,
      plan: c.plan,
      tenantId: c.customerId,
      branding: {
        companyColor: c.companyColor,
        companyName: c.customerName,
        logoUrl: `/assets/customers/${c.customerCode.toLowerCase()}-logo.svg`,
      },
    });
    ensureDemoSite(c.customerId, c.siteId, c.siteName, c.address);

    const devices: Array<{
      id: string;
      deviceId: string;
      deviceType: "PLC" | "RP2350" | "ESP32" | "TV" | "Gateway";
      label: string;
      online?: boolean;
    }> = [
      { id: `dev-${c.customerCode}-plc`, deviceId: `${c.customerCode}-PLC-01`, deviceType: "PLC", label: "PLC 主制御" },
      { id: `dev-${c.customerCode}-rp`, deviceId: `${c.customerCode}-RP-01`, deviceType: "RP2350", label: "RP2350 ゲートウェイ" },
      { id: `dev-${c.customerCode}-esp`, deviceId: `${c.customerCode}-ESP-01`, deviceType: "ESP32", label: "ESP32 センサー" },
      { id: `dev-${c.customerCode}-gw`, deviceId: `${c.customerCode}-GW-01`, deviceType: "Gateway", label: "MQTT Gateway" },
      { id: `dev-${c.customerCode}-tv`, deviceId: `${c.customerCode}-TV-01`, deviceType: "TV", label: "Google TV", online: true },
    ];

    for (const d of devices) {
      ensureDemoDevice({
        id: d.id,
        customerId: c.customerId,
        siteId: c.siteId,
        deviceId: d.deviceId,
        deviceType: d.deviceType,
        label: d.label,
        online: d.online !== false,
      });
    }

    for (const role of ["owner", "admin", "manager", "installer", "viewer"] as const) {
      const userId = `cu-${c.customerCode}-${role}`;
      db.prepare(
        `INSERT INTO customer_users (id, customer_id, username, password_hash, role, status)
         VALUES (?, ?, ?, ?, ?, 'active')
         ON CONFLICT(customer_id, username) DO NOTHING`
      ).run(userId, c.customerId, `${c.customerCode.toLowerCase()}.${role}`, hash, role);
    }
  }
}
