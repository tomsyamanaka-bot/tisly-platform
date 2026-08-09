/**
 * TiSLY Eco-Water 中和履歴バッファ
 * LocalStorage 互換の純関数群
 * （ブラウザ注入ストレージ対応）
 */

export const ECO_WATER_HISTORY_LS_KEY_V1 =
  "tisly_eco_water_history_v1";
export const ECO_WATER_SITE_LS_KEY_V1 =
  "tisly_eco_water_selected_site_v1";

/** 履歴の最大保持件数（上書きせず先頭追記） */
export const ECO_WATER_HISTORY_MAX_V1 = 40;

export type EcoWaterHistoryStatusV1 = "放流適合" | "完了";

export interface EcoWaterHistoryEntryV1 {
  id: string;
  siteId: string;
  siteName: string;
  timestamp: string;
  phBefore: number;
  phAfter: number;
  status: EcoWaterHistoryStatusV1;
  calibrationDate: string;
  hashId: string;
  companyName: string;
}

export interface EcoWaterStorageLikeV1 {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * 中和完了時の履歴1件を生成
 * 既存配列は触らず新規オブジェクトのみ
 */
export function createNeutralizeHistoryEntryV1(input: {
  siteId: string;
  siteName: string;
  companyName: string;
  calibrationDate: string;
  phBefore: number;
  phAfter: number;
  hashId: string;
  timestamp?: string;
  status?: EcoWaterHistoryStatusV1;
}): EcoWaterHistoryEntryV1 {
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
 * 既存エントリは削除・上書きしない
 */
export function prependNeutralizeHistoryV1(
  list: EcoWaterHistoryEntryV1[],
  entry: EcoWaterHistoryEntryV1
): EcoWaterHistoryEntryV1[] {
  const base = Array.isArray(list) ? list.slice() : [];
  return [entry, ...base].slice(0, ECO_WATER_HISTORY_MAX_V1);
}

/** LocalStorage（互換）から履歴を読込 */
export function loadNeutralizeHistoryV1(
  storage: EcoWaterStorageLikeV1 | null | undefined
): EcoWaterHistoryEntryV1[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(ECO_WATER_HISTORY_LS_KEY_V1);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is EcoWaterHistoryEntryV1 =>
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
 * 既存キー以外は触らない
 */
export function saveNeutralizeHistoryV1(
  storage: EcoWaterStorageLikeV1 | null | undefined,
  list: EcoWaterHistoryEntryV1[]
): void {
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

/** 選択中現場IDを読込 */
export function loadSelectedSiteIdV1(
  storage: EcoWaterStorageLikeV1 | null | undefined,
  fallbackId: string
): string {
  if (!storage) return fallbackId;
  try {
    const id = storage.getItem(ECO_WATER_SITE_LS_KEY_V1);
    return id && id.trim() ? id.trim() : fallbackId;
  } catch {
    return fallbackId;
  }
}

/** 選択中現場IDを保存 */
export function saveSelectedSiteIdV1(
  storage: EcoWaterStorageLikeV1 | null | undefined,
  siteId: string
): void {
  if (!storage) return;
  try {
    storage.setItem(ECO_WATER_SITE_LS_KEY_V1, String(siteId || ""));
  } catch {
    /* */
  }
}
