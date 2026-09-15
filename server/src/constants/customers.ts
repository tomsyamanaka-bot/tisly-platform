/**
 * TiSLY 正式顧客コード一覧（静的マスター）
 *
 * 既存テナントは削除せず追記のみ。
 * DB 照会より先に参照してよい定数の正。
 */

export const CANONICAL_LIVE_CUSTOMER_CODES_V1 = [
  "TOMS001",
  "TOYOSHIMA001",
] as const;

export const TESTER_CUSTOMER_CODE_CONST_V1 = "TESTER001";

/** ログイン・スコープ解決に使う全正式顧客コード */
export const ALL_CUSTOMER_CODES_V1 = [
  ...CANONICAL_LIVE_CUSTOMER_CODES_V1,
  TESTER_CUSTOMER_CODE_CONST_V1,
] as const;

export type AllCustomerCodeV1 = (typeof ALL_CUSTOMER_CODES_V1)[number];

export const CUSTOMER_DIRECTORY_V1: Record<
  AllCustomerCodeV1,
  {
    customerCode: AllCustomerCodeV1;
    displayName: string;
    homeSiteId: string;
    securitySiteId: string;
    role: "live" | "tester";
  }
> = {
  TOMS001: {
    customerCode: "TOMS001",
    displayName: "板橋自宅",
    homeSiteId: "HOME-JP-ITABASHI-LIVE",
    securitySiteId: "SEC-JP-ITABASHI-LIVE",
    role: "live",
  },
  TOYOSHIMA001: {
    customerCode: "TOYOSHIMA001",
    displayName: "豊島邸",
    homeSiteId: "HOME-JP-TOYOSHIMA",
    securitySiteId: "SEC-JP-TOYOSHIMA-001",
    role: "live",
  },
  TESTER001: {
    customerCode: "TESTER001",
    displayName: "テスターデモ（板橋）",
    homeSiteId: "HOME-JP-ITABASHI-LIVE",
    securitySiteId: "SEC-JP-ITABASHI-LIVE",
    role: "tester",
  },
};

export function isKnownCustomerCodeV1(code: string | null | undefined): boolean {
  const normalized = String(code ?? "").trim().toUpperCase();
  return (ALL_CUSTOMER_CODES_V1 as readonly string[]).includes(normalized);
}
