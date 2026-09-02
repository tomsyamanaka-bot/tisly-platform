/**
 * 不要デモ顧客の退役（soft-delete）
 *
 * 社内顧客管理を
 * 豊島邸 / 板橋自宅 の2件に正規化する。
 */

import { getDatabase } from "../db/database.js";
import { hashPassword } from "../auth/password.js";
import {
  ensureDemoSite,
  getCustomerByCode,
  upsertCustomer,
} from "./customer-store.js";
import { upsertCustomerMasterV1 } from "../shared/customer/customer-master-v1.js";
import { upsertEnabledModulesV1 } from "../tenant/customer-enabled-modules-store-v1.js";
import { upsertCustomerTenantBindingsV1 } from "../shared/customer/customer-tenant-bindings-v1.js";

/** 顧客リストから除外する旧デモコード */
export const OBSOLETE_DEMO_CUSTOMER_CODES_V1 = [
  "HOTEL001",
  "PLANT001",
  "FACTORY-DEMO",
  "MINPAKU-DEMO",
  "TOMS002",
  "DEMO001",
  "TISLY-DEMO",
  "TOSHIMA001",
  "HOME001",
] as const;

/** 本番表示する正規顧客コード */
export const CANONICAL_CUSTOMER_CODES_V1 = [
  "TOMS001",
  "TOYOSHIMA001",
] as const;

