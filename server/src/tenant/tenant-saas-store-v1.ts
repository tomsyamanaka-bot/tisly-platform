/**
 * 組織 SaaS ステータスの読取・更新。
 * 既存顧客・デバイス行は削除せず、
 * NULL 列のみデフォルト埋めで保護する。
 */
import { getDatabase } from "../db/database.js";
import { getCustomerByCode, getCustomerById } from "../customer/customer-store.js";
import {
  monthlyFeeLabelV1,
  normalizeCountryCodeV1,
  normalizeCurrencyV1,
  normalizeMonthlyFeeV1,
  normalizePlanStatusV1,
  planStatusLabelV1,
  regionLabelV1,
  toTenantSaasFieldsV1,
  type TenantCountryCodeV1,
  type TenantCurrencyV1,
  type TenantPlanStatusV1,
  type TenantSaasFieldsV1,
  type TenantSaasStatusViewV1,
} from "./tenant-saas-v1.js";

const CUSTOMER_SAAS_SELECT = `
  customer_id, customer_code, customer_name, plan, status, tenant_id,
  country_code, currency, plan_status, monthly_fee,
  created_at, updated_at
`;

export interface CustomerSaasRowV1 {
  customer_id: string;
  customer_code: string;
  customer_name: string;
  plan: string;
  status: string;
  tenant_id: string | null;
  country_code: string | null;
  currency: string | null;
  plan_status: string | null;
  monthly_fee: number | null;
  created_at: string;
  updated_at: string;
}

export interface DeviceSaasRowV1 {
  id: string;
  device_id: string;
  label: string | null;
  customer_id: string | null;
  tenant_id: string | null;
  country_code: string | null;
  currency: string | null;
  plan_status: string | null;
  monthly_fee: number | null;
}

/** 既存顧客の NULL SaaS 列をデフォルトで埋める */
export function ensureCustomerSaasDefaultsV1(): number {
  const db = getDatabase();
  const result = db
    .prepare(
      `UPDATE customers SET
         country_code = COALESCE(country_code, 'JP'),
         currency = COALESCE(currency, 'JPY'),
         plan_status = COALESCE(plan_status, 'active'),
         monthly_fee = COALESCE(monthly_fee, 0),
         tenant_id = COALESCE(tenant_id, customer_id)
       WHERE country_code IS NULL
          OR currency IS NULL
          OR plan_status IS NULL
          OR monthly_fee IS NULL
          OR tenant_id IS NULL`
    )
    .run();
  return result.changes;
}

/** 既存デバイスの NULL SaaS 列をデフォルトで埋める */
export function ensureDeviceSaasDefaultsV1(): number {
  const db = getDatabase();
  // 顧客テナントを引き継ぎ、未設定のみ埋める
  const result = db
    .prepare(
      `UPDATE devices SET
         tenant_id = COALESCE(
           tenant_id,
           (SELECT c.tenant_id FROM customers c WHERE c.customer_id = devices.customer_id),
           customer_id
         ),
         country_code = COALESCE(
           country_code,
           (SELECT c.country_code FROM customers c WHERE c.customer_id = devices.customer_id),
           'JP'
         ),
         currency = COALESCE(
           currency,
           (SELECT c.currency FROM customers c WHERE c.customer_id = devices.customer_id),
           'JPY'
         ),
         plan_status = COALESCE(
           plan_status,
           (SELECT c.plan_status FROM customers c WHERE c.customer_id = devices.customer_id),
           'active'
         ),
         monthly_fee = COALESCE(
           monthly_fee,
           (SELECT c.monthly_fee FROM customers c WHERE c.customer_id = devices.customer_id),
           0
         )
       WHERE tenant_id IS NULL
          OR country_code IS NULL
          OR currency IS NULL
          OR plan_status IS NULL
          OR monthly_fee IS NULL`
    )
    .run();
  return result.changes;
}

function getCustomerSaasRow(
  customerId: string
): CustomerSaasRowV1 | undefined {
  return getDatabase()
    .prepare(
      `SELECT ${CUSTOMER_SAAS_SELECT}
       FROM customers
       WHERE customer_id = ? AND status != 'deleted'`
    )
    .get(customerId) as CustomerSaasRowV1 | undefined;
}

function countDevicesForCustomer(customerId: string, tenantId: string | null): number {
  const row = getDatabase()
    .prepare(
      `SELECT COUNT(*) as c FROM devices
       WHERE customer_id = ?
          OR tenant_id = ?
          OR json_extract(metadata_json, '$.tenant_id') = ?`
    )
    .get(customerId, tenantId ?? customerId, tenantId ?? customerId) as { c: number };
  return row?.c ?? 0;
}

