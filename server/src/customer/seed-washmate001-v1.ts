/**
 * ウォッシュメイト龍ヶ崎店 WASHMATE001 を追記する。
 *
 * 豊島邸・板橋自宅の行は改変しない。
 * パスワードはハッシュだけを置き、平文は残さない。
 * 有効機能は Security のみ（HOME は付けない）。
 */

import { getDatabase } from "../db/database.js";
import { ensureDemoSite, upsertCustomer } from "./customer-store.js";
import { upsertCustomerMasterV1 } from "../shared/customer/customer-master-v1.js";
import { upsertCustomerTenantBindingsV1 } from "../shared/customer/customer-tenant-bindings-v1.js";
import { upsertPropertyMasterV1 } from "../shared/customer/customer-property-master-v1.js";
import { upsertEnabledModulesV1 } from "../tenant/customer-enabled-modules-store-v1.js";

export const WASHMATE_CUSTOMER_CODE_V1 = "WASHMATE001";
export const WASHMATE_CUSTOMER_ID_V1 = "cust-washmate";
export const WASHMATE_USERNAME_V1 = "wm-ryougasaki001";
export const WASHMATE_DISPLAY_NAME_V1 = "ウォッシュメイト龍ヶ崎店";
export const WASHMATE_SECURITY_SITE_ID_V1 = "SEC-JP-RYUGASAKI-001";

/**
 * 登録パスワードの scrypt ハッシュ。
 * 直下の平文定数は置かない。
 */
export const WASHMATE_PASSWORD_HASH_V1 =
  "scrypt:4548ed175d19203892d839446ac6d20d:3649df2e24e09c0c6ced237e67e2e5223bb065ce2c96395b13a0654bf64cca34fda4528c4ad7af659e56a3df17f4e45a127bd7f871b817ad921746d83c05a17c";

/** 指示の ["security"] を内部 ID へ正規化したもの */
export const WASHMATE_ENABLED_MODULES_V1 = [
  "security_floor_v1",
  "customer_portal",
] as const;

export function ensureWashmate001CustomerV1(): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  const existing = db
    .prepare(
      `SELECT customer_id FROM customers
       WHERE customer_code = ? COLLATE NOCASE`
    )
    .get(WASHMATE_CUSTOMER_CODE_V1) as
    | { customer_id: string }
    | undefined;
  const customerId = existing?.customer_id || WASHMATE_CUSTOMER_ID_V1;

  upsertCustomer({
    customerId,
    customerCode: WASHMATE_CUSTOMER_CODE_V1,
    customerName: WASHMATE_DISPLAY_NAME_V1,
    plan: "PRO",
    status: "active",
    tenantId: customerId,
    branding: {
      companyColor: "#1e3a8a",
      companyName: WASHMATE_DISPLAY_NAME_V1,
      logoUrl: "/tisly-shield-logo-128.png",
    },
  });

  db.prepare(
    `UPDATE customers SET status = 'active', updated_at = ?
     WHERE customer_code = ? COLLATE NOCASE`
  ).run(now, WASHMATE_CUSTOMER_CODE_V1);

  ensureDemoSite(
    customerId,
    "site-washmate-ryugasaki",
    WASHMATE_DISPLAY_NAME_V1,
    "茨城県龍ヶ崎市"
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
    "cu-WASHMATE001-owner",
    customerId,
    WASHMATE_USERNAME_V1,
    WASHMATE_PASSWORD_HASH_V1
  );

  upsertCustomerMasterV1({
    customerCode: WASHMATE_CUSTOMER_CODE_V1,
    customerName: WASHMATE_DISPLAY_NAME_V1,
    address: "茨城県龍ヶ崎市",
    contactName: WASHMATE_DISPLAY_NAME_V1,
    contactPhone: "048-594-7077",
    contactEmail: "info@toms.co.jp",
    plan: "PRO",
    status: "active",
    businessCustomerId: customerId,
  });

  upsertCustomerTenantBindingsV1({
    customerCode: WASHMATE_CUSTOMER_CODE_V1,
    rp2350MainId: "rp2350-ryugasaki-main-01",
    rp2350DetachedId: null,
    nvrHost: null,
    nvrLabel: null,
    nvrRtspBase: null,
  });

  upsertEnabledModulesV1({
    customerCode: WASHMATE_CUSTOMER_CODE_V1,
    enabledModules: [...WASHMATE_ENABLED_MODULES_V1],
    updatedBy: "seed-washmate001-v1",
  });

  upsertPropertyMasterV1({
    propertyId: "PROP-WASHMATE001",
    customerCode: WASHMATE_CUSTOMER_CODE_V1,
    propertyName: WASHMATE_DISPLAY_NAME_V1,
    address: "茨城県龍ヶ崎市",
    projectRef: WASHMATE_SECURITY_SITE_ID_V1,
    installedDate: null,
    nextInspectionDate: null,
  });
}
