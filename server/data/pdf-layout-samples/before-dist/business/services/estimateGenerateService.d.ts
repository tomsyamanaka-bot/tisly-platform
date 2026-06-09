import type { Estimate } from "../business-types.js";
import { getLatestSurveyAnalysisV4 } from "../../survey/ai-survey-analysis-v4.js";
export interface EstimateGenerateInput {
    projectId: string;
    surveyProjectId?: string;
    runAnalysis?: boolean;
}
export interface EstimateGenerateResult {
    estimate: Estimate;
    analysis: ReturnType<typeof getLatestSurveyAnalysisV4>;
    tomsFormat: {
        materials: Array<{
            name: string;
            quantity: number;
            unit: string;
            unitPrice: number;
        }>;
        laborHours: number;
        laborDays: number;
    };
}
export declare function generateEstimateFromSurvey(input: EstimateGenerateInput): EstimateGenerateResult;
