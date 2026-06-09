export interface SurveyAnalysisV4Result {
    id: string;
    projectId: string;
    cameraCount: number;
    espCount: number;
    lanDistanceM: number;
    poeCount: number;
    hasPanel: boolean;
    crewCount: number;
    manHours: number;
    checklist: string[];
    confidence: number;
    createdAt: string;
}
export declare function runSurveyAnalysisV4(projectId: string): SurveyAnalysisV4Result;
export declare function getLatestSurveyAnalysisV4(projectId: string): SurveyAnalysisV4Result | null;
