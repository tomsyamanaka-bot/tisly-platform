import type { TislyEvent } from "../notification/types.js";
import { type AiAlertPriority } from "./risk-score.js";
import { type TrendReport } from "./trend-analyzer.js";
export interface AiSummaryBullet {
    text: string;
    priority: AiAlertPriority;
}
export interface AiSummaryReport {
    period: "today" | "week" | "month";
    bullets: AiSummaryBullet[];
    generatedAt: string;
}
export interface NaturalLanguageReport {
    period: "today" | "week" | "month";
    paragraphs: string[];
    generatedAt: string;
}
export declare function processEventAnalytics(event: TislyEvent): {
    riskScore: number;
    priority: AiAlertPriority;
    factors: string[];
};
export declare function generateAiSummary(period: "today" | "week" | "month"): AiSummaryReport;
export declare function generateNaturalLanguageReport(period: "today" | "week" | "month"): NaturalLanguageReport;
export declare function getAnalyticsOverview(): {
    risk: {
        avg24h: number;
        highRiskCount24h: number;
    };
    trends: {
        today: TrendReport;
        week: TrendReport;
        month: TrendReport;
    };
    summary: {
        today: AiSummaryReport;
        week: AiSummaryReport;
        month: AiSummaryReport;
    };
    naturalLanguage: {
        today: NaturalLanguageReport;
        week: NaturalLanguageReport;
        month: NaturalLanguageReport;
    };
};
export type { TrendReport };
