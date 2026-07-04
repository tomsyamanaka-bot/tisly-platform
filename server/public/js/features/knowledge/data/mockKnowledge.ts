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
export const QUICK_TAGS = ["すべて", "IoT", "施工方法", "アイデア", "プラント"] as const;

export type QuickTag = (typeof QUICK_TAGS)[number];
