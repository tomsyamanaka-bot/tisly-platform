import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import { getNextAction } from "../../business/business-status.js";
import {
  buildEstimateDraftFromAi,
  countProjectsByStatus,
  createBusinessProject,
  createCompletionReport,
  createCustomer,
  createEstimate,
  createInvoiceFromEstimate,
  getBusinessProject,
  getCompletionReport,
  getCustomer,
  getEstimate,
  getInvoice,
  getLatestAiCandidate,
  getQnapPlan,
  listBusinessProjects,
  listCalendarDrafts,
  listCustomers,
  listMailDrafts,
  listPricingTiers,
  markAccepted,
  markConstructionDone,
  markPaid,
  markSurveyDone,
  saveAiCandidate,
  saveBusinessPhoto,
  saveCalendarDraft,
  saveMailDraft,
  saveQnapPlan,
  setConstructionSchedule,
  setPaymentDue,
  setSurveySchedule,
  setCompletionReportPdfPath,
  setEstimatePdfPath,
  setInvoicePdfPath,
  updateBusinessProject,
} from "../../business/business-store.js";
import { createBusinessProjectFromSurveyProject } from "../../business/services/businessFromSurveyService.js";
import {
  createConstructionCalendarDraft,
  createPaymentCalendarDraft,
  createSurveyCalendarDraft,
} from "../../business/services/googleCalendarService.js";
import {
  createEstimateMailDraft,
  createInvoiceAndReportMailDraft,
} from "../../business/services/gmailService.js";
import {
  generateCompletionReportPdf,
  generateEstimatePdf,
  generateInvoicePdf,
} from "../../business/services/pdfService.js";
import { createQnapSavePlan } from "../../business/services/qnapService.js";
import { createAiEstimatePlaceholder, getLatestAiEstimate } from "../../survey/survey-store.js";
import type { EstimateLineItem } from "../../business/business-types.js";
import { statusAfterEstimateMail, statusAfterInvoiceSent } from "../../business/business-status.js";

export const businessRouter = Router();

const businessAuth = [requireAuth("manager")] as const;

function assertBusinessRole(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (
    !roleMeetsRequirement(role, "manager") &&
    !["owner", "admin", "super_admin", "surveyor"].includes(role)
  ) {
    res.status(403).json({ error: "Business PWA access required" });
    return false;
  }
  return true;
}

function projectPayload(id: string) {
  const project = getBusinessProject(id);
  if (!project) return null;
  return {
    project,
    nextAction: getNextAction(project),
    calendarDrafts: listCalendarDrafts(id),
    mailDrafts: listMailDrafts(id),
    qnapPlan: getQnapPlan(id),
    aiCandidate: getLatestAiCandidate(id),
  };
}

businessRouter.get("/projects", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  res.json({ projects: listBusinessProjects() });
});

businessRouter.post("/projects", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const body = req.body as {
    customerId?: string;
    customerName?: string;
    title?: string;
    address?: string;
    phone?: string;
  };
  if (!body.customerId || !body.customerName || !body.title) {
    res.status(400).json({ error: "customerId, customerName, title required" });
    return;
  }
  const project = createBusinessProject({
    customerId: body.customerId,
    customerName: body.customerName,
    title: body.title,
    address: body.address,
    phone: body.phone,
  });
  const plan = createQnapSavePlan(project);
  saveQnapPlan(plan);
  res.status(201).json(projectPayload(project.id));
});

businessRouter.get("/projects/:projectId", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const payload = projectPayload(String(req.params.projectId));
  if (!payload) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(payload);
});

businessRouter.patch("/projects/:projectId", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  try {
    const project = updateBusinessProject(String(req.params.projectId), req.body);
    res.json(projectPayload(project.id));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

businessRouter.post("/projects/:projectId/survey-schedule", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const project = setSurveySchedule(String(req.params.projectId), req.body);
  const draft = createSurveyCalendarDraft(project);
  saveCalendarDraft(draft);
  res.json({ project, calendarDraft: draft });
});

businessRouter.post("/projects/:projectId/survey-done", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const body = req.body as { memo?: string };
  res.json({ project: markSurveyDone(String(req.params.projectId), body.memo) });
});

