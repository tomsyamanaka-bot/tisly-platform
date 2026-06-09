import { type EstimateGenerateResult } from "../business/services/estimateGenerateService.js";
export interface EstimateV4Candidate {
    category: "LAN" | "Camera" | "ESP" | "Shelly" | "電源" | "工事費";
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number;
}
export interface ProjectEstimateV4Result {
    phase: string;
    projectId: string;
    surveyProjectId: string;
    estimate: EstimateGenerateResult["estimate"];
    candidates: EstimateV4Candidate[];
    analysis: EstimateGenerateResult["analysis"];
    tomsFormat: EstimateGenerateResult["tomsFormat"];
}
export declare function buildEstimateV4Candidates(analysis: NonNullable<EstimateGenerateResult["analysis"]>, tomsFormat: EstimateGenerateResult["tomsFormat"]): EstimateV4Candidate[];
export declare function generateProjectEstimateV4(projectId: string, opts?: {
    runAnalysis?: boolean;
}): ProjectEstimateV4Result;
export declare function findBusinessProjectBySurvey(surveyProjectId: string): string | null;