/** 旧デモ汚染コード判定（正規2件以外） */
export function isObsoleteDemoCustomerCodeV1(code: string): boolean {
  const c = String(code || "").trim().toUpperCase();
  if (!c) return false;
  if ((CANONICAL_CUSTOMER_CODES_V1 as readonly string[]).includes(c)) {
    return false;
  }
  if ((OBSOLETE_DEMO_CUSTOMER_CODES_V1 as readonly string[]).includes(c)) {
    return true;
  }
  // TOMS002〜TOMS099 / TEST* / DEMO* 等の汚染を除外
  if (/^TOMS\d{3,}$/.test(c) && c !== "TOMS001") return true;
  if (/^(TEST|DEMO|HOTEL|PLANT|FACTORY|MINPAKU|TISLY)/.test(c)) {
    return true;
  }
  return false;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** 旧デモ顧客を deleted にし一覧から外す */
export function retireObsoleteDemoCustomersV1(): {
  retired: string[];
  kept: string[];
} {
  const db = getDatabase();
  const now = nowIso();
  const retired = new Set<string>();

  const activeRows = db
    .prepare(
      `SELECT customer_code FROM customers WHERE status = 'active'`
    )
    .all() as Array<{ customer_code: string }>;

  for (const row of activeRows) {
    const code = String(row.customer_code || "").toUpperCase();
    if (!isObsoleteDemoCustomerCodeV1(code)) continue;
    db.prepare(
      `UPDATE customers
       SET status = 'deleted', updated_at = ?
       WHERE customer_code = ? COLLATE NOCASE
         AND status != 'deleted'`
    ).run(now, code);
    db.prepare(
      `UPDATE customer_portal_master
       SET status = 'deleted', updated_at = ?
       WHERE customer_code = ? COLLATE NOCASE
         AND status != 'deleted'`
    ).run(now, code);
    retired.add(code);
  }

  // 明示リストも漏れなく退役
  for (const code of OBSOLETE_DEMO_CUSTOMER_CODES_V1) {
    const result = db
      .prepare(
        `UPDATE customers
         SET status = 'deleted', updated_at = ?
         WHERE customer_code = ? COLLATE NOCASE
           AND status != 'deleted'`
      )
      .run(now, code);
    if (result.changes > 0) retired.add(code);
    db.prepare(
      `UPDATE customer_portal_master
       SET status = 'deleted', updated_at = ?
       WHERE customer_code = ? COLLATE NOCASE
         AND status != 'deleted'`
    ).run(now, code);
  }

  return {
    retired: [...retired],
    kept: [...CANONICAL_CUSTOMER_CODES_V1],
  };
}

/** 板橋自宅・豊島邸を active で正規化 */
export function ensureCanonicalCustomersV1(): void {
  const demoPassword =
    process.env.CUSTOMER_DEMO_PASSWORD ?? "demo-remote-2026";
  const hash = hashPassword(demoPassword);
  const db = getDatabase();
  const now = nowIso();

  // 板橋自宅（TOMS001）
  const toms = getCustomerByCode("TOMS001");
  if (toms) {
    upsertCustomer({
      customerId: toms.customer_id,
      customerCode: "TOMS001",
      customerName: "板橋自宅",
      plan: "PRO_REMOTE",
      tenantId: toms.tenant_id ?? toms.customer_id,
      branding: {
        companyColor: "#1e3a8a",
        companyName: "板橋自宅",
        logoUrl: "/assets/customers/toms001-logo.svg",
      },
    });
    db.prepare(
      `UPDATE customers SET status = 'active', updated_at = ?
       WHERE customer_code = 'TOMS001'`
    ).run(now);
  }

  upsertCustomerMasterV1({
    customerCode: "TOMS001",
    customerName: "板橋自宅",
    address: "東京都板橋区",
    contactName: "山中様",
    contactPhone: "048-594-7077",
    contactEmail: "info@toms.co.jp",
    plan: "PRO",
    status: "active",
    businessCustomerId: toms?.customer_id ?? null,
  });

  upsertCustomerTenantBindingsV1({
    customerCode: "TOMS001",
    rp2350MainId: "rp2350-itabashi-main-01",
    rp2350DetachedId: null,
    nvrHost: "192.168.1.80",
    nvrLabel: "H.View NVR（板橋自宅）",
    nvrRtspBase: "rtsp://192.168.1.80:554",
  });

  // 社内 /app は全機能、/customer はポータル既定で制御
  upsertEnabledModulesV1({
    customerCode: "TOMS001",
    enabledModules: ["*"],
    updatedBy: "canonical-customers-v1",
  });

  // 豊島邸（TOYOSHIMA001）
  let toyoshima = getCustomerByCode("TOYOSHIMA001");
  if (!toyoshima) {
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
    toyoshima = getCustomerByCode("TOYOSHIMA001");
  } else {
    upsertCustomer({
      customerId: toyoshima.customer_id,
      customerCode: "TOYOSHIMA001",
      customerName: "豊島邸",
      plan: "PRO",
      tenantId: toyoshima.tenant_id ?? toyoshima.customer_id,
      branding: {
        companyColor: "#1e3a8a",
        companyName: "豊島邸",
        logoUrl: "/assets/customers/toyoshima001-logo.svg",
      },
    });
  }

  db.prepare(
    `UPDATE customers SET status = 'active', updated_at = ?
     WHERE customer_code = 'TOYOSHIMA001'`
  ).run(now);

  upsertCustomerMasterV1({
    customerCode: "TOYOSHIMA001",
    customerName: "豊島邸",
    address: "茨城県",
    contactName: "豊島様",
    contactPhone: "048-594-7077",
    contactEmail: "info@toms.co.jp",
    plan: "PRO",
    status: "active",
    businessCustomerId: toyoshima?.customer_id ?? null,
  });

  upsertCustomerTenantBindingsV1({
    customerCode: "TOYOSHIMA001",
    rp2350MainId: "rp2350-toyoshima-main-01",
    rp2350DetachedId: "rp2350-toyoshima-detached-01",
    nvrHost: "192.168.10.50",
    nvrLabel: "H.View NVR（豊島邸）",
    nvrRtspBase: "rtsp://192.168.10.50:554",
  });

  upsertEnabledModulesV1({
    customerCode: "TOYOSHIMA001",
    enabledModules: [
      "security_floor_v1",
      "camera_preview_v1",
      "customer_portal",
    ],
    updatedBy: "canonical-customers-v1",
  });

  // 正規ユーザーを保証
  const tomsRow = getCustomerByCode("TOMS001");
  const toyoshimaRow = getCustomerByCode("TOYOSHIMA001");
  const owners: Array<{
    code: string;
    customerId: string;
    username: string;
  }> = [];
  if (tomsRow) {
    owners.push({
      code: "TOMS001",
      customerId: tomsRow.customer_id,
      username: "toms001.owner",
    });
  }
  if (toyoshimaRow) {
    owners.push({
      code: "TOYOSHIMA001",
      customerId: toyoshimaRow.customer_id,
      username: "toyoshima001.owner",
    });
  }

  for (const o of owners) {
    db.prepare(
      `INSERT INTO customer_users
         (id, customer_id, username, password_hash, role, status)
       VALUES (?, ?, ?, ?, 'owner', 'active')
       ON CONFLICT(customer_id, username) DO UPDATE SET
         password_hash = excluded.password_hash,
         status = 'active',
         failed_login_count = 0,
         locked_until = NULL`
    ).run(`cu-${o.code}-owner`, o.customerId, o.username, hash);
  }
}
