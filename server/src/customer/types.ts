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

export interface CustomerRow {
  customer_id: string;
  customer_code: string;
  customer_name: string;
  plan: CustomerPlan;
  status: CustomerStatus;
  tenant_id: string | null;
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
