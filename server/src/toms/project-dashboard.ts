import { getDatabase } from "../db/database.js";
import {
  getBusinessProject,
  getCompletionReport,
  getCustomer,
  getEstimate,
  getInvoice,
} from "../business/business-store.js";
import { listBusinessIntegrationLogs } from "../business/business-integration-log.js";
import { collectBusinessAlerts } from "../business/business-notifications.js";
import { listDrawingPlans } from "../business/drawing-store.js";
import { listProjectTimeline } from "./project-timeline.js";
import { businessStatusToToms, getTomsWorkflowState, listWorkflowHistory } from "./workflow-engine.js";
import { listConstructionPhotos } from "./construction-photos.js";
import { listDrawingVersions } from "./drawing-versions.js";
import { listProjectAssets } from "./asset-master.js";

export interface ProjectDashboardPayload {
  project: ReturnType<typeof getBusinessProject>;
  tomsState: string;
  customer: ReturnType<typeof getCustomer> | null;
  gps: { lat: number | null; lng: number | null };
  photos: { survey: unknown[]; construction: unknown[]; classified: unknown[] };
  drawings: { plans: unknown[]; versions: unknown[] };
  estimate: ReturnType<typeof getEstimate> | null;
  invoice: ReturnType<typeof getInvoice> | null;
  completionReport: ReturnType<typeof getCompletionReport> | null;
  maintenance: { openCases: number; cases: unknown[] };
  notifications: ReturnType<typeof collectBusinessAlerts>;
  logs: unknown[];
  timeline: ReturnType<typeof listProjectTimeline>;
  workflowHistory: ReturnType<typeof listWorkflowHistory>;
  assets: ReturnType<typeof listProjectAssets>;
  links: {
    business: string;
    survey: string | null;
    drawing: string;
    proRemote: string;
  };
}

export function buildProjectDashboard(projectId: string): ProjectDashboardPayload | null {
  const project = getBusinessProject(projectId);
  if (!project) return null;

  const customer = getCustomer(project.customerId);
  let gps = { lat: null as number | null, lng: null as number | null };
  if (project.surveyProjectId) {
    const sp = getDatabase()
      .prepare(`SELECT gps_lat, gps_lng FROM survey_projects WHERE project_id = ?`)
      .get(project.surveyProjectId) as { gps_lat: number | null; gps_lng: number | null } | undefined;
    if (sp) {
      gps = { lat: sp.gps_lat, lng: sp.gps_lng };
    }
  }

  const maintRows = getDatabase()
    .prepare(
      `SELECT * FROM maintenance_cases
       WHERE customer_code = ? AND (site_name LIKE ? OR notes LIKE ?)
       ORDER BY updated_at DESC LIMIT 20`
    )
    .all(
      project.customerId.replace(/^BCU-/, "").slice(0, 8) || "TOMS",
      `%${project.title.slice(0, 8)}%`,
      `%${projectId}%`
    ) as unknown[];

  const openCases = (
    getDatabase()
      .prepare(
        `SELECT COUNT(*) as c FROM maintenance_cases
         WHERE status IN ('open','in_progress') AND notes LIKE ?`
      )
      .get(`%${projectId}%`) as { c: number }
  ).c;

  const estimate = project.estimateId ? getEstimate(project.estimateId) : null;
  const invoice = project.invoiceId ? getInvoice(project.invoiceId) : null;
  const completionReport = project.completionReportId
    ? getCompletionReport(project.completionReportId)
    : null;

  const customerCode = project.customerId.startsWith("BCU-")
    ? "TOMS001"
    : project.customerId;

  return {
    project,
    tomsState: getTomsWorkflowState(projectId) ?? businessStatusToToms(project.status),
    customer,
    gps,
    photos: {
      survey: project.surveyPhotos,
      construction: project.constructionPhotos,
      classified: listConstructionPhotos(projectId),
    },
    drawings: {
      plans: listDrawingPlans(projectId),
      versions: listDrawingVersions(projectId),
    },
    estimate,
    invoice,
    completionReport,
    maintenance: { openCases, cases: maintRows },
    notifications: collectBusinessAlerts().filter((a) => a.href.includes(projectId) || true),
    logs: listBusinessIntegrationLogs({ projectId, limit: 50 }),
    timeline: listProjectTimeline(projectId),
    workflowHistory: listWorkflowHistory(projectId),
    assets: listProjectAssets(projectId),
    links: {
      business: `/business/projects/${projectId}`,
      survey: project.surveyProjectId ? `/survey` : null,
      drawing: `/business/projects/${projectId}/drawing`,
      proRemote: `/customer/${customerCode}/pro-remote`,
    },
  };
}
