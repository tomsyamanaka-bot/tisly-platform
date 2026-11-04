/**
 * Keep Rising の施主ログインを追記する。
 * 顧客コードは Rising001。
 * 既存の KEEPRISING001 行は残す。
 * パスワードはハッシュだけを置く。
 */

import { getDatabase } from "../db/database.js";
import { ensureDemoSite, upsertCustomer } from "./customer-store.js";
import { upsertCustomerMasterV1 } from "../shared/customer/customer-master-v1.js";
import { upsertCustomerTenantBindingsV1 } from "../shared/customer/customer-tenant-bindings-v1.js";
import { upsertPropertyMasterV1 } from "../shared/customer/customer-property-master-v1.js";
import { upsertEnabledModulesV1 } from "../tenant/customer-enabled-modules-store-v1.js";

export const RISING_CUSTOMER_CODE_V1 = "RISING001";
export const RISING_CUSTOMER_ID_V1 = "cust-rising001";
export const RISING_USERNAME_V1 = "kp-Rising001";
export const RISING_DISPLAY_NAME_V1 = "Keep Rising";
export const RISING_SECURITY_SITE_ID_V1 = "SEC-JP-KEEPRISING-001";

/**
 * 登録パスワードの scrypt ハッシュ。
 * 平文の定数は置かない。
 */
export const RISING_PASSWORD_HASH_V1 =
  "scrypt:ee01e97f71c47c48c1b42ec7ba23b278:40d36898fb2872046d743eee9aacb565a703ad7b1439a224926e6b091337a3226b4471fbb70c5a8aba22a8a271305525561f70880bb4d1db1eb21e2f0eadce50";

export const RISING_ENABLED_MODULES_V1 = [
  "security_floor_v1",
  "customer_portal",
] as const;

export function ensureRising001CustomerV1(): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  const existing = db
    .prepare(
      `SELECT customer_id FROM customers
       WHERE customer_code = ? COLLATE NOCASE`
    )
    .get(RISING_CUSTOMER_CODE_V1) as
    | { customer_id: string }
    | undefined;
  const customerId = existing?.customer_id || RISING_CUSTOMER_ID_V1;

  upsertCustomer({
    customerId,
    customerCode: RISING_CUSTOMER_CODE_V1,
    customerName: RISING_DISPLAY_NAME_V1,
    plan: "PRO",
    status: "active",
    tenantId: customerId,
    branding: {
      companyColor: "#1e3a8a",
      companyName: RISING_DISPLAY_NAME_V1,
      logoUrl: "/tisly-shield-logo-128.png",
    },
  });

  db.prepare(
    `UPDATE customers SET status = 'active', updated_at = ?
     WHERE customer_code = ? COLLATE NOCASE`
  ).run(now, RISING_CUSTOMER_CODE_V1);

  ensureDemoSite(
    customerId,
    "site-rising001",
    RISING_DISPLAY_NAME_V1,
    "Keep Rising"
  );

  db.prepare(
    `INSERT INTO customer_users
       (id, customer_id, username, password_hash, role, status)
     VALUES (?, ?, ?, ?, 'owner', 'active')
     ON CONFLICT(customer_id, username) DO UPDATE SET
       password_hash = excluded.password_hash,
       role = 'owner',
       status = 'active',
       failed_login_count = 0,
       locked_until = NULL`
  ).run(
    "cu-RISING001-owner",
    customerId,
    RISING_USERNAME_V1,
    RISING_PASSWORD_HASH_V1
  );

  upsertCustomerMasterV1({
    customerCode: RISING_CUSTOMER_CODE_V1,
    customerName: RISING_DISPLAY_NAME_V1,
    address: "",
    contactName: RISING_DISPLAY_NAME_V1,
    contactPhone: "",
    contactEmail: "",
    plan: "PRO",
    status: "active",
    businessCustomerId: customerId,
  });

  upsertCustomerTenantBindingsV1({
    customerCode: RISING_CUSTOMER_CODE_V1,
    rp2350MainId: "rp2350-keeprising-main-01",
    rp2350DetachedId: null,
    nvrHost: null,
    nvrLabel: null,
    nvrRtspBase: null,
  });

  upsertEnabledModulesV1({
    customerCode: RISING_CUSTOMER_CODE_V1,
    enabledModules: [...RISING_ENABLED_MODULES_V1],
    updatedBy: "seed-rising001-v1",
  });

  upsertPropertyMasterV1({
    propertyId: "PROP-RISING001",
    customerCode: RISING_CUSTOMER_CODE_V1,
    propertyName: RISING_DISPLAY_NAME_V1,
    address: "",
    projectRef: RISING_SECURITY_SITE_ID_V1,
    installedDate: null,
    nextInspectionDate: null,
  });
}
