/**
 * TiSLY 統一ジャンル（8分類）v1。
 * 価格マスター・ナレッジ・工事カテゴリの
 * 共通ソース。既存カテゴリは削除しない。
 */

export const TISLY_UNIFIED_GENRES_V1 = [
  "電気工事",
  "防犯カメラ",
  "ネットワーク",
  "TV工事",
  "エアコン",
  "空調",
  "音響",
  "IOT関連",
] as const;

export type TislyUnifiedGenreV1 =
  (typeof TISLY_UNIFIED_GENRES_V1)[number];

/** 一覧フィルタ用（すべて + 8ジャンル） */
export const TISLY_UNIFIED_GENRE_FILTER_V1 = [
  "すべて",
  ...TISLY_UNIFIED_GENRES_V1,
] as const;

export type TislyUnifiedGenreFilterV1 =
  (typeof TISLY_UNIFIED_GENRE_FILTER_V1)[number];

/**
 * 旧カテゴリ・別名 → 統一ジャンル。
 * 既存ラベルは残し、絞り込みだけ寄せる。
 */
export const TISLY_GENRE_ALIASES_V1: Record<
  string,
  TislyUnifiedGenreV1
> = {
  IoT: "IOT関連",
  IOT: "IOT関連",
  iot: "IOT関連",
  "IoT関連": "IOT関連",
  制御: "IOT関連",
  水質センサー: "IOT関連",
  制御ボード: "IOT関連",
  "Eco-Water": "IOT関連",
  配管工事: "IOT関連",
  "試運転・校正": "IOT関連",
  電気: "電気工事",
  動力200V: "電気工事",
  コンセント: "電気工事",
  照明: "電気工事",
  "筐体・防水": "電気工事",
  セキュリティー: "防犯カメラ",
  セキュリティ: "防犯カメラ",
  LAN: "ネットワーク",
  "Wi-Fi": "ネットワーク",
  WIFI: "ネットワーク",
  アンテナ: "TV工事",
  厨房機器: "空調",
  PLC: "IOT関連",
  TiSLY: "IOT関連",
};

export function isTislyUnifiedGenreV1(
  value: unknown
): value is TislyUnifiedGenreV1 {
  return (
    typeof value === "string" &&
    (TISLY_UNIFIED_GENRES_V1 as readonly string[]).includes(
      value
    )
  );
}

export function normalizeToUnifiedGenreV1(
  value: unknown
): TislyUnifiedGenreV1 | "" {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "すべて") return "";
  if (isTislyUnifiedGenreV1(raw)) return raw;
  const aliased = TISLY_GENRE_ALIASES_V1[raw];
  return aliased ?? "";
}

function appendUniqueTagsV1(
  tags: string[],
  extra: string[]
): string[] {
  const next = [...tags];
  for (const tag of extra) {
    const t = String(tag ?? "").trim();
    if (!t) continue;
    if (!next.includes(t)) next.push(t);
  }
  return next;
}

export interface TislyGenreMatchableV1 {
  genre?: string | null;
  unifiedGenre?: string | null;
  category?: string | null;
  tags?: string[] | null;
  name?: string | null;
  title?: string | null;
  notes?: string | null;
}

/**
 * タイトル等から統一ジャンルを推定する。
 * 既存ジャンルが取れる場合はそれを優先する。
 */
export function inferUnifiedGenreV1(
  item: TislyGenreMatchableV1
): TislyUnifiedGenreV1 | "" {
  const direct = normalizeToUnifiedGenreV1(
    item.unifiedGenre || item.genre || item.category
  );
  if (direct) return direct;

  const hay = [
    item.title ?? "",
    item.name ?? "",
    item.notes ?? "",
    ...(item.tags ?? []),
  ]
    .join(" ")
    .toLowerCase();

  if (/ph|rs485|modbus|esp32|rp2350|iot|eco-water|水質/.test(hay)) {
    return "IOT関連";
  }
  if (/カメラ|nvr|防犯/.test(hay)) return "防犯カメラ";
  if (/poe|lan|wifi|ネットワーク|スイッチ/.test(hay)) {
    return "ネットワーク";
  }
  if (/同軸|アンテナ|tv|ブースター/.test(hay)) return "TV工事";
  if (/エアコン|冷媒|ペアコイル/.test(hay)) return "エアコン";
  if (/空調|ダクト|換気/.test(hay)) return "空調";
  if (/音響|アンプ|スピーカー/.test(hay)) return "音響";
  if (/vvf|配線|電気|盤|コンセント/.test(hay)) {
    return "電気工事";
  }
  return "";
}

export function itemMatchesUnifiedGenreV1(
  item: TislyGenreMatchableV1,
  genre: string
): boolean {
  const needle = String(genre ?? "").trim();
  if (!needle || needle === "すべて") return true;

  const unified = normalizeToUnifiedGenreV1(needle) || needle;
  const itemUnified =
    normalizeToUnifiedGenreV1(item.unifiedGenre) ||
    normalizeToUnifiedGenreV1(item.genre) ||
    normalizeToUnifiedGenreV1(item.category) ||
    inferUnifiedGenreV1(item);

  if (itemUnified === unified) return true;
  if (String(item.genre ?? "") === needle) return true;
  if (String(item.category ?? "") === needle) return true;
  if (String(item.unifiedGenre ?? "") === needle) return true;

  const tags = item.tags ?? [];
  if (tags.includes(needle) || tags.includes(unified)) {
    return true;
  }
  return false;
}

/** 既存タグを消さず、統一ジャンルタグを末尾追記 */
export function appendUnifiedGenreTagsV1(
  tags: string[] | null | undefined,
  genres: Array<TislyUnifiedGenreV1 | string>
): string[] {
  return appendUniqueTagsV1(
    Array.isArray(tags) ? [...tags] : [],
    genres.map((g) => String(g))
  );
}

export function listUnifiedGenreFilterV1(): string[] {
  return [...TISLY_UNIFIED_GENRE_FILTER_V1];
}
