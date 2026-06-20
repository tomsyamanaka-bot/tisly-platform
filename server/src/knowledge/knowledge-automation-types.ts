/** TiSLY Knowledge Automation Engine v1 — 型定義 */

import type {
  KnowledgeCardInputV1,
  KnowledgePhotoKindV1,
  KnowledgePdfKindV1,
  KnowledgeSourceTypeV1,
} from "./knowledge-types.js";

/** 案件ライフサイクルで候補を生成するタイミング */
export type KnowledgeAutomationStageV1 =
  | "project_created"
  | "survey"
  | "estimate"
  | "construction"
  | "completed";

export type KnowledgeCandidateStatusV1 = "pending" | "approved" | "rejected";

export type KnowledgeCandidateSourceV1 =
  | "project_stage"
  | "pdf_parse"
  | "photo_ocr"
  | "plc_asset"
  | "threedprint_asset"
  | "factory_asset";

export interface KnowledgePdfExtractV1 {
  projectNo: string;
  customerName: string;
  category: string;
  equipmentNames: string[];
  materialNames: string[];
  notes: string[];
  pdfKind?: KnowledgePdfKindV1;
  fileName?: string;
  localPath?: string;
}

export interface KnowledgePhotoOcrExtractV1 {
  modelNumbers: string[];
  partNumbers: string[];
  breakerCapacities: string[];
  deviceNames: string[];
  rawText: string;
  engine: string;
}

export interface KnowledgeCandidateCardDraftV1 extends KnowledgeCardInputV1 {
  photoMeta?: {
    photoId: string;
    photoKind: KnowledgePhotoKindV1;
    title: string;
    tags: string[];
    url?: string;
  };
  pdfMeta?: {
    kind: KnowledgePdfKindV1;
    fileName: string;
    localPath: string;
    projectId: string;
    customerName?: string;
  };
}

export interface KnowledgeCandidateV1 {
  id: string;
  status: KnowledgeCandidateStatusV1;
  source: KnowledgeCandidateSourceV1;
  stage?: KnowledgeAutomationStageV1;
  projectId?: string;
  projectNo?: string;
  customerName?: string;
  title: string;
  category: string;
  tags: string[];
  summary: string;
  draft: KnowledgeCandidateCardDraftV1;
  pdfExtract?: KnowledgePdfExtractV1;
  ocrExtract?: KnowledgePhotoOcrExtractV1;
  assetPath?: string;
  assetKind?: string;
  createdAt: string;
  updatedAt: string;
  approvedCardId?: string;
  rejectedReason?: string;
}

export interface KnowledgeAssetRecordV1 {
  id: string;
  domain: "PLC" | "3DPrint" | "Factory";
  subFolder: string;
  fileName: string;
  relativePath: string;
  projectNo?: string;
  projectId?: string;
  title: string;
  category: string;
  tags: string[];
  summary: string;
  fileFormats?: string[];
  ladderDescription?: string;
  updatedAt: string;
}

export interface MothershipExplorerNodeV1 {
  name: string;
  path: string;
  kind: "folder" | "file" | "link";
  count?: number;
  children?: MothershipExplorerNodeV1[];
  meta?: Record<string, string | number | boolean>;
}

export const PLC_ASSET_SUBFOLDERS_V1 = [
  "Templates",
  "Projects",
  "Libraries",
  "IOMaps",
  "Manuals",
  "Examples",
] as const;

export const THREEDPRINT_ASSET_SUBFOLDERS_V1 = [
  "Parts",
  "Assemblies",
  "Fixtures",
  "RP2350",
  "PLC",
  "Camera",
  "DINRail",
  "FactoryMiniature",
  "Manuals",
  "CAD",
  "STL",
  "STEP",
  "GCode",
  "Photos",
  "Prototypes",
] as const;

export const FACTORY_ASSET_SUBFOLDERS_V1 = [
  "Conveyor",
  "Crusher",
  "Sorter",
  "Tank",
  "Sensor",
  "PLC",
  "HMI",
  "Modbus",
  "Demo",
] as const;

export type PlcAssetSubfolderV1 = (typeof PLC_ASSET_SUBFOLDERS_V1)[number];
export type ThreeDPrintAssetSubfolderV1 = (typeof THREEDPRINT_ASSET_SUBFOLDERS_V1)[number];
export type FactoryAssetSubfolderV1 = (typeof FACTORY_ASSET_SUBFOLDERS_V1)[number];

export const STAGE_LABELS_V1: Record<KnowledgeAutomationStageV1, string> = {
  project_created: "案件作成",
  survey: "現調",
  estimate: "見積",
  construction: "施工",
  completed: "完了",
};

export const SOURCE_LABELS_V1: Record<KnowledgeCandidateSourceV1, string> = {
  project_stage: "案件ステージ",
  pdf_parse: "PDF解析",
  photo_ocr: "写真OCR",
  plc_asset: "PLC資産",
  threedprint_asset: "3DPrint資産",
  factory_asset: "Factory資産",
};

export type KnowledgeAutomationSourceTypeV1 = KnowledgeSourceTypeV1 | "automation";
