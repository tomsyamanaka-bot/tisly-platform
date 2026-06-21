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
  "順序制御",
] as const;

/** PLC テンプレ — GX Works3 向けメタ（検索・UI 表示用） */
export const PLC_TEMPLATE_META_V1: Record<
  (typeof PLC_TEMPLATE_TOPICS_V1)[number],
  { ladder: string; usage: string; cautions: string }
> = {
  自己保持: {
    ladder: "押ボタン起動・停止の基本自己保持回路（SET/RESET またはラッチ）",
    usage: "モータ起動、ランプ点灯、運転中フラグの保持",
    cautions: "非常停止回路とは独立配線。停止ボタンは NC 接点推奨",
  },
  非常停止: {
    ladder: "E-STOP 入力で全出力遮断、復帰は手動リセット",
    usage: "コンベア・プレス・自動装置の安全回路",
    cautions: "ハードウェア E-STOP とソフト停止を混同しない。復帰前に原因確認",
  },
  点滅: {
    ladder: "タイマーまたはトグルで ON/OFF 周期出力",
    usage: "警報ランプ・メンテ表示・待機中インジケータ",
    cautions: "スキャン周期に依存するため点滅周期はタイマー定数で調整",
  },
  タイマー: {
    ladder: "TON/TOF/TP タイマーブロックの標準接続",
    usage: "起動遅延、停止遅延、パルス出力、インターロック時間",
    cautions: "設定値単位（0.1s/1s）を機種設定と一致させる",
  },
  インターロック: {
    ladder: "相互排他条件で同時起動を禁止",
    usage: "正転/逆転、排他バルブ、二重起動防止",
    cautions: "機械側ハードインターロックと論理 AND で二重化推奨",
  },
  順序制御: {
    ladder: "ステップ番号・遷移条件・完了フラグによる順序制御",
    usage: "複数工程の自動運転、コンベア段取り替え",
    cautions: "異常時は全ステップリセット手順をマニュアル化",
  },
};

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
