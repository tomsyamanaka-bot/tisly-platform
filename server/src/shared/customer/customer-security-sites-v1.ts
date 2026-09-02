/**
 * 顧客 Security 物件セレクタ v1
 *
 * UI 表示対象サイトをマスターから解決し、
 * 内部 ID を除いた日本語ラベルを返す。
 * カタログ本体は変更せず末尾追記のみ。
 */

import {
  listSecurityFloorUiSitesV1,
  SECURITY_FLOOR_UI_DEFAULT_SITE_ID_V1,
  type SecuritySiteV1,
} from "../../security-floor/security-floor-sites-v1.js";
import { SEC_JP_TOYOSHIMA_SITE_ID_V1 } from "../../home/home-toyoshima-security-v1.js";
import { customerSiteTitleV1 } from "./customer-display-labels-v1.js";

export interface CustomerSecuritySiteOptionV1 {
  siteId: string;
  /** 顧客向け表示名（日本語のみ） */
  displayName: string;
  propertyId: string | null;
  homeSiteId: string | null;
  /** 豊島邸専用ダッシュボード UI */
  useToyoshimaDashboard: boolean;
  countryCode: string;
  addressLabel: string;
}

function mapSiteToCustomerOptionV1(
  site: SecuritySiteV1
): CustomerSecuritySiteOptionV1 {
  const siteId = site.id;
  const propertyId = site.propertyId ?? null;
  return {
    siteId,
    displayName: customerSiteTitleV1(site.displayName),
    propertyId,
    homeSiteId: propertyId,
    useToyoshimaDashboard: siteId === SEC_JP_TOYOSHIMA_SITE_ID_V1,
    countryCode: site.countryCode || "JP",
    addressLabel: site.addressLabel || "",
  };
}

/** 顧客 Security UI セレクタ用物件一覧 */
export function listCustomerSecuritySitesV1(): CustomerSecuritySiteOptionV1[] {
  return listSecurityFloorUiSitesV1().map(mapSiteToCustomerOptionV1);
}

/** 既定選択サイト ID */
export function defaultCustomerSecuritySiteIdV1(): string {
  return SECURITY_FLOOR_UI_DEFAULT_SITE_ID_V1;
}

/** セレクタに載せるか */
export function isCustomerSecuritySiteSelectableV1(
  siteId: string | null | undefined
): boolean {
  const id = String(siteId ?? "").trim();
  if (!id) return false;
  return listCustomerSecuritySitesV1().some((s) => s.siteId === id);
}

/** 表示名を返す（未知 ID はそのまま整形） */
export function customerSecuritySiteLabelV1(
  siteId: string | null | undefined
): string {
  const id = String(siteId ?? "").trim();
  const row = listCustomerSecuritySitesV1().find((s) => s.siteId === id);
  if (row) return row.displayName;
  return customerSiteTitleV1(id || "TiSLY Security");
}
