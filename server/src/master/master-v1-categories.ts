/** 見積マスター v1 — カテゴリ階層定義（編集可能だが初期値として使用） */

export interface MasterV1CategoryDef {
  categoryMain: string;
  categorySub: string;
  kind: "work" | "material" | "both";
  sortOrder: number;
}

/** UI 上部チップ — value は API フィルタ用 */
export const MASTER_V1_CHIP_FILTERS = [
  { value: "", label: "すべて" },
  { value: "__favorite__", label: "よく使う" },
  { value: "防犯カメラ", label: "防犯カメラ" },
  { value: "LAN / ネットワーク", label: "LAN" },
  { value: "電気工事", label: "電気" },
  { value: "照明", label: "照明" },
  { value: "セキュリティ", label: "セキュリティ" },
  { value: "その他", label: "その他" },
] as const;

export const MASTER_V1_CATEGORY_SEED: MasterV1CategoryDef[] = [
  // 防犯カメラ
  { categoryMain: "防犯カメラ", categorySub: "カメラ設置", kind: "both", sortOrder: 1 },
  { categoryMain: "防犯カメラ", categorySub: "NVR設定", kind: "both", sortOrder: 2 },
  { categoryMain: "防犯カメラ", categorySub: "LAN配線", kind: "both", sortOrder: 3 },
  { categoryMain: "防犯カメラ", categorySub: "PoEスイッチ", kind: "both", sortOrder: 4 },
  { categoryMain: "防犯カメラ", categorySub: "モニター設定", kind: "both", sortOrder: 5 },
  { categoryMain: "防犯カメラ", categorySub: "スマホ設定", kind: "work", sortOrder: 6 },
  { categoryMain: "防犯カメラ", categorySub: "高所作業", kind: "work", sortOrder: 7 },
  // LAN / ネットワーク
  { categoryMain: "LAN / ネットワーク", categorySub: "LAN配線", kind: "both", sortOrder: 10 },
  { categoryMain: "LAN / ネットワーク", categorySub: "LAN端末処理", kind: "both", sortOrder: 11 },
  { categoryMain: "LAN / ネットワーク", categorySub: "ルーター設定", kind: "work", sortOrder: 12 },
  { categoryMain: "LAN / ネットワーク", categorySub: "スイッチ設定", kind: "both", sortOrder: 13 },
  { categoryMain: "LAN / ネットワーク", categorySub: "モール配線", kind: "both", sortOrder: 14 },
  { categoryMain: "LAN / ネットワーク", categorySub: "貫通処理", kind: "work", sortOrder: 15 },
  // Wi-Fi / AP
  { categoryMain: "Wi-Fi / AP", categorySub: "AP設置", kind: "both", sortOrder: 20 },
  { categoryMain: "Wi-Fi / AP", categorySub: "設定", kind: "work", sortOrder: 21 },
  // インターホン
  { categoryMain: "インターホン", categorySub: "設置", kind: "both", sortOrder: 30 },
  { categoryMain: "インターホン", categorySub: "配線", kind: "both", sortOrder: 31 },
  // 電気工事
  { categoryMain: "電気工事", categorySub: "配線", kind: "both", sortOrder: 40 },
  { categoryMain: "電気工事", categorySub: "コンセント", kind: "both", sortOrder: 41 },
  { categoryMain: "電気工事", categorySub: "スイッチ", kind: "both", sortOrder: 42 },
  { categoryMain: "電気工事", categorySub: "専用回路", kind: "both", sortOrder: 43 },
  { categoryMain: "電気工事", categorySub: "分電盤", kind: "both", sortOrder: 44 },
  { categoryMain: "電気工事", categorySub: "アース", kind: "work", sortOrder: 45 },
  { categoryMain: "電気工事", categorySub: "動力", kind: "both", sortOrder: 46 },
  // 照明
  { categoryMain: "照明", categorySub: "器具交換", kind: "both", sortOrder: 50 },
  { categoryMain: "照明", categorySub: "配線", kind: "both", sortOrder: 51 },
  // コンセント
  { categoryMain: "コンセント", categorySub: "増設", kind: "both", sortOrder: 60 },
  { categoryMain: "コンセント", categorySub: "交換", kind: "both", sortOrder: 61 },
  // ブレーカー / 分電盤
  { categoryMain: "ブレーカー / 分電盤", categorySub: "交換", kind: "both", sortOrder: 70 },
  { categoryMain: "ブレーカー / 分電盤", categorySub: "増設", kind: "both", sortOrder: 71 },
  // セキュリティ
  { categoryMain: "セキュリティ", categorySub: "センサー", kind: "both", sortOrder: 80 },
  { categoryMain: "セキュリティ", categorySub: "制御盤", kind: "both", sortOrder: 81 },
  // センサー
  { categoryMain: "センサー", categorySub: "人感", kind: "both", sortOrder: 90 },
  { categoryMain: "センサー", categorySub: "開閉", kind: "both", sortOrder: 91 },
  // 電気錠 / スマートロック
  { categoryMain: "電気錠 / スマートロック", categorySub: "設置", kind: "both", sortOrder: 100 },
  { categoryMain: "電気錠 / スマートロック", categorySub: "設定", kind: "work", sortOrder: 101 },
  // TV / アンテナ
  { categoryMain: "TV / アンテナ", categorySub: "設置", kind: "both", sortOrder: 110 },
  { categoryMain: "TV / アンテナ", categorySub: "配線", kind: "both", sortOrder: 111 },
  // エアコン
  { categoryMain: "エアコン", categorySub: "設置", kind: "both", sortOrder: 120 },
  { categoryMain: "エアコン", categorySub: "配管", kind: "both", sortOrder: 121 },
  // 現調 / 設計
  { categoryMain: "現調 / 設計", categorySub: "現調", kind: "work", sortOrder: 130 },
  { categoryMain: "現調 / 設計", categorySub: "図面", kind: "work", sortOrder: 131 },
  { categoryMain: "現調 / 設計", categorySub: "完了報告", kind: "work", sortOrder: 132 },
  // 交通費 / 諸経費
  { categoryMain: "交通費 / 諸経費", categorySub: "交通費", kind: "work", sortOrder: 140 },
  { categoryMain: "交通費 / 諸経費", categorySub: "諸経費", kind: "work", sortOrder: 141 },
  // その他
  { categoryMain: "その他", categorySub: "その他", kind: "both", sortOrder: 999 },
];

export const MASTER_V1_MAIN_CATEGORIES = [
  ...new Set(MASTER_V1_CATEGORY_SEED.map((c) => c.categoryMain)),
];

export function parseTagsJson(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return raw.split(/[,、\s]+/).filter(Boolean);
    }
  }
  return [];
}

export function tagsToJson(tags: string[] | undefined): string {
  return JSON.stringify(tags?.filter(Boolean) ?? []);
}

export function parseMaterialIdsJson(raw: unknown): string[] {
  return parseTagsJson(raw);
}
