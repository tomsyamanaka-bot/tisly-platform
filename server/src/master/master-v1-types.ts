/** 見積マスター v1 — 顧客/ランク/作業/材料/顧客別単価 */

export const MASTER_V1_WORK_CATEGORIES = [
  "防犯カメラ",
  "LAN / ネットワーク",
  "Wi-Fi / AP",
  "電気工事",
  "照明",
  "セキュリティ",
  "現調 / 設計",
  "その他",
] as const;
export type MasterV1WorkCategory = (typeof MASTER_V1_WORK_CATEGORIES)[number];

export const MASTER_V1_MATERIAL_CATEGORIES = [
  "防犯カメラ",
  "LAN / ネットワーク",
  "Wi-Fi / AP",
  "電気工事",
  "照明",
  "セキュリティ",
  "その他",
] as const;
export type MasterV1MaterialCategory = (typeof MASTER_V1_MATERIAL_CATEGORIES)[number];

export interface MasterV1Category {
  id: string;
  kind: "work" | "material" | "both";
  categoryMain: string;
  categorySub: string;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export const MASTER_V1_CUSTOMER_TYPES = [
  "一般",
  "法人",
  "管理会社",
  "元請",
  "個人",
  "その他",
] as const;
export type MasterV1CustomerType = (typeof MASTER_V1_CUSTOMER_TYPES)[number];

export interface MasterV1Customer {
  id: string;
  customerCode: string;
  name: string;
  customerType: string;
  standardMarkupRate: number;
  standardDiscountRate: number;
  standardLaborUnitPrice: number;
  standardTravelFee: number;
  rankId: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  memo: string | null;
  favorite: boolean;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface MasterV1Rank {
  id: string;
  name: string;
  costMultiplier: number;
  laborMultiplier: number;
  grossMarginRate: number;
  discountRate: number;
  memo: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MasterV1WorkItem {
  id: string;
  /** @deprecated use categoryMain */
  category: string;
  categoryMain: string;
  categorySub: string;
  code: string;
  name: string;
  unit: string;
  defaultUnit: string;
  defaultQuantity: number;
  standardCost: number;
  laborCost: number;
  standardLabor: number;
  standardHours: number;
  standardSellPrice: number;
  tags: string[];
  memo: string | null;
  favorite: boolean;
  isFavorite: boolean;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface MasterV1Material {
  id: string;
  /** @deprecated use categoryMain */
  category: string;
  categoryMain: string;
  categorySub: string;
  code: string;
  name: string;
  maker: string | null;
  model: string | null;
  supplier: string | null;
  unit: string;
  defaultUnit: string;
  defaultQuantity: number;
  cost: number;
  standardSellPrice: number;
  stockManaged: boolean;
  tags: string[];
  memo: string | null;
  favorite: boolean;
  isFavorite: boolean;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type MasterV1PriceItemType = "work" | "material";

export interface MasterV1CustomerPrice {
  id: string;
  customerId: string;
  itemType: MasterV1PriceItemType;
  itemId: string;
  unitPrice: number;
  costPrice: number;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MasterV1SymbolMappingKind = "symbol" | "line";

export interface MasterV1SymbolMapping {
  id: string;
  mappingKind: MasterV1SymbolMappingKind;
  symbolType: string;
  label: string;
  categoryMain: string | null;
  categorySub: string | null;
  workItemId: string | null;
  materialId: string | null;
  extraMaterialIds: string[];
  qtyPerUnit: number;
  memo: string | null;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type MasterV1EstimateCandidateSourceType =
  | "symbol"
  | "line"
  | "template"
  | "document";

export interface MasterV1EstimatePreviewCandidate {
  sourceType: MasterV1EstimateCandidateSourceType;
  sourceId: string;
  symbolType: string;
  label: string;
  qty: number;
  unit: string;
  workItem: MasterV1WorkItem | null;
  material: MasterV1Material | null;
  mappingId: string | null;
  memo: string | null;
}

export type MasterV1PriceSource =
  | "customer_override"
  | "rank_multiplier"
  | "standard"
  | "cost_double"
  | "missing";

export interface MasterV1EstimatePreviewLine {
  lineKey: string;
  sourceType: MasterV1EstimateCandidateSourceType;
  sourceId: string;
  symbolType: string;
  label: string;
  qty: number;
  unit: string;
  itemType: "work" | "material";
  itemId: string | null;
  unitCost: number;
  totalCost: number;
  standardUnitSell: number;
  rankUnitSell: number;
  customerUnitSell: number | null;
  appliedUnitSell: number;
  priceSource: MasterV1PriceSource;
  priceBasis: string;
  totalSell: number;
  grossProfit: number;
  grossProfitRate: number;
  mappingId: string | null;
  memo: string | null;
  enabled: boolean;
  isUnmapped: boolean;
  sourceKind: "drawing" | "template" | "document";
}

export interface MasterV1EstimatePreview {
  sketchId: string | null;
  projectId: string | null;
  exportedAt: string;
  symbolCount: number;
  pathCount: number;
  workCandidates: MasterV1EstimatePreviewCandidate[];
  materialCandidates: MasterV1EstimatePreviewCandidate[];
}

export interface MasterV1EstimatePreviewEnriched extends MasterV1EstimatePreview {
  customerId: string | null;
  workLines: MasterV1EstimatePreviewLine[];
  materialLines: MasterV1EstimatePreviewLine[];
  totalCost: number;
  totalSell: number;
  grossProfit: number;
  grossProfitRate: number;
}

/** AI見積エンジン v2 — 候補プレビュー拡張 */
export const AI_ESTIMATE_ENGINE_V2_SCHEMA = "ai_estimate_engine_v2" as const;

export type AiEstimateDocumentSourceType =
  | "survey_drawing"
  | "specification_photo"
  | "completion_photo"
  | "pdf"
  | "project_template";

export interface AiEstimateDocumentSourceV2 {
  sourceType: AiEstimateDocumentSourceType;
  label: string;
  projectId: string;
  resourceId: string | null;
  viewerUrl: string | null;
  apiUrl: string | null;
  status: "available" | "placeholder" | "missing";
  note: string | null;
}

export interface AiEstimateWarningV2 {
  code: string;
  severity: "info" | "warn" | "error";
  message: string;
  relatedLineKey: string | null;
}

export interface MasterV1EstimatePreviewEnrichedV2 extends MasterV1EstimatePreviewEnriched {
  schemaVersion: typeof AI_ESTIMATE_ENGINE_V2_SCHEMA;
  mmPerPx: number;
  wasteFactor: number;
  workTypes: string[];
  templateName: string | null;
  sources: AiEstimateDocumentSourceV2[];
  unmappedLines: MasterV1EstimatePreviewLine[];
  templateLines: MasterV1EstimatePreviewLine[];
  warnings: AiEstimateWarningV2[];
}

export type MasterV1MissingFilter = "cost" | "sell" | "supplier" | "model" | "category";

export type MasterV1Entity =
  | "customers"
  | "ranks"
  | "work-items"
  | "materials"
  | "customer-prices"
  | "symbol-mappings"
  | "categories";