export function getTenantSaasStatusForCustomerIdV1(
  customerId: string
): TenantSaasStatusViewV1 | null {
  const row = getCustomerSaasRow(customerId);
  if (!row) return null;
  const fields = toTenantSaasFieldsV1(row);
  return {
    ...fields,
    planStatusLabel: planStatusLabelV1(fields.plan_status),
    regionLabel: regionLabelV1(fields.country_code),
    monthlyFeeLabel: monthlyFeeLabelV1(fields.monthly_fee, fields.currency),
    customerCode: row.customer_code,
    customerName: row.customer_name,
    connectedDeviceCount: countDevicesForCustomer(
      row.customer_id,
      fields.tenant_id
    ),
  };
}

export function getTenantSaasStatusForCodeV1(
  customerCode: string
): TenantSaasStatusViewV1 | null {
  const customer = getCustomerByCode(customerCode);
  if (!customer) return null;
  return getTenantSaasStatusForCustomerIdV1(customer.customer_id);
}

export function listDevicesSaasForCustomerV1(
  customerId: string
): Array<DeviceSaasRowV1 & TenantSaasFieldsV1> {
  const customer = getCustomerById(customerId);
  if (!customer) return [];
  const tenantId = customer.tenant_id ?? customerId;
  const rows = getDatabase()
    .prepare(
      `SELECT id, device_id, label, customer_id, tenant_id,
              country_code, currency, plan_status, monthly_fee
       FROM devices
       WHERE customer_id = ?
          OR tenant_id = ?
          OR json_extract(metadata_json, '$.tenant_id') = ?
       ORDER BY device_type, label`
    )
    .all(customerId, tenantId, tenantId) as DeviceSaasRowV1[];

  return rows.map((r) => ({
    ...r,
    ...toTenantSaasFieldsV1(r),
  }));
}

export function updateCustomerSaasV1(
  customerId: string,
  patch: {
    country_code?: TenantCountryCodeV1;
    currency?: TenantCurrencyV1;
    plan_status?: TenantPlanStatusV1;
    monthly_fee?: number;
    tenant_id?: string;
  }
): TenantSaasStatusViewV1 | null {
  const existing = getCustomerSaasRow(customerId);
  if (!existing) return null;

  const country = patch.country_code
    ? normalizeCountryCodeV1(patch.country_code)
    : normalizeCountryCodeV1(existing.country_code);
  const currency = patch.currency
    ? normalizeCurrencyV1(patch.currency, country)
    : normalizeCurrencyV1(existing.currency, country);
  const planStatus = patch.plan_status
    ? normalizePlanStatusV1(patch.plan_status)
    : normalizePlanStatusV1(existing.plan_status);
  const monthlyFee =
    patch.monthly_fee !== undefined
      ? normalizeMonthlyFeeV1(patch.monthly_fee)
      : normalizeMonthlyFeeV1(existing.monthly_fee);
  const tenantId =
    patch.tenant_id?.trim() ||
    existing.tenant_id ||
    existing.customer_id;

  getDatabase()
    .prepare(
      `UPDATE customers SET
         tenant_id = ?,
         country_code = ?,
         currency = ?,
         plan_status = ?,
         monthly_fee = ?,
         updated_at = datetime('now')
       WHERE customer_id = ?`
    )
    .run(tenantId, country, currency, planStatus, monthlyFee, customerId);

  // 同一顧客デバイスへ契約エリアを同期（追記）
  getDatabase()
    .prepare(
      `UPDATE devices SET
         tenant_id = COALESCE(tenant_id, ?),
         country_code = ?,
         currency = ?,
         plan_status = ?,
         monthly_fee = ?
       WHERE customer_id = ?`
    )
    .run(tenantId, country, currency, planStatus, monthlyFee, customerId);

  return getTenantSaasStatusForCustomerIdV1(customerId);
}

/** デモ用: NULL 埋めのみ。既存の契約値は上書きしない */
export function seedDemoTenantSaasV1(): void {
  ensureCustomerSaasDefaultsV1();
  ensureDeviceSaasDefaultsV1();

  const db = getDatabase();
  // TOMS001: 月額 0 のときのみデモ料金を補完
  db.prepare(
    `UPDATE customers SET
       monthly_fee = 9800
     WHERE customer_code = 'TOMS001'
       AND COALESCE(monthly_fee, 0) = 0`
  ).run();
}
