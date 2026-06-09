import { buildProjectDashboard } from "./project-dashboard.js";
import { listMaintenanceSchedules } from "../maintenance/maintenance-schedule.js";
import { buildUnifiedTimeline } from "../timeline/tisly-timeline.js";
import { getLatestSurveyAnalysisV4 } from "../survey/ai-survey-analysis-v4.js";
export function buildProjectDashboardRc(projectId) {
    const base = buildProjectDashboard(projectId);
    if (!base)
        return null;
    const project = base.project;
    const surveyAnalysis = project.surveyProjectId
        ? getLatestSurveyAnalysisV4(project.surveyProjectId)
        : null;
    const customerCode = project.customerId.startsWith("BCU-") ? "TOMS001" : project.customerId;
    const maintSchedules = listMaintenanceSchedules(customerCode);
    const pendingMaint = maintSchedules.filter((s) => s.status === "pending");
    const drawingCount = base.drawings.plans.length + base.drawings.versions.length;
    const rcCards = [
        {
            id: "survey_info",
            title: "現調情報",
            status: project.surveyProjectId ? (surveyAnalysis ? "ok" : "warn") : "none",
            summary: surveyAnalysis
                ? `GPS・AI v4: カメラ${surveyAnalysis.cameraCount} / ESP${surveyAnalysis.espCount}`
                : project.surveyProjectId
                    ? "現調済み・分析未実施"
                    : "未紐付け",
            href: project.surveyProjectId ? `/survey?projectId=${project.surveyProjectId}` : undefined,
            count: base.photos.survey.length,
        },
        {
            id: "photos",
            title: "写真",
            status: base.photos.survey.length + base.photos.construction.length > 0 ? "ok" : "none",
            summary: `現調 ${base.photos.survey.length} / 施工 ${base.photos.construction.length}`,
            count: base.photos.survey.length + base.photos.construction.length,
        },
        {
            id: "drawings",
            title: "図面",
            status: drawingCount > 0 ? "ok" : "none",
            summary: drawingCount > 0 ? `図面 ${drawingCount} 件` : "図面未登録",
            count: drawingCount,
            href: base.links.drawing,
        },
        {
            id: "ai_estimate",
            title: "AI見積候補",
            status: surveyAnalysis ? "ok" : base.estimate ? "warn" : "pending",
            summary: surveyAnalysis
                ? `v4 信頼度 ${Math.round((surveyAnalysis.confidence || 0) * 100)}%`
                : base.estimate?.estimateNo ?? "未生成",
            href: `/business/projects/${projectId}/estimate`,
        },
        {
            id: "construction",
            title: "施工予定",
            status: base.constructionHistory.length > 0 ? "ok" : "pending",
            summary: base.tomsState,
            count: base.photos.construction.length,
            href: `/customer/${customerCode}/install/home`,
        },
        {
            id: "maintenance",
            title: "保守予定",
            status: pendingMaint.length > 0 ? "warn" : base.maintenance.length > 0 ? "ok" : "none",
            summary: pendingMaint.length > 0
                ? `点検予定 ${pendingMaint.length} 件`
                : `${base.maintenance.length} 保守記録`,
            count: pendingMaint.length,
            href: "/maintenance",
        },
        {
            id: "handover",
            title: "顧客引渡し",
            status: base.completionReport ? "ok" : base.tomsState === "completed" ? "warn" : "pending",
            summary: base.completionReport?.title ?? "引渡し準備中",
            href: `/customer/${customerCode}/handover`,
        },
    ];
    return {
        ...base,
        phase: "1121-1160",
        rcCards,
        unifiedTimeline: buildUnifiedTimeline({ projectId, limit: 50 }),
        surveyAnalysis,
    };
}
