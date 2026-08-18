/**
 * 価格・原価マスター v1 の型定義。
 * 見積マスター（/master-v1）とは別系統。
 * 既存マスター配列は改変しない。
 */

export const PRICE_COST_MASTER_TABS_V1 = [
  "parts",
  "subscription",
  "labor",
] as const;

export type PriceCostMasterTabV1 =
  (typeof PRICE_COST_MASTER_TABS_V1)[number];

export type PriceCostMasterKindV1 = PriceCostMasterTabV1;

export interface PriceCostMasterItemSeedV1 {
  id: string;
  kind: PriceCostMasterKindV1;
  category: string;
  /** 8統一ジャンル。既存行は enrich 時に付与 */
  genre?: string;
  name: string;
  /** 仕入原価（円）。未設定は null */
  costPrice: number | null;
  /** 販売価格 / 月額 / 標準工事単価（円） */
  sellPrice: number;
  /** 指定粗利額。未指定時は売価−原価 */
  profitAmount?: number | null;
  unitLabel: string;
  notes?: string;
  tags?: string[];
}

export interface PriceCostMasterItemV1
  extends PriceCostMasterItemSeedV1 {
  profitAmount: number | null;
  profitRate: number | null;
  costUnknown: boolean;
}

export interface PriceCostMasterQueryV1 {
  tab?: PriceCostMasterTabV1 | "all";
  q?: string;
  category?: string;
  genre?: string;
}

export interface PriceCostMasterSummaryV1 {
  count: number;
  totalCost: number | null;
  totalSell: number;
  totalProfit: number | null;
  avgProfitRate: number | null;
}

export interface PriceCostMasterCatalogV1 {
  version: "v1";
  tabs: Array<{
    id: PriceCostMasterTabV1;
    label: string;
  }>;
  categories: string[];
  /** 8統一ジャンル（すべて除く） */
  genres: string[];
  items: PriceCostMasterItemV1[];
  summary: PriceCostMasterSummaryV1;
}
