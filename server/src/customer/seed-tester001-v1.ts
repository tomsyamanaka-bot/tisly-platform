/**
 * テスター専用アカウント TESTER001 を追記する。
 *
 * 既存の板橋・豊島データは
 * 1文字も削除・初期化しない。
 * パスワードは専用値でハッシュ保存する。
 */

import { hashPassword } from "../auth/password.js";
import { getDatabase } from "../db/database.js";
import { upsertEnabledModulesV1 } from "../tenant/customer-enabled-modules-store-v1.js";
import { upsertCustomerMasterV1 } from "../shared/customer/customer-master-v1.js";
import { upsertCustomerTenantBindingsV1 } from "../shared/customer/customer-tenant-bindings-v1.js";
import { upsertPropertyMasterV1 } from "../shared/customer/customer-property-master-v1.js";
import {
  TESTER_CUSTOMER_CODE_V1,
  TESTER_CUSTOMER_ID_V1,
  TESTER_DISPLAY_NAME_V1,
  TESTER_ENABLED_MODULES_V1,
  TESTER_HOME_SITE_ID_V1,
  TESTER_PROPERTY_ID_V1,
  TESTER_RP2350_MAIN_ID_V1,
  TESTER_SITE_ID_V1,
  TESTER_USERNAME_V1,
} from "../shared/customer/tester-tenant-v1.js";
import { ensureDemoSite, upsertCustomer } from "./customer-store.js";

/** テスター初期パスワード（ENV で上書き可） */
export const TESTER001_DEFAULT_PASSWORD_V1 = "tisly-test-2026";

function resolveTesterPasswordV1(): string {
  const fromEnv = String(process.env.TESTER001_PASSWORD ?? "").trim();
  return fromEnv || TESTER001_DEFAULT_PASSWORD_V1;
}

/**
 * TESTER001 を active で保証する。
 * 既存顧客行は改変せず、本テナントのみ upsert。
 */
export function ensureTester001CustomerV1(): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  const hash = hashPassword(resolveTesterPasswordV1());

  const existing = db
    .prepare(
      `SELECT customer_id FROM customers
       WHERE customer_code = ? COLLATE NOCASE`
    )
    .get(TESTER_CUSTOMER_CODE_V1) as { customer_id: string } | undefined;
  const customerId = existing?.customer_id || TESTER_CUSTOMER_ID_V1;

  upsertCustomer({
    customerId,
    customerCode: TESTER_CUSTOMER_CODE_V1,
    customerName: TESTER_DISPLAY_NAME_V1,
    plan: "PRO",
    status: "active",
    tenantId: customerId,
    branding: {
      companyColor: "#1e3a8a",
      companyName: TESTER_DISPLAY_NAME_V1,
      logoUrl: "/assets/customers/toms001-logo.svg",
    },
  });

  db.prepare(
    `UPDATE customers SET status = 'active', updated_at = ?
     WHERE customer_code = ? COLLATE NOCASE`
  ).run(now, TESTER_CUSTOMER_CODE_V1);

  ensureDemoSite(
    customerId,
    TESTER_SITE_ID_V1,
    TESTER_DISPLAY_NAME_V1,
    "東京都板橋区"
  );

  db.prepare(
    `INSERT INTO customer_users
       (id, customer_id, username, password_hash, role, status)
     VALUES (?, ?, ?, ?, 'viewer', 'active')
     ON CONFLICT(customer_id, username) DO UPDATE SET
       password_hash = excluded.password_hash,
       role = 'viewer',
       status = 'active',
       failed_login_count = 0,
       locked_until = NULL`
  ).run(
    `cu-${TESTER_CUSTOMER_CODE_V1}-user`,
    customerId,
    TESTER_USERNAME_V1,
    hash
  );

  upsertCustomerMasterV1({
    customerCode: TESTER_CUSTOMER_CODE_V1,
    customerName: TESTER_DISPLAY_NAME_V1,
    address: "東京都板橋区",
    contactName: "テスター",
    contactPhone: "048-594-7077",
    contactEmail: "tester@tisly.jp",
    plan: "PRO",
    status: "active",
    businessCustomerId: customerId,
  });

  upsertCustomerTenantBindingsV1({
    customerCode: TESTER_CUSTOMER_CODE_V1,
    rp2350MainId: TESTER_RP2350_MAIN_ID_V1,
    rp2350DetachedId: null,
    nvrHost: "192.168.1.80",
    nvrLabel: "H.View NVR（板橋自宅）",
    nvrRtspBase: "rtsp://192.168.1.80:554",
  });

  upsertEnabledModulesV1({
    customerCode: TESTER_CUSTOMER_CODE_V1,
    enabledModules: [...TESTER_ENABLED_MODULES_V1],
    updatedBy: "seed-tester001-v1",
  });

  upsertPropertyMasterV1({
    propertyId: TESTER_PROPERTY_ID_V1,
    customerCode: TESTER_CUSTOMER_CODE_V1,
    propertyName: TESTER_DISPLAY_NAME_V1,
    address: "東京都板橋区",
    projectRef: TESTER_HOME_SITE_ID_V1,
    installedDate: null,
    nextInspectionDate: null,
  });
}
