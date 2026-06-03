import { getDatabase } from "../db/database.js";
import {
  getBusinessProject,
  getCompletionReport,
  getCustomer,
  getEstimate,
  getInvoice,
} from "../business/business-store.js";
import { listBusinessIntegrationLogs } from "../business/business-integration-log.js";
import { listDrawingPlans } from "../business/drawing-store.js";
import { listProjectTimeline } from "./project-timeline.js";
import { businessStatusToToms, getTomsWorkflowState, listWorkflowHistory } from "./workflow-engine.js";
import { listConstructionPhotos } from "./construction-photos.js";
import { listDrawingVersions } from "./drawing-versions.js";
import { listProjectAssets } from "./asset-master.js";
import { buildProjectFloorStack } from "./floor-stack-project.js";
import { listProjectLiveDevices } from "./realtime-devices.js";
import { listProjectNotifications } from "./project-notifications.js";
import { listProjectMaintenance } from "./maintenance-flow.js";
import { compareDrawingVersions } from "./drawing-diff.js";

export interface ProjectDashboardPayload {
  project: ReturnType<typeof getBusinessProject>;
  tomsState: string;
  customer: ReturnType<typeof getCustomer> | null;
  gps: { lat: number | null; lng: number | null };
  photos: { survey: unknown[]; construction: unknown[]; classified: unknown[] };
  drawings: { plans: unknown[]; versions: unknown[] };
  floorStack: ReturnType<typeof buildProjectFloorStack>;
  liveDevices: ReturnType<typeof listProjectLiveDevices>;
  estimate: ReturnType<typeof getEstimate> | null;
  invoice: ReturnType<typeof getInvoice> | null;
  payments: Array<{ amount: number; date: string; method: string }>;
  completionReport: ReturnType<typeof getCompletionReport> | null;
  constructionHistory: Array<{ status: string; updatedAt: string }>;
  maintenance: ReturnType<typeof listProjectMaintenance>;
  notifications: ReturnType<typeof listProjectNotifications>;
  proRemote: { status: string; href: string };
  logs: unknown[];
  timeline: ReturnType<typeof listProjectTimeline>;
  workflowHistory: ReturnType<typeof listWorkflowHistory>;
  assets: ReturnType<typeof listProjectAssets>;
  drawingDiff: ReturnType<typeof compareDrawingVersions>;
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

  const estimate = project.estimateId ? getEstimate(project.estimateId) : null;
  const invoice = project.invoiceId ? getInvoice(project.invoiceId) : null;
  const completionReport = project.completionReportId
    ? getCompletionReport(project.completionReportId)
    : null;

  const payments = getDatabase()
    .prepare(
      `SELECT amount, payment_date, memo FROM business_payments WHERE project_id = ? ORDER BY payment_date DESC`
    )
    .all(projectId) as Array<{ amount: number; payment_date: string; memo: string | null }>;

  const constructionHistory = getDatabase()
    .prepare(
      `SELECT to_state, created_at FROM toms_workflow_history
       WHERE project_id = ? AND to_state IN ('construction','completed')
       ORDER BY created_at ASC`
    )
    .all(projectId) as Array<{ to_state: string; created_at: string }>;

  const customerCode = project.customerId.startsWith("BCU-")
    ? "TOMS001"
    : project.customerId;

  const liveDevices = listProjectLiveDevices(projectId);
  const offlineCount = liveDevices.filter((d) => d.status === "OFFLINE").length;

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
    floorStack: buildProjectFloorStack(projectId),
    liveDevices,
    estimate,
    invoice,
    payments: payments.map((p) => ({
      amount: p.amount,
      date: p.payment_date,
      method: p.memo ?? "",
    })),
    completionReport,
    constructionHistory: constructionHistory.map((h) => ({
      status: h.to_state,
      updatedAt: h.created_at,
    })),
    maintenance: listProjectMaintenance(projectId),
    notifications: listProjectNotifications(projectId),
    proRemote: {
      status: offlineCount > 0 ? "WARNING" : "ONLINE",
      href: `/customer/${customerCode}/pro-remote`,
    },
    logs: listBusinessIntegrationLogs({ projectId, limit: 50 }),
    timeline: listProjectTimeline(projectId),
    workflowHistory: listWorkflowHistory(projectId),
    assets: listProjectAssets(projectId),
    drawingDiff: compareDrawingVersions(projectId),
    links: {
      business: `/business/projects/${projectId}`,
      survey: project.surveyProjectId ? `/survey` : null,
      drawing: `/business/projects/${projectId}/drawing`,
      proRemote: `/customer/${customerCode}/pro-remote`,
    },
  };
}
