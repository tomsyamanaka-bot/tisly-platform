export type CustomerPlan = "Lite" | "Standard" | "PRO" | "PRO_REMOTE";
export type CustomerStatus = "active" | "suspended" | "deleted";
export type CustomerRole =
  | "owner"
  | "admin"
  | "manager"
  | "installer"
  | "viewer"
  | "super_admin";
export type DeviceTypePro = "PLC" | "RP2350" | "ESP32" | "TV" | "Gateway";

/** SaaS 展開用: 国・通貨・契約状態 */
export type CustomerCountryCode = "JP" | "AU";
export type CustomerCurrency = "JPY" | "AUD";
export type CustomerPlanStatus = "active" | "trial" | "canceled";

export interface CustomerRow {
  customer_id: string;
  customer_code: string;
  customer_name: string;
  plan: CustomerPlan;
  status: CustomerStatus;
  tenant_id: string | null;
  /** 組織の設定エリア（既定 JP） */
  country_code?: CustomerCountryCode | null;
  /** 請求通貨（既定 JPY） */
  currency?: CustomerCurrency | null;
  /** SaaS 契約ステータス */
  plan_status?: CustomerPlanStatus | null;
  /** 月額利用料 */
  monthly_fee?: number | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerBrandingRow {
  customer_id: string;
  logo_url: string | null;
  company_color: string;
  company_name: string | null;
}

export interface CustomerUserRow {
  id: string;
  customer_id: string;
  username: string;
  password_hash: string;
  role: CustomerRole;
  status: string;
}

export interface CustomerSiteRow {
  site_id: string;
  customer_id: string;
  site_name: string;
  address: string | null;
  timezone: string | null;
  lat: number | null;
  lng: number | null;
}
