/** 見積マスター v1 — 顧客/ランク/作業/材料/顧客別単価 */

export const MASTER_V1_WORK_CATEGORIES = [
  "防犯カメラ",
  "ネットワーク",
  "電気",
  "センサー",
  "設定",
  "その他",
] as const;
export type MasterV1WorkCategory = (typeof MASTER_V1_WORK_CATEGORIES)[number];

export const MASTER_V1_MATERIAL_CATEGORIES = [
  "防犯カメラ",
  "ネットワーク",
  "ケーブル",
  "電源",
  "センサー",
  "その他",
] as const;
export type MasterV1MaterialCategory = (typeof MASTER_V1_MATERIAL_CATEGORIES)[number];

export interface MasterV1Customer {
  id: string;
  customerCode: string;
  name: string;
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
  memo: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MasterV1WorkItem {
  id: string;
  category: string;
  code: string;
  name: string;
  unit: string;
  standardCost: number;
  laborCost: number;
  memo: string | null;
  favorite: boolean;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface MasterV1Material {
  id: string;
  category: string;
  code: string;
  name: string;
  maker: string | null;
  model: string | null;
  unit: string;
  cost: number;
  memo: string | null;
  favorite: boolean;
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
  workItemId: string | null;
  materialId: string | null;
  qtyPerUnit: number;
  memo: string | null;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface MasterV1EstimatePreviewCandidate {
  sourceType: "symbol" | "line";
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

export interface MasterV1EstimatePreview {
  sketchId: string | null;
  projectId: string | null;
  exportedAt: string;
  symbolCount: number;
  pathCount: number;
  workCandidates: MasterV1EstimatePreviewCandidate[];
  materialCandidates: MasterV1EstimatePreviewCandidate[];
}

export type MasterV1Entity =
  | "customers"
  | "ranks"
  | "work-items"
  | "materials"
  | "customer-prices"
  | "symbol-mappings";
