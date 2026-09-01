/**
 * Customer Master — お客様ポータル用顧客マスター（DOM 非依存 · React Native 流用）
 */

import { getDatabase } from "../../db/database.js";
import { getCustomerByCode } from "../../customer/customer-store.js";

export type CustomerPortalPlanV1 = "Free" | "Notify" | "Standard" | "PRO" | "Enterprise";
export type CustomerPortalStatusV1 = "active" | "suspended" | "deleted";

export interface CustomerMasterV1 {
  customerCode: string;
  customerName: string;
  address: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  plan: CustomerPortalPlanV1;
  status: CustomerPortalStatusV1;
  businessCustomerId: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToMaster(row: Record<string, unknown>): CustomerMasterV1 {
  return {
    customerCode: String(row.customer_code),
    customerName: String(row.customer_name),
    address: String(row.address ?? ""),
    contactName: String(row.contact_name ?? ""),
    contactPhone: String(row.contact_phone ?? ""),
    contactEmail: String(row.contact_email ?? ""),
    plan: normalizeCustomerPortalPlanV1(String(row.plan ?? "Standard")),
    status: (String(row.status ?? "active") as CustomerPortalStatusV1) || "active",
    businessCustomerId: row.business_customer_id != null ? String(row.business_customer_id) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export function normalizeCustomerPortalPlanV1(plan: string): CustomerPortalPlanV1 {
  const p = String(plan ?? "").trim();
  if (p === "Free" || p === "Notify" || p === "Standard" || p === "PRO" || p === "Enterprise") {
    return p;
  }
  if (p === "PRO_REMOTE" || p === "Lite") return "PRO";
  return "Standard";
}

export function listCustomerMastersV1(activeOnly = true): CustomerMasterV1[] {
  const sql = activeOnly
    ? `SELECT * FROM customer_portal_master WHERE status = 'active' ORDER BY customer_name ASC`
    : `SELECT * FROM customer_portal_master ORDER BY customer_name ASC`;
  return (getDatabase().prepare(sql).all() as Array<Record<string, unknown>>).map(rowToMaster);
}

export function getCustomerMasterV1(customerCode: string): CustomerMasterV1 | null {
  const code = String(customerCode ?? "").trim().toUpperCase();
  if (!code) return null;
  const row = getDatabase()
    .prepare(`SELECT * FROM customer_portal_master WHERE customer_code = ? COLLATE NOCASE`)
    .get(code) as Record<string, unknown> | undefined;
  return row ? rowToMaster(row) : null;
}

export function upsertCustomerMasterV1(input: Omit<CustomerMasterV1, "createdAt" | "updatedAt">): CustomerMasterV1 {
  const now = new Date().toISOString();
  const code = input.customerCode.trim().toUpperCase();
  getDatabase()
    .prepare(
      `INSERT INTO customer_portal_master
       (customer_code, customer_name, address, contact_name, contact_phone, contact_email, plan, status, business_customer_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(customer_code) DO UPDATE SET
         customer_name = excluded.customer_name,
         address = excluded.address,
         contact_name = excluded.contact_name,
         contact_phone = excluded.contact_phone,
         contact_email = excluded.contact_email,
         plan = excluded.plan,
         status = excluded.status,
         business_customer_id = excluded.business_customer_id,
         updated_at = excluded.updated_at`
    )
    .run(
      code,
      input.customerName,
      input.address ?? "",
      input.contactName ?? "",
      input.contactPhone ?? "",
      input.contactEmail ?? "",
      normalizeCustomerPortalPlanV1(input.plan ?? "Standard"),
      input.status ?? "active",
      input.businessCustomerId,
      now,
      now
    );
  return getCustomerMasterV1(code)!;
}

export function countCustomerMastersV1(): number {
  const row = getDatabase()
    .prepare(`SELECT COUNT(*) AS c FROM customer_portal_master WHERE status = 'active'`)
    .get() as { c: number };
  return row.c;
}

/** PRO Remote tenants + デモ seed を Customer Master へ同期 */
export function syncCustomerMasterFromTenantsV1(): number {
  let synced = 0;
  for (const code of ["TOMS001", "HOTEL001", "PLANT001", "TOSHIMA001"]) {
    const tenant = getCustomerByCode(code);
    if (!tenant) continue;
    const existing = getCustomerMasterV1(code);
    if (existing) continue;
    const defaults: Record<string, Partial<CustomerMasterV1>> = {
      TOMS001: {
        customerName: "TOMS設備デモ",
        address: "守谷市",
        contactName: "山中様",
        contactPhone: "048-594-7077",
        contactEmail: "info@toms.co.jp",
        plan: "PRO",
      },
      TOSHIMA001: {
        customerName: "豊島邸",
        address: "茨城県",
        contactName: "豊島様",
        contactPhone: "048-594-7077",
        contactEmail: "info@toms.co.jp",
        plan: "PRO",
      },
    };
    const d = defaults[code] ?? {};
    upsertCustomerMasterV1({
      customerCode: code,
      customerName: d.customerName ?? tenant.customer_name,
      address: d.address ?? "",
      contactName: d.contactName ?? "",
      contactPhone: d.contactPhone ?? "",
      contactEmail: d.contactEmail ?? "info@toms.co.jp",
      plan: normalizeCustomerPortalPlanV1(String(d.plan ?? tenant.plan ?? "PRO")),
      status: "active",
      businessCustomerId: null,
    });
    synced += 1;
  }
  return synced;
}
