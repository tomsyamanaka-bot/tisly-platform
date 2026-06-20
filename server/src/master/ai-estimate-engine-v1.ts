/**
 * AI見積エンジン基盤 v1 — マスターDTO・統計・Document Center 連携
 */
import { getBusinessProject } from "../business/business-store.js";
import { DOCUMENT_VIEW_KINDS } from "../estimate/document-view-v1.js";
import type {
  MasterV1Customer,
  MasterV1CustomerPrice,
  MasterV1Material,
  MasterV1Rank,
  MasterV1WorkItem,
} from "./master-v1-types.js";
import {
  getMasterV1Customer,
  listMasterV1CustomerPrices,
  listMasterV1Customers,
  listMasterV1Materials,
  listMasterV1Ranks,
  listMasterV1WorkItems,
} from "./master-v1-store.js";

export interface CustomerMasterV1 {
  id: string;
  name: string;
  customerType: string;
  standardMarkupRate: number;
  standardDiscountRate: number;
  standardLaborUnitPrice: number;
  standardTravelFee: number;
  rankId: string | null;
  customerCode: string;
  contactName: string | null;
  phone: string | null;
  favorite: boolean;
  active: boolean;
}

export interface RankMasterV1 {
  id: string;
  name: string;
  markupRate: number;
  grossMarginRate: number;
  discountRate: number;
  laborMultiplier: number;
  memo: string | null;
  active: boolean;
}

export interface WorkMasterV1 {
  id: string;
  categoryMain: string;
  categorySub: string;
  name: string;
  code: string;
  standardLabor: number;
  standardHours: number;
  standardUnitPrice: number;
  standardCost: number;
  laborCost: number;
  unit: string;
  memo: string | null;
  favorite: boolean;
  active: boolean;
}

export interface MaterialMasterV1 {
  id: string;
  categoryMain: string;
  categorySub: string;
  name: string;
  maker: string | null;
  model: string | null;
  supplier: string | null;
  cost: number;
  standardSellPrice: number;
  unit: string;
  memo: string | null;
  favorite: boolean;
  active: boolean;
}

export interface CustomerPriceOverrideV1 {
  id: string;
  customerId: string;
  itemType: "work" | "material";
  itemId: string;
  laborOrMaterialUnitPrice: number;
  costPrice: number;
  memo: string | null;
}

export interface AiEstimateEngineStatsV1 {
  workCount: number;
  materialCount: number;
  customerCount: number;
  rankCount: number;
  priceOverrideCount: number;
  missingCost: {
    work: WorkMasterV1[];
    materials: MaterialMasterV1[];
  };
  missingSell: {
    work: WorkMasterV1[];
    materials: MaterialMasterV1[];
  };
  favoriteCount: {
    customers: number;
    work: number;
    materials: number;
  };
}

export interface AiEstimateDocumentCenterContextV1 {
  schemaVersion: "ai_estimate_engine_v1";
  projectId: string;
  projectTitle: string;
  customerName: string | null;
  matchedCustomer: CustomerMasterV1 | null;
  rank: RankMasterV1 | null;
  travelFee: number;
  laborUnitPrice: number;
  discountRate: number;
  documentCenter: Record<
    string,
    { label: string; viewerUrl: string; apiUrl: string }
  >;
  masterSnapshot: {
    workCount: number;
    materialCount: number;
    priceOverrideCount: number;
  };
}

export function toCustomerMasterV1(c: MasterV1Customer): CustomerMasterV1 {
  return {
    id: c.id,
    name: c.name,
    customerType: c.customerType,
    standardMarkupRate: c.standardMarkupRate,
    standardDiscountRate: c.standardDiscountRate,
    standardLaborUnitPrice: c.standardLaborUnitPrice,
    standardTravelFee: c.standardTravelFee,
    rankId: c.rankId,
    customerCode: c.customerCode,
    contactName: c.contactName,
    phone: c.phone,
    favorite: c.favorite,
    active: c.active,
  };
}

export function toRankMasterV1(r: MasterV1Rank): RankMasterV1 {
  return {
    id: r.id,
    name: r.name,
    markupRate: r.costMultiplier,
    grossMarginRate: r.grossMarginRate,
    discountRate: r.discountRate,
    laborMultiplier: r.laborMultiplier,
    memo: r.memo,
    active: r.active,
  };
}

export function toWorkMasterV1(w: MasterV1WorkItem): WorkMasterV1 {
  const unitPrice = w.standardSellPrice || w.standardCost + w.laborCost;
  return {
    id: w.id,
    categoryMain: w.categoryMain,
    categorySub: w.categorySub,
    name: w.name,
    code: w.code,
    standardLabor: w.standardLabor,
    standardHours: w.standardHours,
    standardUnitPrice: unitPrice,
    standardCost: w.standardCost,
    laborCost: w.laborCost,
    unit: w.unit,
    memo: w.memo,
    favorite: w.favorite,
    active: w.active,
  };
}

