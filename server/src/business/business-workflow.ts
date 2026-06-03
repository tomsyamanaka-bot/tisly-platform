import {
  getBusinessProject,
  getCompletionReport,
  getEstimate,
  getInvoice,
  saveCalendarDraft,
  saveMailDraft,
  saveQnapPlan,
  updateBusinessProject,
} from "./business-store.js";
import {
  assertTransition,
  normalizeProjectStatus,
  statusAfterClosed,
} from "./business-status.js";
import type { BusinessProject, BusinessProjectStatus } from "./business-types.js";
import {
  createConstructionCalendarDraft,
  createPaymentCalendarDraft,
  createSiteSurveyCalendarDraft,
} from "./services/googleCalendarService.js";
import {
  createCompletionMailDraft,
  createEstimateMailDraft,
  createInvoiceMailDraft,
} from "./services/gmailService.js";
import { logBusinessIntegration } from "./business-integration-log.js";
import { createQnapSavePlan, uploadBusinessToQnap } from "./services/qnapBusinessArchive.js";
import { recordWorkflowFromBusinessStatus } from "../toms/workflow-engine.js";
import { appendProjectTimeline, timelineTitleFor } from "../toms/project-timeline.js";

export interface StatusTransitionResult {
  project: BusinessProject;
  calendarDraft?: unknown;
  mailDraft?: unknown;
  qnapSave?: unknown;
}

function runSideEffects(
  project: BusinessProject,
  to: BusinessProjectStatus
): Omit<StatusTransitionResult, "project"> {
  const out: Omit<StatusTransitionResult, "project"> = {};
  const normalized = normalizeProjectStatus(to);

  if (normalized === "survey_scheduled") {
    const draft = createSiteSurveyCalendarDraft(project);
    saveCalendarDraft(draft);
    out.calendarDraft = draft;
  }
  if (normalized === "construction_scheduled") {
    const draft = createConstructionCalendarDraft(project);
    saveCalendarDraft(draft);
    out.calendarDraft = draft;
  }
  if (normalized === "invoice_sent" && project.paymentDueDate) {
    const draft = createPaymentCalendarDraft(project);
    saveCalendarDraft(draft);
    out.calendarDraft = draft;
  }

  if (normalized === "estimate_sent" && project.estimateId) {
    const estimate = getEstimate(project.estimateId);
    if (estimate) {
      const mail = createEstimateMailDraft(project, estimate);
      saveMailDraft(mail);
      out.mailDraft = mail;
    }
  }
  if (normalized === "completion_report_created" && project.completionReportId) {
    const report = getCompletionReport(project.completionReportId);
    if (report) {
      const mail = createCompletionMailDraft(project, report);
      saveMailDraft(mail);
      out.mailDraft = mail;
    }
  }
  if (normalized === "invoice_sent" && project.invoiceId) {
    const invoice = getInvoice(project.invoiceId);
    if (invoice) {
      const mail = createInvoiceMailDraft(project, invoice);
      saveMailDraft(mail);
      out.mailDraft = mail;
    }
  }

  if (
    ["estimate_created", "completion_report_created", "invoice_created", "paid"].includes(
      normalized
    )
  ) {
    const plan = createQnapSavePlan(project);
    saveQnapPlan(plan);
    out.qnapSave = uploadBusinessToQnap(project, plan);
  }

  return out;
}

export function transitionProjectStatus(
  projectId: string,
  to: BusinessProjectStatus | string
): StatusTransitionResult {
  const project = getBusinessProject(projectId);
  if (!project) throw new Error("project not found");
  const target = normalizeProjectStatus(String(to)) as BusinessProjectStatus;
  assertTransition(project.status, target);
  const updated = updateBusinessProject(projectId, { status: target });
  recordWorkflowFromBusinessStatus(projectId, project.status, target);
  const timelineMap: Partial<Record<typeof target, string>> = {
    survey_done: "survey",
    estimate_sent: "estimate_sent",
    construction_scheduled: "construction_start",
    construction_done: "construction_complete",
    completion_report_created: "completion_report",
    invoice_sent: "invoice",
    paid: "payment",
  };
  const tl = timelineMap[target];
  if (tl) {
    appendProjectTimeline({
      projectId,
      eventType: tl,
      title: timelineTitleFor(tl),
      actor: "business_workflow",
    });
  }
  const side = runSideEffects(updated, target);
  logBusinessIntegration({
    projectId,
    type: "status_flow",
    provider: "workflow",
    status: "success",
    request: { from: project.status, to: target },
    response: side,
  });
  return { project: updated, ...side };
}

export function closeProject(projectId: string): BusinessProject {
  return transitionProjectStatus(projectId, statusAfterClosed()).project;
}
