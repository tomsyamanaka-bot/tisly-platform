/**
 * 価格・原価マスターの検索・粗利計算。
 * シード配列は末尾追記のみ想定。
 * 削除・上書きは行わない。
 */

import { PRICE_COST_MASTER_SEED_V1 } from "./price-cost-master-seed-v1.js";
import { PRICE_COST_MASTER_TAB_LABELS_V1 } from "./price-cost-master-seed-v1.js";
import { PRICE_COST_MASTER_EXISTING_GENRE_MAP_V1 } from "./price-cost-master-genre-seed-v1.js";
import type {
  PriceCostMasterCatalogV1,
  PriceCostMasterItemSeedV1,
  PriceCostMasterItemV1,
  PriceCostMasterQueryV1,
  PriceCostMasterSummaryV1,
  PriceCostMasterTabV1,
} from "./price-cost-master-types-v1.js";
import { PRICE_COST_MASTER_TABS_V1 } from "./price-cost-master-types-v1.js";
import {
  TISLY_UNIFIED_GENRES_V1,
  inferUnifiedGenreV1,
  itemMatchesUnifiedGenreV1,
} from "../shared/genres/tisly-genres-v1.js";
import { loadMergedPriceCostItemsV1 } from "./price-cost-master-store-v1.js";

const ROUND_RATE = 10;

export function roundProfitRateV1(rate: number): number {
  return Math.round(rate * ROUND_RATE) / ROUND_RATE;
}

/**
 * 粗利額・粗利率を算出する。
 * 原価未設定は null を返す。
 */
export function enrichPriceCostItemV1(
  seed: PriceCostMasterItemSeedV1
): PriceCostMasterItemV1 {
  const genre =
    seed.genre ||
    PRICE_COST_MASTER_EXISTING_GENRE_MAP_V1[seed.id] ||
    inferUnifiedGenreV1({
      genre: seed.genre,
      category: seed.category,
      tags: seed.tags,
      name: seed.name,
      notes: seed.notes,
    }) ||
    undefined;
  const costUnknown =
    seed.costPrice == null || !Number.isFinite(seed.costPrice);
  if (costUnknown) {
    return {
      ...seed,
      genre,
      costPrice: null,
      profitAmount: null,
      profitRate: null,
      costUnknown: true,
    };
  }
  const cost = Number(seed.costPrice);
  const sell = Number(seed.sellPrice);
  const profit =
    seed.profitAmount != null && Number.isFinite(seed.profitAmount)
      ? Number(seed.profitAmount)
      : sell - cost;
  const rate = sell > 0 ? (profit / sell) * 100 : null;
  return {
    ...seed,
    genre,
    costPrice: cost,
    profitAmount: profit,
    profitRate: rate == null ? null : roundProfitRateV1(rate),
    costUnknown: false,
  };
}

function normalizeQueryTextV1(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

export function itemMatchesQueryV1(
  item: PriceCostMasterItemV1,
  q: string
): boolean {
  const needle = normalizeQueryTextV1(q);
  if (!needle) return true;
  const hay = [
    item.name,
    item.category,
    item.genre ?? "",
    item.notes ?? "",
    ...(item.tags ?? []),
    item.id,
  ]
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, "");
  return hay.includes(needle);
}

export function listPriceCostCategoriesV1(
  items: PriceCostMasterItemV1[]
): string[] {
  const set = new Set<string>();
  for (const item of items) {
    if (item.category) set.add(item.category);
  }
  return [...set];
}

export function summarizePriceCostItemsV1(
  items: PriceCostMasterItemV1[]
): PriceCostMasterSummaryV1 {
  let totalCost = 0;
  let costCount = 0;
  let totalSell = 0;
  let totalProfit = 0;
  let profitCount = 0;
  let rateSum = 0;
  let rateCount = 0;
  for (const item of items) {
    totalSell += item.sellPrice;
    if (item.costPrice != null) {
      totalCost += item.costPrice;
      costCount += 1;
    }
    if (item.profitAmount != null) {
      totalProfit += item.profitAmount;
      profitCount += 1;
    }
    if (item.profitRate != null) {
      rateSum += item.profitRate;
      rateCount += 1;
    }
  }
  return {
    count: items.length,
    totalCost: costCount > 0 ? totalCost : null,
    totalSell,
    totalProfit: profitCount > 0 ? totalProfit : null,
    avgProfitRate:
      rateCount > 0 ? roundProfitRateV1(rateSum / rateCount) : null,
  };
}

export function parsePriceCostTabV1(
  raw: unknown
): PriceCostMasterTabV1 | "all" {
  const value = String(raw ?? "").trim();
  if (!value || value === "all") return "all";
  if (
    (PRICE_COST_MASTER_TABS_V1 as readonly string[]).includes(value)
  ) {
    return value as PriceCostMasterTabV1;
  }
  return "all";
}

export function queryPriceCostMasterV1(
  query: PriceCostMasterQueryV1 = {},
  seed: PriceCostMasterItemSeedV1[] = loadMergedPriceCostItemsV1()
): PriceCostMasterCatalogV1 {
  const tab = query.tab ?? "all";
  const q = String(query.q ?? "");
  const category = String(query.category ?? "").trim();
  const genre = String(query.genre ?? "").trim();
  const enriched = seed.map(enrichPriceCostItemV1);
  const byTab =
    tab === "all"
      ? enriched
      : enriched.filter((item) => item.kind === tab);
  const byCategory = category
    ? byTab.filter((item) => item.category === category)
    : byTab;
  const byGenre = genre
    ? byCategory.filter((item) =>
        itemMatchesUnifiedGenreV1(item, genre)
      )
    : byCategory;
  const items = byGenre.filter((item) =>
    itemMatchesQueryV1(item, q)
  );
  const categories = listPriceCostCategoriesV1(
    tab === "all" ? enriched : byTab
  );
  return {
    version: "v1",
    tabs: PRICE_COST_MASTER_TABS_V1.map((id) => ({
      id,
      label: PRICE_COST_MASTER_TAB_LABELS_V1[id],
    })),
    categories,
    genres: [...TISLY_UNIFIED_GENRES_V1],
    items,
    summary: summarizePriceCostItemsV1(items),
  };
}

export function getPriceCostMasterSeedCountV1(): number {
  return PRICE_COST_MASTER_SEED_V1.length;
}
