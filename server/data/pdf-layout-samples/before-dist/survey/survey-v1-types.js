/** TiSLY 現調PWA v1 — 型・定数（見積PWA 連携を見据えた正本） */
export const SURVEY_WORKFLOW_STATUSES = [
    "surveying",
    "estimate_pending",
    "estimate_done",
    "ordered",
    "completed",
];
export const SURVEY_WORKFLOW_LABELS = {
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
];
export const SURVEY_MATERIAL_LABELS = {
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
export const SURVEY_TO_ESTIMATE_CATEGORY = {
    camera: "camera",
    wifi: "ap",
    intercom: "intercom",
    electrical: "outlet",
    lighting: "lighting",
    lan: "lan",
    antenna: "other",
    other: "other",
};
