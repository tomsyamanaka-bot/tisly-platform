import { type SurveyMaterialV1, type SurveyPhotoV1, type SurveyProjectV1, type SurveyWorkflowStatus } from "./survey-v1-types.js";
export interface SurveyHandoffLogV1 {
    id: string;
    surveyProjectId: string;
    businessProjectId: string;
    handoffBy: string | null;
    handoffAt: string;
    payloadJson: Record<string, unknown>;
}
export interface SurveyProjectV1Detail extends SurveyProjectV1 {
    notes: string | null;
    photos: SurveyPhotoV1[];
    materials: SurveyMaterialV1[];
    handoff: SurveyHandoffLogV1 | null;
}
export declare function listSurveyProjectsV1(opts?: {
    customerCode?: string;
    workflowStatus?: SurveyWorkflowStatus;
}): SurveyProjectV1[];
export declare function createSurveyProjectV1(input: {
    customerCode: string;
    customerName: string;
    customerAddress?: string;
    siteName?: string;
    address?: string;
    phone?: string;
    email?: string;
    surveyDate?: string;
    assignee?: string;
    notes?: string;
    projectNo?: string;
}): SurveyProjectV1;
export declare function getSurveyProjectV1(projectId: string): SurveyProjectV1 | null;
export declare function getSurveyProjectV1Detail(projectId: string): SurveyProjectV1Detail | null;
export declare function updateSurveyProjectV1(projectId: string, patch: Partial<{
    customerName: string;
    customerAddress: string;
    siteName: string;
    address: string;
    phone: string;
    email: string;
    surveyDate: string;
    assignee: string;
    notes: string;
    workflowStatus: SurveyWorkflowStatus;
}>): SurveyProjectV1 | null;
export declare function listSurveyPhotosV1(projectId: string): SurveyPhotoV1[];
export declare function addSurveyPhotoMemoV1(projectId: string, input: {
    comment?: string;
    imageBase64?: string;
    fileName?: string;
    takenAt?: string;
    uploadedBy?: string;
    sortOrder?: number;
}): SurveyPhotoV1;
export declare function listSurveyMaterialsV1(projectId: string): SurveyMaterialV1[];
export declare function addSurveyMaterialV1(projectId: string, input: {
    category: string;
    itemLabel?: string;
    quantity?: number;
    memo?: string;
}): SurveyMaterialV1;
export declare function updateWorkflowStatusV1(projectId: string, workflowStatus: SurveyWorkflowStatus): SurveyProjectV1 | null;
export declare function markEstimatePendingV1(projectId: string, handoffBy?: string): {
    project: SurveyProjectV1;
    handoff: SurveyHandoffLogV1;
};
export declare function updateSurveyPhotoV1(projectId: string, photoId: string, patch: {
    title?: string;
    comment?: string;
    imageBase64?: string;
    fileName?: string;
}): SurveyPhotoV1 | null;
export declare function moveSurveyPhotoV1(projectId: string, photoId: string, direction: "up" | "down"): SurveyPhotoV1[] | null;
export declare function deleteSurveyPhotoV1(projectId: string, photoId: string): boolean;
export declare function copySurveyProjectV1(projectId: string): SurveyProjectV1;
export declare function deleteSurveyProjectV1(projectId: string): boolean;
