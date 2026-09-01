/**
 * お客様テナントプロファイル v1
 *
 * 顧客コードから Security / HOME 物件 ID を
 * 解決する（URL パラメータ不要）。
 * 既存マップは削除せず末尾追記のみ。
 */

import { SECURITY_FLOOR_ITABASHI_LIVE_SITE_ID_V1 } from "../../security-floor/security-floor-sites-v1.js";
import { HOME_ITABASHI_LIVE_SITE_ID_V1 } from "../../home/home-sites-v1.js";
import {
  HOME_JP_TOSHIMA_SITE_ID_V1,
  SEC_JP_TOSHIMA_SITE_ID_V1,
} from "../../home/home-toshima-security-v1.js";

export interface CustomerTenantProfileV1 {
  customerCode: string;
  displayName: string;
  /** Security Floor サイト ID */
  securitySiteId: string;
  /** TiSLY HOME 物件 ID */
  homeSiteId: string;
  /** 豊島邸専用 UI を使うか */
  useToshimaDashboard: boolean;
}

/** 顧客コード別プロファイル（追記のみ） */
const CUSTOMER_TENANT_PROFILES_V1: Record<
  string,
  Omit<CustomerTenantProfileV1, "customerCode">
> = {
  TOMS001: {
    displayName: "板橋自宅",
    securitySiteId: SECURITY_FLOOR_ITABASHI_LIVE_SITE_ID_V1,
    homeSiteId: HOME_ITABASHI_LIVE_SITE_ID_V1,
    useToshimaDashboard: false,
  },
  /** 板橋自宅の別コード（互換） */
  HOME001: {
    displayName: "板橋自宅",
    securitySiteId: SECURITY_FLOOR_ITABASHI_LIVE_SITE_ID_V1,
    homeSiteId: HOME_ITABASHI_LIVE_SITE_ID_V1,
    useToshimaDashboard: false,
  },
  TOSHIMA001: {
    displayName: "豊島邸（Toshima Residence）",
    securitySiteId: SEC_JP_TOSHIMA_SITE_ID_V1,
    homeSiteId: HOME_JP_TOSHIMA_SITE_ID_V1,
    useToshimaDashboard: true,
  },
};

/** 顧客コードを正規化（エイリアス含む） */
export function normalizeCustomerTenantCodeV1(
  code: string | null | undefined
): string {
  return String(code ?? "").trim().toUpperCase();
}

/** 登録済みテナントプロファイルを返す */
export function resolveCustomerTenantProfileV1(
  customerCode: string | null | undefined
): CustomerTenantProfileV1 | null {
  const code = normalizeCustomerTenantCodeV1(customerCode);
  if (!code) return null;
  const row = CUSTOMER_TENANT_PROFILES_V1[code];
  if (!row) return null;
  return { customerCode: code, ...row };
}

/** Security 画面用サイト ID */
export function resolveCustomerSecuritySiteIdV1(
  customerCode: string | null | undefined
): string | null {
  return resolveCustomerTenantProfileV1(customerCode)?.securitySiteId ?? null;
}

/** 登録済み顧客コード一覧（追記分のみ） */
export function listCustomerTenantProfileCodesV1(): string[] {
  return Object.keys(CUSTOMER_TENANT_PROFILES_V1);
}
