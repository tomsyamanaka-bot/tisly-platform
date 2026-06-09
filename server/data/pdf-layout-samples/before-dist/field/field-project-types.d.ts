export declare const BUILDING_TYPES: readonly ["detached_house", "apartment", "office", "store", "warehouse", "other"];
export type BuildingType = (typeof BUILDING_TYPES)[number];
export declare const PLAN_CANDIDATES: readonly ["basic", "standard", "premium", "custom"];
export type PlanCandidate = (typeof PLAN_CANDIDATES)[number];
export interface FieldProjectInput {
    customerCode?: string;
    customerName: string;
    address: string;
    buildingType: BuildingType | string;
    planCandidates: string[];
    surveyStaff: string;
    scheduledDate: string;
    memo?: string;
}
export interface FieldProjectRecord {
    id: string;
    customerCode: string;
    customerName: string;
    address: string;
    buildingType: string;
    planCandidates: string[];
    surveyStaff: string;
    scheduledDate: string;
    memo: string;
    surveyProjectId: string;
    businessProjectId: string;
    createdAt: string;
    updatedAt: string;
}
