export interface EstimateCandidateV2 {
    id: string;
    category: "material" | "labor" | "device";
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    memo?: string;
}
export interface SurveyAnalysisV2Result {
    id: string;
    projectId: string;
    perimeterCameras: Array<{
        label: string;
        reason: string;
        confidence: number;
    }>;
    entranceCameras: Array<{
        label: string;
        reason: string;
        confidence: number;
    }>;
    indoorSensors: Array<{
        label: string;
        type: string;
        confidence: number;
    }>;
    lanDistanceEstimateM: number;
    powerOutlets: Array<{
        label: string;
        location: string;
    }>;
    shellyPlacements: Array<{
        label: string;
        purpose: string;
    }>;
    constructionNotes: string[];
    estimateCandidates: EstimateCandidateV2[];
    riskNotes: string[];
    missingInfo: string[];
    confidence: number;
    createdAt: string;
}
export declare function runSurveyAnalysisV2(projectId: string): SurveyAnalysisV2Result;
export declare function getLatestSurveyAnalysisV2(projectId: string): SurveyAnalysisV2Result | null;
