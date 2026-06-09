import type { ClassifiedEvent } from "./event-classifier.js";
export type AiAlertPriority = "info" | "warning" | "alarm" | "critical";
export interface RiskScoreResult {
    score: number;
    priority: AiAlertPriority;
    factors: string[];
}
export declare function scoreToPriority(score: number): AiAlertPriority;
export declare function computeRiskScore(eventType: string, opts?: {
    createdAt?: string;
    concurrentCount?: number;
    siteAnomalyCount24h?: number;
}): RiskScoreResult;
export declare function mergeClassifiedRisk(c: ClassifiedEvent): RiskScoreResult;
