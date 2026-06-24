import { hashPassword } from "../auth/password.js";
import { getDatabase } from "../db/database.js";
import {
  ensureDemoDevice,
  ensureDemoSite,
  upsertCustomer,
} from "./customer-store.js";
import { ensureProFloorLayersSeed } from "../pro-remote/floor-map-stack.js";

const DEMO_CUSTOMERS = [
  {
    customerId: "cust-toms",
    customerCode: "TOMS001",
    customerName: "TOMS設備デモ",
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

export function ensureDemo001Kit(): void {
  const db = getDatabase();
  const exists = db
    .prepare(`SELECT customer_id FROM customers WHERE customer_code = 'DEMO001'`)
    .get();
  if (exists) return;

  const demoPassword = process.env.CUSTOMER_DEMO_PASSWORD ?? "demo-remote-2026";
  const hash = hashPassword(demoPassword);
  const customerId = "cust-demo001";
  const siteId = "site-demo-house";

  upsertCustomer({
    customerId,
    customerCode: "DEMO001",
    customerName: "TiSLY Demo Kit",
    plan: "PRO_REMOTE",
    tenantId: customerId,
    branding: {
      companyColor: "#0ea5e9",
      companyName: "TiSLY Demo Kit",
      logoUrl: "/assets/customers/demo001-logo.svg",
    },
  });
  ensureDemoSite(customerId, siteId, "DEMO-HOUSE", "デモ展示");

  const zones = [
    { id: "zone-demo-living", name: "Living" },
    { id: "zone-demo-entrance", name: "Entrance" },
    { id: "zone-demo-garage", name: "Garage" },
  ];
  for (const z of zones) {
    db.prepare(
      `INSERT INTO zones (id, site_id, name) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING`
    ).run(z.id, siteId, z.name);
  }

  const kitDevices = [
    { id: "dev-demo-living", deviceId: "DEMO-ESP-LIVING", label: "Living ESP32-S3", zone: "zone-demo-living" },
    { id: "dev-demo-entrance", deviceId: "DEMO-ESP-ENTRANCE", label: "Entrance ESP32-S3", zone: "zone-demo-entrance" },
    { id: "dev-demo-garage", deviceId: "DEMO-ESP-GARAGE", label: "Garage ESP32-S3", zone: "zone-demo-garage" },
  ];
  for (const d of kitDevices) {
    db.prepare(
      `INSERT INTO devices (id, customer_id, site_id, zone_id, device_id, device_type, platform, label,
        device_status, commissioning_status, metadata_json)
       VALUES (?, ?, ?, ?, ?, 'ESP32', 'demo-kit', ?, 'COMMISSIONING', 'claimed', ?)
       ON CONFLICT(id) DO NOTHING`
    ).run(
      d.id,
      customerId,
      siteId,
      d.zone,
      d.deviceId,
      d.label,
      JSON.stringify({ demo_kit: true })
    );
  }

  for (const role of ["owner", "admin", "installer", "viewer"] as const) {
    db.prepare(
      `INSERT INTO customer_users (id, customer_id, username, password_hash, role, status)
       VALUES (?, ?, ?, ?, ?, 'active')
       ON CONFLICT(customer_id, username) DO NOTHING`
    ).run(`cu-DEMO001-${role}`, customerId, `demo001.${role}`, hash, role);
  }
}

export function seedProRemoteCustomers(): void {
  const db = getDatabase();
  const has = db.prepare("SELECT customer_id FROM customers LIMIT 1").get();
  if (has) {
    ensureDemo001Kit();
    ensureProFloorLayersSeed();
    return;
  }

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

    for (const role of [
      "owner",
      "admin",
      "manager",
      "installer",
      "surveyor",
      "maintenance",
      "viewer",
    ] as const) {
      const userId = `cu-${c.customerCode}-${role}`;
      db.prepare(
        `INSERT INTO customer_users (id, customer_id, username, password_hash, role, status)
         VALUES (?, ?, ?, ?, ?, 'active')
         ON CONFLICT(customer_id, username) DO NOTHING`
      ).run(userId, c.customerId, `${c.customerCode.toLowerCase()}.${role}`, hash, role);
    }
  }
  ensureDemo001Kit();
  ensureProFloorLayersSeed();
}
