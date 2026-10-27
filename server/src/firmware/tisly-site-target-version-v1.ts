/**
 * 現場ごとの目標ファームウェア版。
 * 製品全体の版を上げても、ここは動かさない。
 * 実機がこの版以上なら、その現場は最新。
 */

export const TISLY_SITE_TARGET_VERSIONS_V1 = {
  /** 豊島邸。他現場の追加では上げない */
  toyoshima: "1.2.29",
  /** 板橋自宅。1.6 系の別ライン */
  itabashi: "1.6.6",
  /** ウォッシュメイト龍ヶ崎店。DI 変化を即 POST する版 */
  ryugasaki: "1.2.42",
} as const;

export type TislySiteTargetKeyV1 = keyof typeof TISLY_SITE_TARGET_VERSIONS_V1;

export function tislySiteTargetVersionV1(
  siteKey: string | null | undefined
): string | null {
  const key = String(siteKey ?? "").trim().toLowerCase();
  if (key === "toyoshima" || key === "toyoshima001" || key === "toshima001") {
    return TISLY_SITE_TARGET_VERSIONS_V1.toyoshima;
  }
  if (key === "itabashi" || key === "toms001" || key === "home001") {
    return TISLY_SITE_TARGET_VERSIONS_V1.itabashi;
  }
  if (
    key === "ryugasaki" ||
    key === "washmate001" ||
    key === "ryugasaki001"
  ) {
    return TISLY_SITE_TARGET_VERSIONS_V1.ryugasaki;
  }
  return null;
}

export function looseSemverCoreV1(value: string | null | undefined): string | null {
  const match = String(value || "").match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
}

export function compareSemverCoreV1(a: string, b: string): number {
  const pa = a.split(".").map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

/**
 * 実機版が現場ターゲットより古いときだけ更新が必要。
 * 申告が無い、またはターゲット以上なら最新。
 */
export function deviceNeedsSiteFirmwareUpdateV1(
  siteKey: string,
  reported: string | null | undefined
): boolean {
  const target = tislySiteTargetVersionV1(siteKey);
  const reportedCore = looseSemverCoreV1(reported);
  const targetCore = looseSemverCoreV1(target);
  if (!targetCore || !reportedCore) return false;
  return compareSemverCoreV1(reportedCore, targetCore) < 0;
}
