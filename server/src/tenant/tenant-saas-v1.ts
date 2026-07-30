/**
 * 組織（Tenant）と SaaS 契約ステータスの
 * 共通型・ラベル定義。
 * 既存 plan / subscription_status は維持し、
 * マルチ通貨・AU 展開向けに追記する。
 */

export type TenantCountryCodeV1 = "JP" | "AU";
export type TenantCurrencyV1 = "JPY" | "AUD";
export type TenantPlanStatusV1 = "active" | "trial" | "canceled";

export const TENANT_SAAS_DEFAULTS_V1 = {
  country_code: "JP" as TenantCountryCodeV1,
  currency: "JPY" as TenantCurrencyV1,
  plan_status: "active" as TenantPlanStatusV1,
  monthly_fee: 0,
} as const;

/** SaaS 契約フィールド（顧客・デバイス共通） */
export interface TenantSaasFieldsV1 {
  tenant_id: string | null;
  country_code: TenantCountryCodeV1;
  currency: TenantCurrencyV1;
  plan_status: TenantPlanStatusV1;
  monthly_fee: number;
}

export interface TenantSaasStatusViewV1 extends TenantSaasFieldsV1 {
  /** 日本語表示: 稼働中 / 試用期間中 / 解約済 */
  planStatusLabel: string;
  /** 日本語表示: 日本 / オーストラリア */
  regionLabel: string;
  /** 月額表示（通貨付き） */
  monthlyFeeLabel: string;
  customerCode: string | null;
  customerName: string | null;
  connectedDeviceCount: number;
}

const PLAN_STATUS_LABELS: Record<TenantPlanStatusV1, string> = {
  active: "稼働中",
  trial: "試用期間中",
  canceled: "解約済",
};

const REGION_LABELS: Record<TenantCountryCodeV1, string> = {
  JP: "日本",
  AU: "オーストラリア",
};

export function normalizeCountryCodeV1(
  value: unknown
): TenantCountryCodeV1 {
  // 未設定・不正値は JP にフォールバック
  return value === "AU" ? "AU" : "JP";
}

export function normalizeCurrencyV1(
  value: unknown,
  country?: TenantCountryCodeV1
): TenantCurrencyV1 {
  if (value === "AUD" || value === "JPY") return value;
  // 国コードから通貨を推定
  return country === "AU" ? "AUD" : "JPY";
}

export function normalizePlanStatusV1(
  value: unknown
): TenantPlanStatusV1 {
  if (value === "trial" || value === "canceled") return value;
  return "active";
}

export function normalizeMonthlyFeeV1(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

export function planStatusLabelV1(
  status: TenantPlanStatusV1
): string {
  return PLAN_STATUS_LABELS[status] ?? PLAN_STATUS_LABELS.active;
}

export function regionLabelV1(
  country: TenantCountryCodeV1
): string {
  return REGION_LABELS[country] ?? REGION_LABELS.JP;
}

export function monthlyFeeLabelV1(
  fee: number,
  currency: TenantCurrencyV1
): string {
  if (currency === "AUD") {
    return `A$${fee.toLocaleString("en-AU", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })} / 月`;
  }
  return `¥${Math.round(fee).toLocaleString("ja-JP")} / 月`;
}

export function toTenantSaasFieldsV1(row: {
  tenant_id?: string | null;
  country_code?: string | null;
  currency?: string | null;
  plan_status?: string | null;
  monthly_fee?: number | null;
}): TenantSaasFieldsV1 {
  const country = normalizeCountryCodeV1(row.country_code);
  return {
    tenant_id: row.tenant_id ?? null,
    country_code: country,
    currency: normalizeCurrencyV1(row.currency, country),
    plan_status: normalizePlanStatusV1(row.plan_status),
    monthly_fee: normalizeMonthlyFeeV1(row.monthly_fee),
  };
}
