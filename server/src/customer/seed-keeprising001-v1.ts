/**
 * Keep Rising（KEEPRISING001）を追記する。
 * 豊島邸・板橋・龍ヶ崎の行は改変しない。
 * パスワードはハッシュだけを置き、平文は残さない。
 */

import { getDatabase } from "../db/database.js";
import { hashPassword } from "../auth/password.js";
import { ensureDemoSite, upsertCustomer } from "./customer-store.js";
import { upsertCustomerMasterV1 } from "../shared/customer/customer-master-v1.js";
import { upsertCustomerTenantBindingsV1 } from "../shared/customer/customer-tenant-bindings-v1.js";
import { upsertPropertyMasterV1 } from "../shared/customer/customer-property-master-v1.js";
import { upsertEnabledModulesV1 } from "../tenant/customer-enabled-modules-store-v1.js";

export const KEEPRISING_CUSTOMER_CODE_V1 = "KEEPRISING001";
export const KEEPRISING_CUSTOMER_ID_V1 = "cust-keeprising";
export const KEEPRISING_USERNAME_V1 = "keeprising001.owner";
export const KEEPRISING_DISPLAY_NAME_V1 = "Keep Rising";
export const KEEPRISING_SECURITY_SITE_ID_V1 = "SEC-JP-KEEPRISING-001";

export const KEEPRISING_ENABLED_MODULES_V1 = [
  "security_floor_v1",
  "customer_portal",
] as const;

function demoPassword(): string {
  const fromEnv = String(process.env.CUSTOMER_DEMO_PASSWORD ?? "").trim();
  return fromEnv || "demo-remote-2026";
}

export function ensureKeepRising001CustomerV1(): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  const existing = db
    .prepare(
      `SELECT customer_id FROM customers
       WHERE customer_code = ? COLLATE NOCASE`
    )
    .get(KEEPRISING_CUSTOMER_CODE_V1) as
    | { customer_id: string }
    | undefined;
  const customerId = existing?.customer_id || KEEPRISING_CUSTOMER_ID_V1;

  upsertCustomer({
    customerId,
    customerCode: KEEPRISING_CUSTOMER_CODE_V1,
    customerName: KEEPRISING_DISPLAY_NAME_V1,
    plan: "PRO",
    status: "active",
    tenantId: customerId,
    branding: {
      companyColor: "#1e3a8a",
      companyName: KEEPRISING_DISPLAY_NAME_V1,
      logoUrl: "/tisly-shield-logo-128.png",
    },
  });

  db.prepare(
    `UPDATE customers SET status = 'active', updated_at = ?
     WHERE customer_code = ? COLLATE NOCASE`
  ).run(now, KEEPRISING_CUSTOMER_CODE_V1);

  ensureDemoSite(
    customerId,
    "site-keeprising",
    KEEPRISING_DISPLAY_NAME_V1,
    "Keep Rising"
  );

  const user = db
    .prepare(
      `SELECT id FROM customer_users
       WHERE customer_id = ? AND username = ? COLLATE NOCASE`
    )
    .get(customerId, KEEPRISING_USERNAME_V1) as { id: string } | undefined;
  if (!user) {
    db.prepare(
      `INSERT INTO customer_users
         (id, customer_id, username, password_hash, role, status)
       VALUES (?, ?, ?, ?, 'owner', 'active')`
    ).run(
      "cu-KEEPRISING001-owner",
      customerId,
      KEEPRISING_USERNAME_V1,
      hashPassword(demoPassword())
    );
  }

  upsertCustomerMasterV1({
    customerCode: KEEPRISING_CUSTOMER_CODE_V1,
    customerName: KEEPRISING_DISPLAY_NAME_V1,
    address: "",
    contactName: KEEPRISING_DISPLAY_NAME_V1,
    contactPhone: "",
    contactEmail: "",
    plan: "PRO",
    status: "active",
    businessCustomerId: customerId,
  });

  upsertCustomerTenantBindingsV1({
    customerCode: KEEPRISING_CUSTOMER_CODE_V1,
    rp2350MainId: "rp2350-keeprising-main-01",
    rp2350DetachedId: null,
    nvrHost: null,
    nvrLabel: null,
    nvrRtspBase: null,
  });

  upsertEnabledModulesV1({
    customerCode: KEEPRISING_CUSTOMER_CODE_V1,
    enabledModules: [...KEEPRISING_ENABLED_MODULES_V1],
    updatedBy: "seed-keeprising001-v1",
  });

  upsertPropertyMasterV1({
    propertyId: "PROP-KEEPRISING001",
    customerCode: KEEPRISING_CUSTOMER_CODE_V1,
    propertyName: KEEPRISING_DISPLAY_NAME_V1,
    address: "",
    projectRef: KEEPRISING_SECURITY_SITE_ID_V1,
    installedDate: null,
    nextInspectionDate: null,
  });
}
