export declare const SURVEY_PHOTO_TYPES: readonly ["outside", "inside", "drawing", "aerial", "electrical", "network", "panel", "camera", "sensor", "route", "other"];
export type SurveyPhotoType = (typeof SURVEY_PHOTO_TYPES)[number];
export declare const SURVEY_DRAWING_MIME: Set<string>;
export declare const DEFAULT_CHECKLIST_KEYS: readonly ["line", "wifi", "camera", "power", "panel", "lan_route", "sensor_candidates", "notify_targets", "hazard_zones", "install_difficulty"];
export interface SurveyProject {
    projectId: string;
    customerCode: string;
    siteName: string;
    address: string | null;
    gpsLat: number | null;
    gpsLng: number | null;
    status: string;
    createdAt: string;
    updatedAt: string;
}
export declare function surveyUploadsDir(projectId: string, photoType: string): string;
export declare function surveyDrawingsDir(projectId: string): string;
export declare function isValidSurveyPhotoType(t: string): t is SurveyPhotoType;
export declare function createSurveyProject(input: {
    customerCode: string;
    siteName: string;
    address?: string;
    gpsLat?: number;
    gpsLng?: number;
    status?: string;
}): SurveyProject;
export declare function getSurveyProject(projectId: string): SurveyProject | null;
export declare function listSurveyProjects(customerCode?: string): SurveyProject[];
export declare function updateSurveyProject(projectId: string, patch: Partial<{
    siteName: string;
    address: string;
    gpsLat: number;
    gpsLng: number;
    status: string;
    customerCode: string;
}>): SurveyProject | null;
export declare function deleteSurveyProject(projectId: string): boolean;
export declare function saveSurveyPhoto(params: {
    projectId: string;
    photoType: string;
    imageBase64: string;
    fileName?: string;
    uploadedBy?: string;
}): {
    id: string;
    photoPath: string;
    url: string;
};
export declare function listSurveyPhotos(projectId: string): Array<{
    id: string;
    photoType: string;
    photoPath: string;
    url: string;
    uploadedBy: string | null;
    createdAt: string;
}>;
export declare function saveSurveyDrawing(params: {
    projectId: string;
    imageBase64: string;
    fileName?: string;
    mimeType?: string;
    uploadedBy?: string;
}): {
    id: string;
    filePath: string;
    url: string;
};
export declare function listSurveyDrawings(projectId: string): Array<{
    id: string;
    filePath: string;
    fileName: string | null;
    mimeType: string | null;
    proFloorId: string | null;
    url: string;
    createdAt: string;
}>;
export declare function deleteSurveyDrawing(drawingId: string): boolean;
export declare function defaultChecklist(): Record<string, {
    checked: boolean;
    note: string;
}>;
export declare function getSurveyChecklist(projectId: string): Record<string, unknown>;
export declare function saveSurveyChecklist(projectId: string, checklist: Record<string, unknown>): void;
export declare function getSurveyProjectNotes(projectId: string): string | null;
export declare function updateSurveyPhotoType(photoId: string, photoType: string): boolean;
export declare function getLatestAiEstimate(projectId: string): {
    id: string;
    recommended: Record<string, unknown>;
} | null;
export declare function createAiEstimatePlaceholder(projectId: string): {
    id: string;
    recommended: Record<string, unknown>;
};
export declare function linkDrawingToProFloor(drawingId: string, proFloorId: string): boolean;
export declare function importSurveyDrawingToProLayer(drawingId: string, layerId: string): boolean;
