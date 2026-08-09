/**
 * TiSLY Eco-Water 複数現場カタログ
 * 既存デモ現場を維持しつつ
 * 営業用サイトを追記する
 */

/** 既定現場（既存デモと同一） */
export const ECO_WATER_DEFAULT_SITE_ID_V1 = "moriya-pit-a";

/**
 * デフォルト3現場
 * 先頭＝既存守谷ピットを維持
 * @type {readonly object[]}
 */
export const ECO_WATER_SITES_V1 = Object.freeze([
  {
    id: "moriya-pit-a",
    siteName: "守谷生コンプラント / 排水ピット A",
    companyName: "株式会社TOMS",
    calibrationDate: "2026/08/01",
    nextCalibrationDate: "2026/09/01",
    hashIdPrefix: "EW-MRY",
    defaultPh: 7.2,
  },
  {
    id: "tsukuba-tank-b",
    siteName: "筑波解体現場 / 水処理槽 B",
    companyName: "株式会社TOMS",
    calibrationDate: "2026/07/28",
    nextCalibrationDate: "2026/08/28",
    hashIdPrefix: "EW-TKB",
    defaultPh: 7.4,
  },
  {
    id: "tsuchiura-caustic",
    siteName: "土浦食品工場 / 苛性洗浄排水ピット",
    companyName: "株式会社TOMS",
    calibrationDate: "2026/08/05",
    nextCalibrationDate: "2026/09/05",
    hashIdPrefix: "EW-TSC",
    defaultPh: 7.1,
  },
]);

/**
 * 現場IDから定義を解決
 * 不明時は既定現場へフォールバック
 * @param {string | null | undefined} siteId
 */
export function findEcoWaterSiteV1(siteId) {
  const id = String(siteId || "").trim();
  const found = ECO_WATER_SITES_V1.find((s) => s.id === id);
  if (found) return found;
  // LIVE API 用: EW-TKB 等の Prefix も解決
  const byPrefix = findEcoWaterSiteByPrefixV1(id);
  if (byPrefix) return byPrefix;
  return (
    ECO_WATER_SITES_V1.find((s) => s.id === ECO_WATER_DEFAULT_SITE_ID_V1) ||
    ECO_WATER_SITES_V1[0]
  );
}

/**
 * ハッシュ Prefix（EW-TKB）から現場解決
 * @param {string | null | undefined} prefix
 */
export function findEcoWaterSiteByPrefixV1(prefix) {
  const key = String(prefix || "")
    .trim()
    .toUpperCase();
  if (!key) return null;
  return (
    ECO_WATER_SITES_V1.find(
      (s) => String(s.hashIdPrefix).toUpperCase() === key
    ) || null
  );
}

/** 現場一覧（コピーを返す） */
export function listEcoWaterSitesV1() {
  return ECO_WATER_SITES_V1.map((s) => ({ ...s }));
}

/**
 * ハッシュIDを現場Prefix付きで整形
 * 既存 EW- 形式と互換の見た目
 * @param {string} hashHex
 * @param {string} prefix
 */
export function formatEcoWaterHashIdV1(hashHex, prefix) {
  const safePrefix = String(prefix || "EW").replace(/-+$/, "");
  const body = String(hashHex || "")
    .slice(0, 16)
    .toUpperCase();
  return `${safePrefix}-${body}`;
}
