import type {
  MasterV1CustomerPrice,
  MasterV1Material,
  MasterV1Rank,
  MasterV1WorkItem,
} from "./master-v1-types.js";
import { getMasterV1Customer, getMasterV1Rank } from "./master-v1-store.js";

export type MasterV1PriceSource = "customer_override" | "rank_multiplier" | "standard";

export interface MasterV1ResolvedPrice {
  unitCost: number;
  standardUnitSell: number;
  rankUnitSell: number;
  customerUnitSell: number | null;
  appliedUnitSell: number;
  priceSource: MasterV1PriceSource;
}

export function resolveWorkUnitCost(work: MasterV1WorkItem): number {
  return work.standardCost + work.laborCost;
}

export function resolveMaterialUnitCost(mat: MasterV1Material): number {
  return mat.cost;
}

export function resolveStandardSellWork(work: MasterV1WorkItem): number {
  if (work.standardSellPrice > 0) return work.standardSellPrice;
  const cost = resolveWorkUnitCost(work);
  return cost > 0 ? Math.round(cost * 2) : 0;
}

export function resolveStandardSellMaterial(mat: MasterV1Material): number {
  if (mat.standardSellPrice > 0) return mat.standardSellPrice;
  return mat.cost > 0 ? Math.round(mat.cost * 2) : 0;
}

export function resolveRankSellWork(work: MasterV1WorkItem, rank: MasterV1Rank | null): number {
  const unitCost = resolveWorkUnitCost(work);
  const mult = rank?.laborMultiplier ?? 2;
  return Math.round(unitCost * mult);
}

export function resolveRankSellMaterial(mat: MasterV1Material, rank: MasterV1Rank | null): number {
  const mult = rank?.costMultiplier ?? 2;
  return Math.round(mat.cost * mult);
}

export function resolveWorkPrice(
  work: MasterV1WorkItem,
  customerId: string | null,
  customerPrice: MasterV1CustomerPrice | null,
  rank: MasterV1Rank | null
): MasterV1ResolvedPrice {
  const unitCost = resolveWorkUnitCost(work);
  const standardUnitSell = resolveStandardSellWork(work);
  const rankUnitSell = resolveRankSellWork(work, rank);
  const customerUnitSell =
    customerPrice && customerPrice.unitPrice > 0 ? customerPrice.unitPrice : null;

  let appliedUnitSell = standardUnitSell;
  let priceSource: MasterV1PriceSource = "standard";

  if (customerUnitSell != null) {
    appliedUnitSell = customerUnitSell;
    priceSource = "customer_override";
  } else if (customerId && rank) {
    appliedUnitSell = rankUnitSell;
    priceSource = "rank_multiplier";
  }

  return {
    unitCost,
    standardUnitSell,
    rankUnitSell,
    customerUnitSell,
    appliedUnitSell,
    priceSource,
  };
}

export function resolveMaterialPrice(
  mat: MasterV1Material,
  customerId: string | null,
  customerPrice: MasterV1CustomerPrice | null,
  rank: MasterV1Rank | null
): MasterV1ResolvedPrice {
  const unitCost = resolveMaterialUnitCost(mat);
  const standardUnitSell = resolveStandardSellMaterial(mat);
  const rankUnitSell = resolveRankSellMaterial(mat, rank);
  const customerUnitSell =
    customerPrice && customerPrice.unitPrice > 0 ? customerPrice.unitPrice : null;

  let appliedUnitSell = standardUnitSell;
  let priceSource: MasterV1PriceSource = "standard";

  if (customerUnitSell != null) {
    appliedUnitSell = customerUnitSell;
    priceSource = "customer_override";
  } else if (customerId && rank) {
    appliedUnitSell = rankUnitSell;
    priceSource = "rank_multiplier";
  }

  return {
    unitCost,
    standardUnitSell,
    rankUnitSell,
    customerUnitSell,
    appliedUnitSell,
    priceSource,
  };
}

export function resolveCustomerRank(customerId: string | null): MasterV1Rank | null {
  if (!customerId) return null;
  const customer = getMasterV1Customer(customerId);
  if (!customer?.rankId) return null;
  return getMasterV1Rank(customer.rankId);
}

export function calcGrossProfitRate(sell: number, cost: number): number {
  if (sell <= 0) return 0;
  return Math.round(((sell - cost) / sell) * 1000) / 10;
}
