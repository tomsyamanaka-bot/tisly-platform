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
  "lan",
  "wifi",
  "electrical",
  "lighting",
  "intercom",
  "aircon",
  "other",
] as const;

export type SurveyMaterialCategory = (typeof SURVEY_MATERIAL_CATEGORIES)[number];

export const SURVEY_MATERIAL_LABELS: Record<SurveyMaterialCategory, string> = {
  camera: "防犯カメラ",
  lan: "LAN",
  wifi: "WiFi",
  electrical: "電気",
  lighting: "照明",
  intercom: "インターホン",
  aircon: "エアコン",
  other: "その他",
};

/** 見積PWA（business PRICING_CATEGORIES）へのマッピング */
export const SURVEY_TO_ESTIMATE_CATEGORY: Record<SurveyMaterialCategory, string> = {
  camera: "camera",
  lan: "lan",
  wifi: "ap",
  electrical: "outlet",
  lighting: "lighting",
  intercom: "intercom",
  aircon: "aircon",
  other: "other",
};

export interface SurveyProjectV1 {
  projectId: string;
  projectNo: string | null;
  customerCode: string;
  customerName: string;
  siteName: string;
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
  comment: string | null;
  takenAt: string | null;
  uploadedBy: string | null;
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