businessRouter.post("/projects/:projectId/survey-photo", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const body = req.body as { imageBase64?: string; fileName?: string };
  if (!body.imageBase64) {
    res.status(400).json({ error: "imageBase64 required" });
    return;
  }
  const photo = saveBusinessPhoto(
    String(req.params.projectId),
    "survey",
    body.imageBase64,
    body.fileName ?? "photo.jpg"
  );
  res.json({ photo, project: getBusinessProject(String(req.params.projectId)) });
});

businessRouter.post("/projects/:projectId/construction-schedule", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const body = req.body as {
    date?: string;
    startTime?: string;
    endTime?: string;
    requiredMaterials?: string;
    memo?: string;
  };
  const project = setConstructionSchedule(
    String(req.params.projectId),
    body,
    body.requiredMaterials,
    body.memo
  );
  const draft = createConstructionCalendarDraft(project);
  saveCalendarDraft(draft);
  res.json({ project, calendarDraft: draft });
});

businessRouter.post("/projects/:projectId/construction-done", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  res.json({ project: markConstructionDone(String(req.params.projectId)) });
});

businessRouter.post("/projects/:projectId/construction-photo", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const body = req.body as { imageBase64?: string; fileName?: string };
  if (!body.imageBase64) {
    res.status(400).json({ error: "imageBase64 required" });
    return;
  }
  const photo = saveBusinessPhoto(
    String(req.params.projectId),
    "construction",
    body.imageBase64,
    body.fileName ?? "photo.jpg"
  );
  res.json({ photo });
});

businessRouter.post("/projects/:projectId/accepted", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  res.json({ project: markAccepted(String(req.params.projectId)) });
});

businessRouter.post("/projects/:projectId/payment-due", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const body = req.body as { paymentDueDate?: string };
  if (!body.paymentDueDate) {
    res.status(400).json({ error: "paymentDueDate required" });
    return;
  }
  const project = setPaymentDue(String(req.params.projectId), body.paymentDueDate);
  const draft = createPaymentCalendarDraft(project);
  saveCalendarDraft(draft);
  res.json({ project, calendarDraft: draft });
});

businessRouter.post("/projects/:projectId/paid", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const body = req.body as { paidDate?: string };
  res.json({ project: markPaid(String(req.params.projectId), body.paidDate) });
});

businessRouter.get("/customers", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  res.json({ customers: listCustomers() });
});

businessRouter.post("/customers", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  res.status(201).json({ customer: createCustomer(req.body) });
});

businessRouter.get("/customers/:customerId", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const customer = getCustomer(String(req.params.customerId));
  if (!customer) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ customer });
});

businessRouter.get("/pricing", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  res.json({ tiers: listPricingTiers() });
});

businessRouter.post("/projects/:projectId/ai-candidate", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const projectId = String(req.params.projectId);
  const project = getBusinessProject(projectId);
  if (!project) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (project.surveyProjectId) {
    createAiEstimatePlaceholder(project.surveyProjectId);
    const ai = getLatestAiEstimate(project.surveyProjectId);
    if (ai?.recommended) {
      const candidate = saveAiCandidate(projectId, ai.recommended as Record<string, unknown>);
      return res.json({ candidate, draftLines: buildEstimateDraftFromAi(projectId) });
    }
  }
  const body = req.body as { recommended?: Record<string, unknown> };
  const recommended = body.recommended ?? { placeholder: true, phase: "521-540" };
  const candidate = saveAiCandidate(projectId, recommended, "manual");
  res.json({ candidate });
});

businessRouter.get("/projects/:projectId/ai-candidate/draft-lines", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  try {
    res.json({ lines: buildEstimateDraftFromAi(String(req.params.projectId)) });
  } catch (e) {
    res.status(404).json({ error: (e as Error).message });
  }
});

businessRouter.post("/projects/:projectId/estimate", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const body = req.body as { items?: unknown[]; fromAi?: boolean };
  const estimate = createEstimate(
    String(req.params.projectId),
    (body.items ?? []) as EstimateLineItem[],
    { fromAi: body.fromAi }
  );
  const project = getBusinessProject(String(req.params.projectId))!;
  const pdfPath = generateEstimatePdf(project, estimate);
  setEstimatePdfPath(estimate.id, pdfPath);
  res.status(201).json({ estimate: getEstimate(estimate.id), pdfPath });
});

