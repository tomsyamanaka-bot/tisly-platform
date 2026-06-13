/** Field Operations System v1 — 材料マスター / 工事テンプレ / 持ち物 / 発注 */

export const MATERIAL_CATEGORIES = [
  "防犯カメラ",
  "NVR",
  "HDD",
  "LAN",
  "電源",
  "配管",
  "部材",
  "工具",
] as const;

export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

export interface MaterialV1 {
  id: string;
  category: string;
  name: string;
  maker: string | null;
  model: string | null;
  unit: string;
  cost: number;
  stockQty: number;
  minStock: number;
  supplier: string | null;
  memo: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkTemplateV1 {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
  items: WorkTemplateItemV1[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkTemplateItemV1 {
  id: string;
  templateId: string;
  materialId: string | null;
  label: string;
  qty: number;
  unit: string | null;
  itemType: "material" | "tool";
  sortOrder: number;
}

export type ProjectSource = "survey" | "business";

export interface ProjectRefV1 {
  source: ProjectSource;
  projectId: string;
}

export type PurchaseLineStatus = "pending" | "ordered" | "received" | "carried";

export interface FieldCheckItemV1 {
  id: string;
  projectSource: ProjectSource;
  projectId: string;
  label: string;
  category: string;
  quantity: number;
  unit: string | null;
  materialId: string | null;
  source: "auto" | "manual";
  checked: boolean;
  checkedAt: string | null;
  checkedBy: string | null;
  sortOrder: number;
}

export interface FieldCheckSessionV1 {
  id: string;
  projectSource: ProjectSource;
  projectId: string;
  checkedCount: number;
  totalCount: number;
  allChecked: boolean;
  completedBy: string | null;
  completedAt: string;
  memo: string | null;
}

export interface PurchaseLineV1 {
  id: string;
  projectSource: ProjectSource;
  projectId: string;
  materialId: string | null;
  label: string;
  qtyRequired: number;
  qtyOrdered: number;
  unit: string | null;
  status: PurchaseLineStatus;
  supplier: string | null;
  stockQty: number | null;
  shortageQty: number;
  orderedAt: string | null;
  receivedAt: string | null;
  carriedAt: string | null;
  sortOrder: number;
}

export const PURCHASE_STATUS_LABELS: Record<PurchaseLineStatus, string> = {
  pending: "発注前",
  ordered: "発注済",
  received: "入荷済",
  carried: "現場持込済",
};

/** 到着・作業開始・作業完了セッション（Arrival + Work Completion v1） */
export interface WorkSessionV1 {
  id: string;
  projectSource: ProjectSource;
  projectId: string;
  workDate: string;
  scheduleEventId: string | null;
  arrivalTime: string | null;
  arrivalLat: number | null;
  arrivalLng: number | null;
  startTime: string | null;
  completionTime: string | null;
  workerName: string | null;
  workMemo: string | null;
  forceCompleteReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompletionChecklistItemV1 {
  id: string;
  projectSource: ProjectSource;
  projectId: string;
  category: string;
  label: string;
  checked: boolean;
  checkedAt: string | null;
  checkedBy: string | null;
  sortOrder: number;
  source: "auto" | "manual";
  photoId: string | null;
  photoUrl: string | null;
  templateItemId: string | null;
  memo: string | null;
}

/** 現場チェックリスト — テンプレート（案件到着時に自動生成） */
export interface FieldChecklistTemplateV1 {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
  items: FieldChecklistTemplateItemV1[];
  createdAt: string;
  updatedAt: string;
}

export interface FieldChecklistTemplateItemV1 {
  id: string;
  templateId: string;
  label: string;
  sortOrder: number;
  photoRequired: boolean;
}

export interface FieldChecklistMonthlyStatsV1 {
  month: string;
  projectCount: number;
  totalItems: number;
  checkedItems: number;
  missedItems: number;
  confirmationRate: number;
}
