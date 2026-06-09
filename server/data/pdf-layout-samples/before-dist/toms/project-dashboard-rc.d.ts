import { type ProjectDashboardPayload } from "./project-dashboard.js";
import { buildUnifiedTimeline } from "../timeline/tisly-timeline.js";
import { getLatestSurveyAnalysisV4 } from "../survey/ai-survey-analysis-v4.js";
export interface ProjectDashboardRcCard {
    id: string;
    title: string;
    status: "ok" | "warn" | "pending" | "none";
    summary: string;
    href?: string;
    count?: number;
}
export interface ProjectDashboardRcPayload extends ProjectDashboardPayload {
    phase: string;
    rcCards: ProjectDashboardRcCard[];
    unifiedTimeline: ReturnType<typeof buildUnifiedTimeline>;
    surveyAnalysis: ReturnType<typeof getLatestSurveyAnalysisV4>;
}
export declare function buildProjectDashboardRc(projectId: string): ProjectDashboardRcPayload | null;
