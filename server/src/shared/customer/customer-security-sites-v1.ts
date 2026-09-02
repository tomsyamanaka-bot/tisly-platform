/**
 * 顧客 / 社内 Security 物件セレクタ v1
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
import {
  resolveCustomerTenantProfileV1,
} from "./customer-tenant-profile-v1.js";

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

/** 社内 / マスター全件（UI 表示対象） */
export function listCustomerSecuritySitesV1(): CustomerSecuritySiteOptionV1[] {
  return listSecurityFloorUiSitesV1().map(mapSiteToCustomerOptionV1);
}

/** 社内オペレーター用（全件動的一覧） */
export function listOperatorSecuritySitesV1(): CustomerSecuritySiteOptionV1[] {
  return listCustomerSecuritySitesV1();
}

/**
 * 顧客ログイン後は自邸 1 件のみ返す
 * （他物件の混入をサーバ側でも遮断）
 */
export function listTenantScopedSecuritySitesV1(
  customerCode: string | null | undefined
): CustomerSecuritySiteOptionV1[] {
  const profile = resolveCustomerTenantProfileV1(customerCode);
  if (!profile) return [];
  const all = listCustomerSecuritySitesV1();
  const matched = all.find((s) => s.siteId === profile.securitySiteId);
  if (matched) {
    return [
      {
        ...matched,
        displayName: customerSiteTitleV1(
          profile.displayName || matched.displayName
        ),
        propertyId: profile.homeSiteId || matched.propertyId,
        homeSiteId: profile.homeSiteId || matched.homeSiteId,
        useToyoshimaDashboard: profile.useToyoshimaDashboard,
      },
    ];
  }
  // マスター未登録でもテナント定義は返す
  return [
    {
      siteId: profile.securitySiteId,
      displayName: customerSiteTitleV1(profile.displayName),
      propertyId: profile.homeSiteId,
      homeSiteId: profile.homeSiteId,
      useToyoshimaDashboard: profile.useToyoshimaDashboard,
      countryCode: "JP",
      addressLabel: "",
    },
  ];
}

/** 既定選択サイト ID */
export function defaultCustomerSecuritySiteIdV1(): string {
  return SECURITY_FLOOR_UI_DEFAULT_SITE_ID_V1;
}

/** セレクタに載せるか（社内全件） */
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