export function toMaterialMasterV1(m: MasterV1Material): MaterialMasterV1 {
  return {
    id: m.id,
    categoryMain: m.categoryMain,
    categorySub: m.categorySub,
    name: m.name,
    maker: m.maker,
    model: m.model,
    supplier: m.supplier,
    cost: m.cost,
    standardSellPrice: m.standardSellPrice || m.cost * 2,
    unit: m.unit,
    memo: m.memo,
    favorite: m.favorite,
    active: m.active,
  };
}

export function toCustomerPriceOverrideV1(p: MasterV1CustomerPrice): CustomerPriceOverrideV1 {
  return {
    id: p.id,
    customerId: p.customerId,
    itemType: p.itemType,
    itemId: p.itemId,
    laborOrMaterialUnitPrice: p.unitPrice,
    costPrice: p.costPrice,
    memo: p.memo,
  };
}

export function getAiEstimateEngineStatsV1(): AiEstimateEngineStatsV1 {
  const workItems = listMasterV1WorkItems({ activeOnly: false });
  const materials = listMasterV1Materials({ activeOnly: false });
  const customers = listMasterV1Customers({ activeOnly: false });
  const ranks = listMasterV1Ranks({ activeOnly: false });
  const prices = listMasterV1CustomerPrices();

  const workDtos = workItems.map(toWorkMasterV1);
  const matDtos = materials.map(toMaterialMasterV1);

  return {
    workCount: workItems.length,
    materialCount: materials.length,
    customerCount: customers.length,
    rankCount: ranks.length,
    priceOverrideCount: prices.length,
    missingCost: {
      work: workDtos.filter((w) => w.standardCost + w.laborCost <= 0),
      materials: matDtos.filter((m) => !m.cost || m.cost <= 0),
    },
    missingSell: {
      work: workDtos.filter((w) => !w.standardUnitPrice || w.standardUnitPrice <= 0),
      materials: matDtos.filter((m) => !m.standardSellPrice || m.standardSellPrice <= 0),
    },
    favoriteCount: {
      customers: customers.filter((c) => c.favorite).length,
      work: workItems.filter((w) => w.favorite).length,
      materials: materials.filter((m) => m.favorite).length,
    },
  };
}

function findCustomerByProjectName(customerName: string | null | undefined): MasterV1Customer | null {
  if (!customerName?.trim()) return null;
  const normalized = customerName.trim();
  const customers = listMasterV1Customers({ activeOnly: false });
  return (
    customers.find((c) => c.name === normalized) ??
    customers.find((c) => normalized.includes(c.name) || c.name.includes(normalized)) ??
    null
  );
}

export function buildAiEstimateDocumentCenterContextV1(
  projectId: string
): AiEstimateDocumentCenterContextV1 | null {
  const project = getBusinessProject(projectId);
  if (!project) return null;

  const matched = findCustomerByProjectName(project.customerName);
  const rank =
    matched?.rankId != null
      ? listMasterV1Ranks().find((r) => r.id === matched.rankId) ?? null
      : null;

  const documentCenter: AiEstimateDocumentCenterContextV1["documentCenter"] = {};
  const labels: Record<string, string> = {
    estimate: "見積書",
    invoice: "請求書",
    specification: "仕様書",
    "completion-report": "完了報告書",
    "field-report": "現場報告",
  };
  for (const kind of DOCUMENT_VIEW_KINDS) {
    documentCenter[kind] = {
      label: labels[kind] ?? kind,
      viewerUrl: `/document-viewer-v1.html?projectId=${encodeURIComponent(projectId)}&kind=${kind}`,
      apiUrl: `/api/estimate/v1/projects/${encodeURIComponent(projectId)}/document-view?kind=${kind}`,
    };
  }

  const stats = getAiEstimateEngineStatsV1();

  return {
    schemaVersion: "ai_estimate_engine_v1",
    projectId,
    projectTitle: project.title || project.customerName || projectId,
    customerName: project.customerName ?? null,
    matchedCustomer: matched ? toCustomerMasterV1(matched) : null,
    rank: rank ? toRankMasterV1(rank) : null,
    travelFee: matched?.standardTravelFee ?? 5000,
    laborUnitPrice: matched?.standardLaborUnitPrice ?? 8000,
    discountRate:
      (matched?.standardDiscountRate ?? 0) + (rank?.discountRate ?? 0),
    documentCenter,
    masterSnapshot: {
      workCount: stats.workCount,
      materialCount: stats.materialCount,
      priceOverrideCount: stats.priceOverrideCount,
    },
  };
}

export function resolveCustomerMasterForEstimate(customerId: string | null): {
  customer: CustomerMasterV1 | null;
  rank: RankMasterV1 | null;
} {
  if (!customerId) return { customer: null, rank: null };
  const c = getMasterV1Customer(customerId);
  if (!c) return { customer: null, rank: null };
  const rank = c.rankId
    ? listMasterV1Ranks().find((r) => r.id === c.rankId) ?? null
    : null;
  return {
    customer: toCustomerMasterV1(c),
    rank: rank ? toRankMasterV1(rank) : null,
  };
}
