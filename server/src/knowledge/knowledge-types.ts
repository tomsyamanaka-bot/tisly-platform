/** TiSLY Knowledge Core v1 + Acquisition Engine v1 — 型定義 */

export type KnowledgeSourceTypeV1 =
  | "manual"
  | "project"
  | "photo"
  | "pdf"
  | "quick"
  | "plc-template"
  | "rp-template";

export type KnowledgePhotoKindV1 = "survey" | "completion";

export type KnowledgePdfKindV1 = "estimate" | "invoice" | "specification" | "report";

export type KnowledgeQnapSyncStatusV1 = "none" | "pending" | "uploading" | "success" | "failed";

export interface KnowledgePhotoMetaV1 {
  photoId: string;
  photoKind: KnowledgePhotoKindV1;
  title: string;
  tags: string[];
  url?: string;
}

export interface KnowledgePdfMetaV1 {
  kind: KnowledgePdfKindV1;
  fileName: string;
  localPath: string;
  projectId: string;
  customerName?: string;
}

export interface KnowledgeCardV1 {
  id: string;
  title: string;
  category: string;
  tags: string[];
  summary: string;
  files: string[];
  updatedAt: string;
  /** Acquisition Engine v1 — 任意メタデータ */
  sourceType?: KnowledgeSourceTypeV1;
  relatedProjectIds?: string[];
  projectNo?: string;
  customerName?: string;
  photoMeta?: KnowledgePhotoMetaV1;
  pdfMeta?: KnowledgePdfMetaV1;
  qnapSyncStatus?: KnowledgeQnapSyncStatusV1;
}

export interface KnowledgeSearchIndexEntryV1 {
  id: string;
  title: string;
  category: string;
  tags: string[];
  summary: string;
  updatedAt: string;
  projectNo?: string;
  customerName?: string;
  sourceType?: KnowledgeSourceTypeV1;
}

export interface KnowledgeSearchIndexV1 {
  version: 1;
  updatedAt: string;
  entries: KnowledgeSearchIndexEntryV1[];
}

export interface KnowledgeSearchHitV1 {
  id: string;
  title: string;
  category: string;
  tags: string[];
  summary: string;
  updatedAt: string;
  projectNo?: string;
  customerName?: string;
  sourceType?: KnowledgeSourceTypeV1;
  score: number;
  matchedFields: string[];
}

export interface WorkCategoriesMasterV1 {
  version: number;
  updatedAt: string;
  description?: string;
  categories: string[];
}

export type KnowledgeFolderName =
  | "Standards"
  | "Procedures"
  | "Troubles"
  | "Templates"
  | "Ladder"
  | "Materials"
  | "Tools"
  | "Notes"
  | "PLC"
  | "RP"
  | "3DPrint"
  | "KnowledgeCards"
  | "SearchIndex";

export const KNOWLEDGE_FOLDERS: KnowledgeFolderName[] = [
  "Standards",
  "Procedures",
  "Troubles",
  "Templates",
  "Ladder",
  "Materials",
  "Tools",
  "Notes",
  "PLC",
  "RP",
  "3DPrint",
  "KnowledgeCards",
  "SearchIndex",
];

/** PLC テンプレートサブカテゴリ（GX Works3 部品ライブラリ化前提） */
export const PLC_TEMPLATE_TOPICS_V1 = [
  "自己保持",
  "非常停止",
  "点滅",
  "タイマー",
  "インターロック",
] as const;

/** RP / ESP テンプレートトピック */
export const RP_TEMPLATE_TOPICS_V1 = ["RP2350", "ESP32", "配線例", "回路図", "設定例"] as const;

/** 3DPrint MotherShip サブフォルダ */
export const THREEDPRINT_SUBFOLDERS_V1 = [
  "CAD",
  "STL",
  "STEP",
  "GCode",
  "Photos",
  "Prototypes",
  "Parts",
  "Manuals",
] as const;

export interface KnowledgeCardInputV1 {
  id?: string;
  title: string;
  category: string;
  tags?: string[];
  summary: string;
  files?: string[];
  updatedAt?: string;
  sourceType?: KnowledgeSourceTypeV1;
  relatedProjectIds?: string[];
  projectNo?: string;
  customerName?: string;
  photoMeta?: KnowledgePhotoMetaV1;
  pdfMeta?: KnowledgePdfMetaV1;
  qnapSyncStatus?: KnowledgeQnapSyncStatusV1;
}

export interface KnowledgeFromProjectResultV1 {
  projectId: string;
  projectNo: string;
  cardsCreated: KnowledgeCardV1[];
  cardsSkipped: string[];
  qnapQueued: number;
}

export interface KnowledgeQuickCaptureInputV1 {
  title: string;
  category: string;
  tags?: string[];
  memo: string;
  imageBase64?: string;
  fileName?: string;
}
