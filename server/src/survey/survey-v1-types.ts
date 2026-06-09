/** TiSLY 現調PWA v1 — 型・定数（見積PWA 連携を見据えた正本） */

export const SURVEY_WORKFLOW_STATUSES = [
  "surveying",
  "estimate_pending",
  "estimate_done",
  "ordered",
  "completed",
] as const;

export type SurveyWorkflowStatus = (typeof SURVEY_WORKFLOW_STATUSES)[number];

export const SURVEY_WORKFLOW_LABELS: Record<SurveyWorkflowStatus, string> = {
  surveying: "現調中",
  estimate_pending: "見積待ち",
  estimate_done: "見積済",
  ordered: "受注",
  completed: "完了",
};

export const SURVEY_MATERIAL_CATEGORIES = [
  "camera",
  "wifi",
  "intercom",
  "electrical",
  "lighting",
  "lan",
  "antenna",
  "other",
] as const;

export type SurveyMaterialCategory = (typeof SURVEY_MATERIAL_CATEGORIES)[number];

export const SURVEY_MATERIAL_LABELS: Record<SurveyMaterialCategory, string> = {
  camera: "防犯カメラ",
  wifi: "Wi-Fi",
  intercom: "インターホン",
  electrical: "コンセント",
  lighting: "照明",
  lan: "LAN配線",
  antenna: "アンテナ",
  other: "その他",
};

/** 見積PWA（business PRICING_CATEGORIES）へのマッピング */
export const SURVEY_TO_ESTIMATE_CATEGORY: Record<SurveyMaterialCategory, string> = {
  camera: "camera",
  wifi: "ap",
  intercom: "intercom",
  electrical: "outlet",
  lighting: "lighting",
  lan: "lan",
  antenna: "other",
  other: "other",
};

export interface SurveyProjectV1 {
  projectId: string;
  projectNo: string | null;
  customerCode: string;
  /** 依頼主 */
  customerName: string;
  /** 依頼主住所 */
  customerAddress: string | null;
  /** 現場名 */
  siteName: string;
  /** 工事場所 */
  address: string | null;
  phone: string | null;
  email: string | null;
  surveyDate: string | null;
  assignee: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  status: string;
  workflowStatus: SurveyWorkflowStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SurveyPhotoV1 {
  id: string;
  photoType: string;
  photoPath: string;
  url: string;
  /** 写真タイトル（DB: comment） */
  comment: string | null;
  title: string | null;
  takenAt: string | null;
  uploadedBy: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface SurveyMaterialV1 {
  id: string;
  projectId: string;
  category: SurveyMaterialCategory;
  itemLabel: string;
  quantity: number;
  memo: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
