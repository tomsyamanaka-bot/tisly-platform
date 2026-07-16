/**
 * Knowledge モジュール型定義
 */

export interface KnowledgeItem {
  id: string;
  title: string;
  summary: string;
  /** 大分類（ジャンルタブで絞り込み） */
  genre: string;
  tags: string[];
  /** 添付PDF（サーバー保存後のURL） */
  pdf_url?: string | null;
  createdAt: string;
}

/** 画面上部のジャンルタブ・かんたん登録セレクト */
export const KNOWLEDGE_GENRES = [
  "すべて",
  "プラント",
  "IoT",
  "制御",
  "電気",
  "ネットワーク",
  "セキュリティー",
  "TV工事",
  "防犯カメラ",
  "エアコン",
  "空調",
] as const;

export type KnowledgeGenre = (typeof KNOWLEDGE_GENRES)[number];

/** 画面上部のクイックタグ（初期表示用 · 登録済みタグは API から動的生成） */
export const QUICK_TAGS = [
  "すべて",
  "IoT",
  "施工方法",
  "アイデア",
  "プラント",
  "製作ノウハウ",
  "仕上げ",
] as const;

export type QuickTag = (typeof QUICK_TAGS)[number];

/**
 * 初期モック参照（実データは API module-items）。
 * 手作り→工業仕上げノウハウ 4 件のタイトル一覧。
 */
export const FAB_FINISH_KNOWLEDGE_TITLES = [
  "パテ盛り＋サンディングによる段差・継ぎ目消し技術",
  "プラサフ（下地）とマット塗装による工業POM質感仕上げ",
  "溶剤接着（溶着）によるシームレスアクリル配管",
  "ゴムベルトの斜めカット（スカイブ接合）による静音駆動",
] as const;
