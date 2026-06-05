import { buildProjectDashboard, type ProjectDashboardPayload } from "./project-dashboard.js";
import { listAssetQrHistory } from "../assets/asset-qr.js";
import { listMaintenanceSchedules } from "../maintenance/maintenance-schedule.js";
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

export function buildProjectDashboardRc(projectId: string): ProjectDashboardRcPayload | null {
  const base = buildProjectDashboard(projectId);
  if (!base) return null;

  const project = base.project!;
  const surveyAnalysis = project.surveyProjectId
    ? getLatestSurveyAnalysisV4(project.surveyProjectId)
    : null;

  const customerCode = project.customerId.startsWith("BCU-") ? "TOMS001" : project.customerId;
  const qrHistory = listAssetQrHistory({ customerCode, limit: 20 });
  const maintSchedules = listMaintenanceSchedules(customerCode);
  const pendingMaint = maintSchedules.filter((s) => s.status === "pending");

  const rcCards: ProjectDashboardRcCard[] = [
    {
      id: "survey",
      title: "現調",
      status: project.surveyProjectId ? (surveyAnalysis ? "ok" : "warn") : "none",
      summary: surveyAnalysis
        ? `AI v4: カメラ${surveyAnalysis.cameraCount} / ESP${surveyAnalysis.espCount}`
        : project.surveyProjectId
          ? "分析未実施"
          : "未紐付け",
      href: project.surveyProjectId ? `/survey` : undefined,
      count: base.photos.survey.length,
    },
    {
      id: "estimate",
      title: "見積",
      status: base.estimate ? "ok" : "pending",
      summary: base.estimate?.estimateNo ?? "未作成",
      href: `/business/projects/${projectId}/estimate`,
    },
    {
      id: "construction",
      title: "施工",
      status: base.constructionHistory.length > 0 ? "ok" : "pending",
      summary: base.tomsState,
      count: base.photos.construction.length,
    },
    {
      id: "photos",
      title: "写真",
      status: base.photos.survey.length + base.photos.construction.length > 0 ? "ok" : "none",
      summary: `現調 ${base.photos.survey.length} / 施工 ${base.photos.construction.length}`,
    },
    {
      id: "qr",
      title: "QR資産",
      status: qrHistory.length > 0 ? "ok" : "none",
      summary: `${qrHistory.length} 件のQR履歴`,
      count: qrHistory.length,
    },
    {
      id: "maintenance",
      title: "保守",
      status: pendingMaint.length > 0 ? "warn" : base.maintenance.length > 0 ? "ok" : "none",
      summary:
        pendingMaint.length > 0
          ? `点検予定 ${pendingMaint.length} 件`
          : `${base.maintenance.length} 保守記録`,
      count: pendingMaint.length,
    },
    {
      id: "notifications",
      title: "通知",
      status: base.notifications.some((n) => n.severity === "critical") ? "warn" : "ok",
      summary: `${base.notifications.length} 件`,
      count: base.notifications.length,
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
