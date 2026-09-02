import { hashPassword } from "../auth/password.js";
import { getDatabase } from "../db/database.js";
import {
  ensureDemoDevice,
  ensureDemoSite,
  upsertCustomer,
} from "./customer-store.js";
import { ensureProFloorLayersSeed } from "../pro-remote/floor-map-stack.js";
import {
  ensureCanonicalCustomersV1,
  retireObsoleteDemoCustomersV1,
} from "./retire-obsolete-demo-customers-v1.js";

/** 正規デモ顧客 — 板橋自宅 / 豊島邸 のみ */
const DEMO_CUSTOMERS = [
  {
    customerId: "cust-toms",
    customerCode: "TOMS001",
    customerName: "板橋自宅",
    plan: "PRO_REMOTE" as const,
    companyColor: "#1e3a8a",
    siteId: "site-toms-main",
    siteName: "板橋自宅",
    address: "東京都板橋区",
  },
  {
    customerId: "cust-toyoshima",
    customerCode: "TOYOSHIMA001",
    customerName: "豊島邸",
    plan: "PRO" as const,
    companyColor: "#1e3a8a",
    siteId: "site-toyoshima-main",
    siteName: "豊島邸",
    address: "茨城県",
  },
];

/** @deprecated DEMO001 は退役済み — 互換のため no-op */
export function ensureDemo001Kit(): void {
  // 旧 Demo Kit は retireObsoleteDemoCustomersV1 で削除
}

export function ensureToyoshima001CustomerV1(): void {
  const db = getDatabase();
  const exists = db
    .prepare(
      `SELECT customer_id FROM customers WHERE customer_code = 'TOYOSHIMA001'`
    )
    .get();
  if (exists) return;

  const demoPassword =
    process.env.CUSTOMER_DEMO_PASSWORD ?? "demo-remote-2026";
  const hash = hashPassword(demoPassword);
  const customerId = "cust-toyoshima";
  const siteId = "site-toyoshima-main";

  upsertCustomer({
    customerId,
    customerCode: "TOYOSHIMA001",
    customerName: "豊島邸",
    plan: "PRO",
    tenantId: customerId,
    branding: {
      companyColor: "#1e3a8a",
      companyName: "豊島邸",
      logoUrl: "/assets/customers/toyoshima001-logo.svg",
    },
  });
  ensureDemoSite(customerId, siteId, "豊島邸", "茨城県");

  for (const role of ["owner", "admin", "viewer"] as const) {
    db.prepare(
      `INSERT INTO customer_users
         (id, customer_id, username, password_hash, role, status)
       VALUES (?, ?, ?, ?, ?, 'active')
       ON CONFLICT(customer_id, username) DO NOTHING`
    ).run(
      `cu-TOYOSHIMA001-${role}`,
      customerId,
      `toyoshima001.${role}`,
      hash,
      role
    );
  }
}

/** @deprecated 旧 seed 名互換 */
export function ensureToshima001CustomerV1(): void {
  ensureToyoshima001CustomerV1();
}

export function seedProRemoteCustomers(): void {
  const db = getDatabase();
  const has = db.prepare("SELECT customer_id FROM customers LIMIT 1").get();

  if (!has) {
    const demoPassword =
      process.env.CUSTOMER_DEMO_PASSWORD ?? "demo-remote-2026";
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
        {
          id: `dev-${c.customerCode}-plc`,
          deviceId: `${c.customerCode}-PLC-01`,
          deviceType: "PLC",
          label: "PLC 主制御",
        },
        {
          id: `dev-${c.customerCode}-rp`,
          deviceId: `${c.customerCode}-RP-01`,
          deviceType: "RP2350",
          label: "RP2350 ゲートウェイ",
        },
        {
          id: `dev-${c.customerCode}-esp`,
          deviceId: `${c.customerCode}-ESP-01`,
          deviceType: "ESP32",
          label: "ESP32 センサー",
        },
        {
          id: `dev-${c.customerCode}-gw`,
          deviceId: `${c.customerCode}-GW-01`,
          deviceType: "Gateway",
          label: "MQTT Gateway",
        },
        {
          id: `dev-${c.customerCode}-tv`,
          deviceId: `${c.customerCode}-TV-01`,
          deviceType: "TV",
          label: "Google TV",
          online: true,
        },
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
          `INSERT INTO customer_users
             (id, customer_id, username, password_hash, role, status)
           VALUES (?, ?, ?, ?, ?, 'active')
           ON CONFLICT(customer_id, username) DO NOTHING`
        ).run(
          userId,
          c.customerId,
          `${c.customerCode.toLowerCase()}.${role}`,
          hash,
          role
        );
      }
    }
  } else {
    ensureToyoshima001CustomerV1();
  }

  // 既存 DB でも不要デモを退役し2件へ正規化
  retireObsoleteDemoCustomersV1();
  ensureCanonicalCustomersV1();
  ensureProFloorLayersSeed();
}