businessRouter.get("/projects/:projectId/estimate", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const project = getBusinessProject(String(req.params.projectId));
  if (!project?.estimateId) {
    res.status(404).json({ error: "No estimate" });
    return;
  }
  res.json({ estimate: getEstimate(project.estimateId) });
});

businessRouter.post("/projects/:projectId/estimate-mail", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const projectId = String(req.params.projectId);
  const project = getBusinessProject(projectId);
  if (!project?.estimateId) {
    res.status(400).json({ error: "estimate required" });
    return;
  }
  const estimate = getEstimate(project.estimateId)!;
  const mail = createEstimateMailDraft(project, estimate);
  saveMailDraft(mail);
  updateBusinessProject(projectId, { status: statusAfterEstimateMail() });
  res.json({ mail });
});

businessRouter.post("/projects/:projectId/invoice", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const body = req.body as { paymentDueDate?: string };
  const invoice = createInvoiceFromEstimate(String(req.params.projectId), body.paymentDueDate);
  const project = getBusinessProject(String(req.params.projectId))!;
  const pdfPath = generateInvoicePdf(project, invoice);
  setInvoicePdfPath(invoice.id, pdfPath);
  res.json({ invoice: getInvoice(invoice.id), pdfPath });
});

businessRouter.post("/projects/:projectId/completion-report", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const report = createCompletionReport(String(req.params.projectId), req.body);
  const project = getBusinessProject(String(req.params.projectId))!;
  const pdfPath = generateCompletionReportPdf(project, report);
  setCompletionReportPdfPath(report.id, pdfPath);
  res.json({ report: getCompletionReport(report.id), pdfPath });
});

businessRouter.post("/projects/:projectId/invoice-mail", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const projectId = String(req.params.projectId);
  const project = getBusinessProject(projectId);
  if (!project?.invoiceId || !project.completionReportId) {
    res.status(400).json({ error: "invoice and completion report required" });
    return;
  }
  const invoice = getInvoice(project.invoiceId)!;
  const report = getCompletionReport(project.completionReportId)!;
  const mail = createInvoiceAndReportMailDraft(project, invoice, report);
  saveMailDraft(mail);
  updateBusinessProject(projectId, { status: statusAfterInvoiceSent() });
  res.json({ mail });
});

businessRouter.post("/projects/:projectId/calendar/:type", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const project = getBusinessProject(String(req.params.projectId));
  if (!project) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const type = String(req.params.type);
  let draft;
  if (type === "survey") draft = createSurveyCalendarDraft(project);
  else if (type === "construction") draft = createConstructionCalendarDraft(project);
  else if (type === "payment") draft = createPaymentCalendarDraft(project);
  else {
    res.status(400).json({ error: "type must be survey|construction|payment" });
    return;
  }
  saveCalendarDraft(draft);
  res.json({ calendarDraft: draft });
});

businessRouter.post("/projects/:projectId/qnap-plan", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const project = getBusinessProject(String(req.params.projectId));
  if (!project) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const plan = createQnapSavePlan(project);
  saveQnapPlan(plan);
  res.json({ qnapPlan: plan });
});

businessRouter.post("/from-survey/:surveyProjectId", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  try {
    const project = createBusinessProjectFromSurveyProject(String(req.params.surveyProjectId));
    const plan = createQnapSavePlan(project);
    saveQnapPlan(plan);
    res.status(201).json(projectPayload(project.id));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

businessRouter.get("/hub-counts", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  res.json({
    newProjects: countProjectsByStatus(["new"]),
    surveyScheduled: countProjectsByStatus(["survey_scheduled"]),
    estimatePending: countProjectsByStatus(["survey_done"]),
    constructionScheduled: countProjectsByStatus(["construction_scheduled", "accepted"]),
    invoicePending: countProjectsByStatus([
      "construction_done",
      "completion_report_created",
      "invoice_created",
    ]),
    paymentPending: countProjectsByStatus(["payment_scheduled", "invoice_sent_to_owner"]),
  });
});

businessRouter.get("/settings", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  res.json({
    googleCalendar: { connected: false, phase: "541+ 予定" },
    gmail: { connected: false, defaultTo: "toms.yamanaka@gmail.com", phase: "541+ 予定" },
    qnap: { connected: false, baseRoot: "/TOMS/案件/", phase: "541+ 予定" },
  });
});
