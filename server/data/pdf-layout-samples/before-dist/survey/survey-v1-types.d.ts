/** TiSLY 現調PWA v1 — 型・定数（見積PWA 連携を見据えた正本） */
export declare const SURVEY_WORKFLOW_STATUSES: readonly ["surveying", "estimate_pending", "estimate_done", "ordered", "completed"];
export type SurveyWorkflowStatus = (typeof SURVEY_WORKFLOW_STATUSES)[number];
export declare const SURVEY_WORKFLOW_LABELS: Record<SurveyWorkflowStatus, string>;
export declare const SURVEY_MATERIAL_CATEGORIES: readonly ["camera", "wifi", "intercom", "electrical", "lighting", "lan", "antenna", "other"];
export type SurveyMaterialCategory = (typeof SURVEY_MATERIAL_CATEGORIES)[number];
export declare const SURVEY_MATERIAL_LABELS: Record<SurveyMaterialCategory, string>;
/** 見積PWA（business PRICING_CATEGORIES）へのマッピング */
export declare const SURVEY_TO_ESTIMATE_CATEGORY: Record<SurveyMaterialCategory, string>;
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
    /** survey_project_notes.notes（作成・更新・詳細 GET で付与） */
    notes?: string | null;
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
