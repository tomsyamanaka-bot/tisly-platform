import type { AiEstimateCandidate } from "../business/business-types.js";
export interface AiEstimateV3Result {
    id: string;
    projectId: string;
    espCount: number;
    lightCount: number;
    cameraCount: number;
    lanDistanceM: number;
    constructionDays: number;
    checklist: string[];
    candidate: AiEstimateCandidate;
    createdAt: string;
}
export declare function generateAiEstimateV3(projectId: string): AiEstimateV3Result;
export declare function getLatestAiEstimateV3(projectId: string): AiEstimateV3Result | null;
