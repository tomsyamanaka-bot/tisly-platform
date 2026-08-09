/**
 * TiSLY Eco-Water 中和履歴バッファ
 * LocalStorage へ追記保存する
 * （既存キーは上書きしない方針）
 */

export const ECO_WATER_HISTORY_LS_KEY_V1 =
  "tisly_eco_water_history_v1";
export const ECO_WATER_SITE_LS_KEY_V1 =
  "tisly_eco_water_selected_site_v1";

/** 履歴の最大保持件数（先頭追記） */
export const ECO_WATER_HISTORY_MAX_V1 = 40;

/**
 * 中和完了時の履歴1件を生成
 * 既存配列は触らず新規のみ
 * @param {object} input
 */
export function createNeutralizeHistoryEntryV1(input) {
  const ts =
    input.timestamp ||
    new Date().toLocaleString("ja-JP", { hour12: false });
  return {
    id: `ew-hist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    siteId: input.siteId,
    siteName: input.siteName,
    timestamp: ts,
    phBefore: Number(input.phBefore),
    phAfter: Number(input.phAfter),
    status: input.status || "放流適合",
    calibrationDate: input.calibrationDate,
    hashId: input.hashId,
    companyName: input.companyName,
  };
}

/**
 * 履歴リスト最上部へ新規追記
 * 既存エントリは削除しない
 * @param {object[]} list
 * @param {object} entry
 */
export function prependNeutralizeHistoryV1(list, entry) {
  const base = Array.isArray(list) ? list.slice() : [];
  return [entry, ...base].slice(0, ECO_WATER_HISTORY_MAX_V1);
}

/**
 * LocalStorage から履歴を読込
 * @param {Storage | null | undefined} storage
 */
export function loadNeutralizeHistoryV1(storage) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(ECO_WATER_HISTORY_LS_KEY_V1);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row) =>
        row &&
        typeof row === "object" &&
        typeof row.id === "string" &&
        typeof row.siteName === "string"
    );
  } catch {
    return [];
  }
}

/**
 * 履歴を保存（配列全体を書換）
 * 他キーは触らない
 * @param {Storage | null | undefined} storage
 * @param {object[]} list
 */
export function saveNeutralizeHistoryV1(storage, list) {
  if (!storage) return;
  try {
    storage.setItem(
      ECO_WATER_HISTORY_LS_KEY_V1,
      JSON.stringify(Array.isArray(list) ? list : [])
    );
  } catch {
    /* quota 等はデモでは無視 */
  }
}

/**
 * 選択中現場IDを読込
 * @param {Storage | null | undefined} storage
 * @param {string} fallbackId
 */
export function loadSelectedSiteIdV1(storage, fallbackId) {
  if (!storage) return fallbackId;
  try {
    const id = storage.getItem(ECO_WATER_SITE_LS_KEY_V1);
    return id && id.trim() ? id.trim() : fallbackId;
  } catch {
    return fallbackId;
  }
}

/**
 * 選択中現場IDを保存
 * @param {Storage | null | undefined} storage
 * @param {string} siteId
 */
export function saveSelectedSiteIdV1(storage, siteId) {
  if (!storage) return;
  try {
    storage.setItem(ECO_WATER_SITE_LS_KEY_V1, String(siteId || ""));
  } catch {
    /* */
  }
}
