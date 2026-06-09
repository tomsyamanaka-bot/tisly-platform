export interface SurveySyncItem {
    type: "photo" | "memo" | "checklist" | "drawing" | "gps";
    photoType?: string;
    imageBase64?: string;
    fileName?: string;
    mimeType?: string;
    checklist?: Record<string, unknown>;
    notes?: string;
    gpsLat?: number;
    gpsLng?: number;
    clientId?: string;
}
export interface SurveySyncBatch {
    projectId: string;
    items: SurveySyncItem[];
}
export declare function processSurveySync(batch: SurveySyncBatch, uploadedBy?: string): {
    projectId: string;
    applied: number;
    failed: Array<{
        index: number;
        error: string;
    }>;
};
