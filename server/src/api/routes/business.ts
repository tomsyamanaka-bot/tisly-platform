import fs from "fs";
import path from "path";
import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import { getNextAction } from "../../business/business-status.js";
import { transitionProjectStatus } from "../../business/business-workflow.js";
import {
  createPricingRule,
  deletePricingRule,
  listPricingRules,
  updatePricingRule,
} from "../../business/business-pricing.js";
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
  getMailDraftById,
  updateMailDraftStatus,
  getQnapPlan,
  listBusinessProjects,
  listCalendarDrafts,
  listCustomers,
  listMailDrafts,
  listPricingTiers,
  listTodaySchedules,
  markAccepted,
  markConstructionDone,
  markPaid,
  markSurveyDone,
  saveAiCandidate,
  saveBusinessPhoto,
  businessUploadsDir,
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
  createSiteSurveyCalendarDraft,
} from "../../business/services/googleCalendarService.js";
import {
  createCompletionMailDraft,
  createEstimateMailDraft,
  createInvoiceAndReportMailDraft,
  createInvoiceMailDraft,
} from "../../business/services/gmailService.js";
import {
  generateCompletionReportPdf,
  generateEstimatePdf,
  generateInvoicePdf,
  getCompletionReportPdfOrPlaceholder,
  getEstimatePdfOrPlaceholder,
  getInvoicePdfOrPlaceholder,
} from "../../business/services/pdfService.js";
import {
  createQnapSavePlan,
  uploadBusinessToQnap,
  uploadBusinessToQnapReal,
  testQnapWebDavConnection,
  getQnapUploadConfig,
  getQnapProjectUploadStatus,
} from "../../business/services/qnapBusinessArchive.js";
import { getGoogleCalendarProvider } from "../../business/services/googleCalendarService.js";
import { getGmailProvider } from "../../business/services/gmailService.js";
import {
  getGoogleAuthUrl,
  getGoogleOAuthStatus,
  handleGoogleOAuthCallback,
  testGoogleOAuthConnection,
  createGoogleCalendarEvent,
  createGmailDraft,
  sendGmailPlaceholder,
} from "../../services/googleOAuthService.js";
import {
  logBusinessIntegration,
  listBusinessIntegrationLogs,
  exportIntegrationLogsCsv,
  purgeIntegrationLogsOlderThan,
} from "../../business/business-integration-log.js";
import {
  assertRealSendAllowed,
  saveBusinessRealSendSettings,
} from "../../business/business-real-send-guard.js";
import {
  collectBusinessAlerts,
  sendBusinessMockNotifications,
} from "../../business/business-notifications.js";
import { getBusinessSettingsPayload } from "../../business/business-settings.js";
import {
  exportPricingRulesCsv,
  importPricingRulesCsv,
  previewPricingRulesCsv,
} from "../../business/business-pricing-csv.js";
import {
  buildAccountingExportCsv,
  buildAccountingExportByFormat,
  createBusinessPayment,
  listBusinessPayments,
} from "../../business/business-payments.js";
import { processBusinessOfflineSync } from "../../business/business-offline-sync.js";
import { renderBusinessPdf, getRenderedHtmlPath } from "../../business/pdf/render.js";
import { renderEstimateHtml } from "../../business/pdf/estimate-template.js";
import { renderInvoiceHtml } from "../../business/pdf/invoice-template.js";
import { renderCompletionReportHtml } from "../../business/pdf/completion-report-template.js";
import type { PricingScopeType } from "../../business/business-types.js";
import { createAiEstimatePlaceholder, getLatestAiEstimate } from "../../survey/survey-store.js";
import type { EstimateLineItem } from "../../business/business-types.js";
import { statusAfterEstimateMail, statusAfterInvoiceSent } from "../../business/business-status.js";
import {
  createDrawingPlan,
  getDrawingPlan,
  listDrawingPlans,
  listDrawingSymbols,
  listSpecificationDocuments,
  saveSpecificationDocument,
  updateDrawingPlan,
  countDrawingPlansInProgress,
  countProjectsWithoutSpecification,
  countDrawingEstimateNotApplied,
} from "../../business/drawing-store.js";
import { createEstimateCandidateFromDrawingPlan } from "../../business/services/estimateFromDrawingService.js";
import {
  createSpecificationDocumentFromPlan,
  generateSpecificationPdf,
} from "../../business/services/specificationPdfService.js";
import {
  getGmailSendMode,
  previewGmailRealSend,
  sendGmailRealWithDraft,
} from "../../business/services/gmailRealSend.js";
import {
  createQnapProjectFolders,
  uploadQnapFileReal,
} from "../../business/services/qnapProjectFolders.js";
import { generateQnapSpecificationFilePath } from "../../business/services/qnapService.js";

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
  const drawingPlans = listDrawingPlans(id);
  return {
    project,
    nextAction: getNextAction(project),
    calendarDrafts: listCalendarDrafts(id),
    mailDrafts: listMailDrafts(id),
    qnapPlan: getQnapPlan(id),
    aiCandidate: getLatestAiCandidate(id),
    drawingPlans,
    specifications: listSpecificationDocuments(id),
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
  const draft = createSiteSurveyCalendarDraft(project);
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
  res.json({ rules: listPricingRules(), tiers: listPricingTiers() });
});

businessRouter.post("/pricing", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const body = req.body as {
    scopeType?: PricingScopeType;
    scopeRef?: string | null;
    workCategory?: string;
    name?: string;
    unit?: string;
    unitPrice?: number;
    costPrice?: number;
    taxType?: string;
    memo?: string;
    active?: boolean;
  };
  if (!body.scopeType || !body.name || body.unitPrice == null) {
    res.status(400).json({ error: "scopeType, name, unitPrice required" });
    return;
  }
  try {
    const rule = createPricingRule({
      scopeType: body.scopeType,
      scopeRef: body.scopeRef,
      workCategory: body.workCategory,
      name: body.name,
      unit: body.unit,
      unitPrice: Number(body.unitPrice),
      costPrice: body.costPrice != null ? Number(body.costPrice) : undefined,
      taxType: body.taxType,
      memo: body.memo,
      active: body.active,
    });
    res.status(201).json({ rule });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

businessRouter.patch("/pricing/:id", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  try {
    const rule = updatePricingRule(String(req.params.id), req.body);
    res.json({ rule });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

businessRouter.delete("/pricing/:id", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  try {
    deletePricingRule(String(req.params.id));
    res.status(204).send();
  } catch (e) {
    res.status(404).json({ error: (e as Error).message });
  }
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

function calendarRouteHandler(kind: "site-survey" | "construction" | "payment") {
  return (req: AuthedRequest, res: Response) => {
    if (!assertBusinessRole(req, res)) return;
    const project = getBusinessProject(String(req.params.projectId));
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const body = req.body as { date?: string; startTime?: string; endTime?: string; memo?: string };
    let updated = project;
    if (kind === "site-survey" && body.date) {
      updated = setSurveySchedule(project.id, {
        date: body.date,
        startTime: body.startTime,
        endTime: body.endTime,
        memo: body.memo,
      });
    } else if (kind === "construction" && body.date) {
      updated = setConstructionSchedule(
        project.id,
        { date: body.date, startTime: body.startTime, endTime: body.endTime },
        undefined,
        body.memo
      );
    } else if (kind === "payment" && body.date) {
      updated = setPaymentDue(project.id, body.date);
    }
    const draft =
      kind === "site-survey"
        ? createSiteSurveyCalendarDraft(updated)
        : kind === "construction"
          ? createConstructionCalendarDraft(updated)
          : createPaymentCalendarDraft(updated);
    saveCalendarDraft(draft);
    res.json({ project: updated, calendarDraft: draft });
  };
}

businessRouter.post(
  "/projects/:projectId/calendar/site-survey",
  ...businessAuth,
  calendarRouteHandler("site-survey")
);
businessRouter.post(
  "/projects/:projectId/calendar/construction",
  ...businessAuth,
  calendarRouteHandler("construction")
);
businessRouter.post(
  "/projects/:projectId/calendar/payment",
  ...businessAuth,
  calendarRouteHandler("payment")
);

businessRouter.post("/projects/:projectId/calendar/:type", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const type = String(req.params.type);
  if (type === "site-survey" || type === "construction" || type === "payment") {
    res.status(400).json({
      error: "use dedicated endpoints: calendar/site-survey, calendar/construction, calendar/payment",
    });
    return;
  }
  const project = getBusinessProject(String(req.params.projectId));
  if (!project) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  let draft;
  if (type === "survey") draft = createSiteSurveyCalendarDraft(project);
  else {
    res.status(400).json({ error: "type must be survey" });
    return;
  }
  saveCalendarDraft(draft);
  res.json({ calendarDraft: draft });
});

businessRouter.post(
  "/projects/:projectId/mail/estimate-ready",
  ...businessAuth,
  mailRouteHandler("estimate")
);
businessRouter.post(
  "/projects/:projectId/mail/completion-ready",
  ...businessAuth,
  mailRouteHandler("completion")
);
businessRouter.post(
  "/projects/:projectId/mail/invoice-ready",
  ...businessAuth,
  mailRouteHandler("invoice")
);

function mailRouteHandler(kind: "estimate" | "completion" | "invoice") {
  return (req: AuthedRequest, res: Response) => {
    if (!assertBusinessRole(req, res)) return;
    const projectId = String(req.params.projectId);
    const project = getBusinessProject(projectId);
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    let mail;
    if (kind === "estimate") {
      if (!project.estimateId) {
        res.status(400).json({ error: "estimate required" });
        return;
      }
      mail = createEstimateMailDraft(project, getEstimate(project.estimateId)!);
      updateBusinessProject(projectId, { status: statusAfterEstimateMail() });
    } else if (kind === "completion") {
      if (!project.completionReportId) {
        res.status(400).json({ error: "completion report required" });
        return;
      }
      mail = createCompletionMailDraft(project, getCompletionReport(project.completionReportId)!);
    } else {
      if (!project.invoiceId) {
        res.status(400).json({ error: "invoice required" });
        return;
      }
      mail = createInvoiceMailDraft(project, getInvoice(project.invoiceId)!);
      updateBusinessProject(projectId, { status: statusAfterInvoiceSent() });
    }
    saveMailDraft(mail);
    res.json({ mail });
  };
}

businessRouter.post("/projects/:projectId/qnap/save", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const project = getBusinessProject(String(req.params.projectId));
  if (!project) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const plan = createQnapSavePlan(project);
  saveQnapPlan(plan);
  const result = uploadBusinessToQnap(project, plan);
  res.json({ qnapPlan: plan, saveResult: result });
});

businessRouter.post(
  "/projects/:projectId/qnap/upload",
  ...businessAuth,
  (req: AuthedRequest, res) => {
    if (!assertBusinessRole(req, res)) return;
    const project = getBusinessProject(String(req.params.projectId));
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const plan = getQnapPlan(project.id) ?? createQnapSavePlan(project);
    saveQnapPlan(plan);
    const result = uploadBusinessToQnap(project, plan);
    res.json({ qnapPlan: plan, upload: result });
  }
);

businessRouter.get(
  "/projects/:projectId/qnap/status",
  ...businessAuth,
  (req: AuthedRequest, res) => {
    if (!assertBusinessRole(req, res)) return;
    const project = getBusinessProject(String(req.params.projectId));
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const plan = getQnapPlan(project.id);
    res.json(getQnapProjectUploadStatus(project, plan));
  }
);

businessRouter.get("/projects/:projectId/estimate.pdf", ...businessAuth, servePdf("estimate"));
businessRouter.get("/projects/:projectId/invoice.pdf", ...businessAuth, servePdf("invoice"));
businessRouter.get(
  "/projects/:projectId/completion-report.pdf",
  ...businessAuth,
  servePdf("completion_report")
);

function servePdf(kind: "estimate" | "invoice" | "completion_report") {
  return (req: AuthedRequest, res: Response) => {
    if (!assertBusinessRole(req, res)) return;
    const project = getBusinessProject(String(req.params.projectId));
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    try {
      if (kind === "estimate") {
        if (!project.estimateId) throw new Error("No estimate");
        const est = getEstimate(project.estimateId)!;
        const { contentType, path: filePath } = getEstimatePdfOrPlaceholder(project, est);
        res.type(contentType);
        return res.send(fs.readFileSync(filePath));
      }
      if (kind === "invoice") {
        if (!project.invoiceId) throw new Error("No invoice");
        const inv = getInvoice(project.invoiceId)!;
        const { contentType, path: filePath } = getInvoicePdfOrPlaceholder(project, inv);
        res.type(contentType);
        return res.send(fs.readFileSync(filePath));
      }
      if (!project.completionReportId) throw new Error("No completion report");
      const rep = getCompletionReport(project.completionReportId)!;
      const { contentType, path: filePath } = getCompletionReportPdfOrPlaceholder(project, rep);
      res.type(contentType);
      return res.send(fs.readFileSync(filePath));
    } catch (e) {
      res.status(404).json({ error: (e as Error).message });
    }
  };
}

businessRouter.post("/projects/:projectId/status", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const body = req.body as { status?: string };
  if (!body.status) {
    res.status(400).json({ error: "status required" });
    return;
  }
  try {
    const result = transitionProjectStatus(String(req.params.projectId), body.status);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
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
  const today = new Date().toISOString().slice(0, 10);
  const schedules = listTodaySchedules(today);
  const google = getGoogleOAuthStatus();
  const settings = getBusinessSettingsPayload();
  const recentLogs = listBusinessIntegrationLogs({ limit: 20 });
  const pdfOk = recentLogs.filter((l) => l.type === "pdf" && l.status === "success").length;
  const qnapOk = recentLogs.filter((l) => l.type === "qnap" && l.status === "success").length;
  res.json({
    todaySchedules: schedules,
    todaySurvey: schedules.filter((t) => t.kind === "site_survey").length,
    todayConstruction: schedules.filter((t) => t.kind === "construction").length,
    newProjects: countProjectsByStatus(["new"]),
    surveyScheduled: countProjectsByStatus(["survey_scheduled"]),
    estimatePending: countProjectsByStatus(["survey_done"]),
    constructionScheduled: countProjectsByStatus(["construction_scheduled"]),
    invoicePending: countProjectsByStatus([
      "construction_done",
      "completion_report_created",
      "invoice_created",
    ]),
    paymentPending: countProjectsByStatus(["invoice_sent", "invoice_sent_to_owner"]),
    googleStatus: google,
    gmailStatus: settings.gmail,
    qnapStatus: settings.qnap,
    pdfStatus: { mode: settings.pdf.mode, recentSuccess: pdfOk },
    qnapRecentSuccess: qnapOk,
    offlineQueueHint: "client localStorage",
    drawingInProgress: countDrawingPlansInProgress(),
    specificationPending: countProjectsWithoutSpecification(),
    drawingEstimatePending: countDrawingEstimateNotApplied(),
  });
});

businessRouter.get("/settings", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const payload = getBusinessSettingsPayload();
  res.json({
    ...payload,
    googleCalendar: payload.googleCalendar,
    gmail: payload.gmail,
    qnap: payload.qnap,
    pdfTemplates: payload.pdf.templates,
    providers: {
      calendar: getGoogleCalendarProvider().constructor.name,
      gmail: getGmailProvider().constructor.name,
    },
  });
});

businessRouter.get("/google/status", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  res.json(getGoogleOAuthStatus());
});

businessRouter.get("/google/auth-url", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  res.json(getGoogleAuthUrl(String(req.query.state ?? "business")));
});

businessRouter.post("/google/callback", ...businessAuth, async (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const result = await handleGoogleOAuthCallback(req.body as { code?: string; error?: string });
  logBusinessIntegration({
    type: "gmail",
    provider: result.mode,
    status: result.ok ? "success" : "error",
    request: { op: "oauth_callback" },
    response: result,
    errorMessage: result.ok ? undefined : result.message,
  });
  res.json(result);
});

businessRouter.post("/google/test", ...businessAuth, async (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const result = await testGoogleOAuthConnection();
  logBusinessIntegration({
    type: "calendar",
    provider: result.mode,
    status: result.ok ? "success" : "skipped",
    request: { op: "test" },
    response: result,
  });
  res.json(result);
});

businessRouter.post("/google/calendar/create", ...businessAuth, async (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const body = req.body as {
    projectId?: string;
    title?: string;
    start?: string;
    end?: string;
    location?: string;
    description?: string;
    confirmed?: boolean;
  };
  const cfg = getGoogleOAuthStatus();
  const guard = assertRealSendAllowed("calendar_create", {
    confirmed: body.confirmed,
    mode: cfg.mode,
  });
  if (!guard.allowed && cfg.mode === "real") {
    res.status(403).json({ error: guard.reason, dryRun: guard.dryRun });
    return;
  }
  if (!body.title || !body.start || !body.end) {
    res.status(400).json({ error: "title, start, end required" });
    return;
  }
  try {
    const result = await createGoogleCalendarEvent({
      projectId: body.projectId,
      title: body.title,
      start: body.start,
      end: body.end,
      location: body.location,
      description: body.description,
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

businessRouter.post("/google/gmail/draft", ...businessAuth, async (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const body = req.body as {
    projectId?: string;
    to?: string;
    subject?: string;
    body?: string;
    confirmed?: boolean;
  };
  const cfg = getGoogleOAuthStatus();
  const guard = assertRealSendAllowed("gmail_send", {
    confirmed: body.confirmed,
    mode: cfg.mode,
  });
  if (!guard.allowed && cfg.mode === "real") {
    res.status(403).json({ error: guard.reason, dryRun: guard.dryRun });
    return;
  }
  if (!body.to || !body.subject || body.body == null) {
    res.status(400).json({ error: "to, subject, body required" });
    return;
  }
  try {
    const result = await createGmailDraft({
      projectId: body.projectId,
      to: body.to,
      subject: body.subject,
      body: body.body,
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

businessRouter.post("/google/gmail/send", ...businessAuth, async (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const body = req.body as {
    projectId?: string;
    to?: string;
    subject?: string;
    body?: string;
    confirmed?: boolean;
  };
  const cfg = getGoogleOAuthStatus();
  const guard = assertRealSendAllowed("gmail_send", {
    confirmed: body.confirmed,
    mode: cfg.mode,
  });
  if (!guard.allowed && cfg.mode === "real") {
    res.status(403).json({ error: guard.reason, dryRun: guard.dryRun });
    return;
  }
  if (!body.to || !body.subject || body.body == null) {
    res.status(400).json({ error: "to, subject, body required" });
    return;
  }
  const result = await sendGmailPlaceholder({
    projectId: body.projectId,
    to: body.to,
    subject: body.subject,
    body: body.body,
    confirmed: body.confirmed,
  });
  res.json(result);
});

businessRouter.post("/qnap/test-connection", ...businessAuth, async (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const body = req.body as { confirmed?: boolean; mode?: "mock" | "dryRun" | "real" };
  const cfg = getQnapUploadConfig();
  const mode = body.mode ?? (cfg.mode === "real" ? "real" : "mock");
  if (mode === "real") {
    const guard = assertRealSendAllowed("qnap_real_upload", {
      confirmed: body.confirmed,
      mode: "real",
    });
    if (!guard.allowed) {
      res.status(403).json({ error: guard.reason, dryRun: guard.dryRun });
      return;
    }
  }
  const result = await testQnapWebDavConnection();
  res.json({ ...result, mode });
});

businessRouter.post("/qnap/create-project-folders", ...businessAuth, async (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const body = req.body as {
    projectId?: string;
    confirmed?: boolean;
    mode?: "mock" | "dryRun" | "real";
  };
  if (!body.projectId) {
    res.status(400).json({ error: "projectId required" });
    return;
  }
  const project = getBusinessProject(body.projectId);
  if (!project) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const mode = body.mode ?? (getQnapUploadConfig().mode === "real" ? "real" : "mock");
  if (mode === "real") {
    const guard = assertRealSendAllowed("qnap_real_upload", {
      confirmed: body.confirmed,
      mode: "real",
    });
    if (!guard.allowed) {
      res.status(403).json({ error: guard.reason, dryRun: guard.dryRun });
      return;
    }
  }
  try {
    const result = await createQnapProjectFolders(project, {
      mode,
      confirmed: body.confirmed,
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

businessRouter.post("/qnap/upload-file-real", ...businessAuth, async (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const body = req.body as {
    projectId?: string;
    localPath?: string;
    remotePath?: string;
    confirmed?: boolean;
    mode?: "mock" | "dryRun" | "real";
  };
  if (!body.projectId || !body.remotePath) {
    res.status(400).json({ error: "projectId and remotePath required" });
    return;
  }
  const project = getBusinessProject(body.projectId);
  if (!project) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const mode = body.mode ?? (getQnapUploadConfig().mode === "real" ? "real" : "mock");
  if (mode === "real") {
    const guard = assertRealSendAllowed("qnap_real_upload", {
      confirmed: body.confirmed,
      mode: "real",
    });
    if (!guard.allowed) {
      res.status(403).json({ error: guard.reason, dryRun: guard.dryRun });
      return;
    }
  }
  const localPath =
    body.localPath ??
    (project.estimateId
      ? (() => {
          const est = getEstimate(project.estimateId!);
          return est?.pdfPath
            ? path.join(process.cwd(), est.pdfPath.replace(/^\//, ""))
            : "";
        })()
      : "");
  if (!localPath) {
    res.status(400).json({ error: "localPath required or estimate pdf missing" });
    return;
  }
  const result = await uploadQnapFileReal({
    project,
    localPath,
    remotePath: body.remotePath,
    mode,
    confirmed: body.confirmed,
  });
  res.json(result);
});

businessRouter.post("/google/gmail/send-real", ...businessAuth, async (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const body = req.body as {
    projectId?: string;
    mailDraftId?: string;
    confirmed?: boolean;
    mode?: "mock" | "dryRun" | "real";
  };
  if (!body.projectId || !body.mailDraftId) {
    res.status(400).json({ error: "projectId and mailDraftId required" });
    return;
  }
  const draft = getMailDraftById(body.mailDraftId);
  if (!draft || draft.projectId !== body.projectId) {
    res.status(404).json({ error: "Mail draft not found" });
    return;
  }
  const mode = body.mode ?? getGmailSendMode();
  if (mode === "real") {
    const guard = assertRealSendAllowed("gmail_send", {
      confirmed: body.confirmed,
      mode: "real",
    });
    if (!guard.allowed) {
      res.status(403).json({ error: guard.reason, dryRun: guard.dryRun });
      return;
    }
    if (!body.confirmed) {
      res.status(403).json({ error: "confirmed=true required for real send" });
      return;
    }
  }
  const preview = previewGmailRealSend(draft);
  try {
    const result = await sendGmailRealWithDraft(draft, {
      mode,
      confirmed: body.confirmed,
      projectId: body.projectId,
    });
    if (result.status === "sent") {
      updateMailDraftStatus(body.mailDraftId, "sent");
    }
    res.json({ ...result, preview });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message, preview });
  }
});

businessRouter.post(
  "/projects/:projectId/qnap/upload-real",
  ...businessAuth,
  async (req: AuthedRequest, res) => {
    if (!assertBusinessRole(req, res)) return;
    const body = req.body as { confirmed?: boolean };
    const cfg = getQnapUploadConfig();
    const guard = assertRealSendAllowed("qnap_real_upload", {
      confirmed: body.confirmed,
      mode: cfg.mode,
    });
    if (!guard.allowed && cfg.mode === "real") {
      res.status(403).json({ error: guard.reason, dryRun: guard.dryRun });
      return;
    }
    const project = getBusinessProject(String(req.params.projectId));
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const plan = getQnapPlan(project.id) ?? createQnapSavePlan(project);
    saveQnapPlan(plan);
    const result = await uploadBusinessToQnapReal(project, plan);
    res.json({ qnapPlan: plan, upload: result });
  }
);

businessRouter.get("/integration-logs", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
  const type = req.query.type ? String(req.query.type) : undefined;
  res.json({
    logs: listBusinessIntegrationLogs({
      projectId,
      ...(type ? { type: type as import("../../business/business-integration-log.js").IntegrationLogType } : {}),
      limit: Number(req.query.limit ?? 100),
    }),
  });
});

businessRouter.get("/integration-logs/export-csv", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
  const csv = exportIntegrationLogsCsv({ projectId, limit: 500 });
  res.type("text/csv; charset=utf-8");
  res.send(csv);
});

businessRouter.delete("/integration-logs/purge", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const days = Number(req.query.days ?? 90);
  res.json(purgeIntegrationLogsOlderThan(days));
});

businessRouter.get("/notifications/alerts", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  res.json({ alerts: collectBusinessAlerts() });
});

businessRouter.post("/notifications/push-mock", ...businessAuth, async (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const body = req.body as { confirmed?: boolean };
  const guard = assertRealSendAllowed("web_push", { confirmed: body.confirmed, mode: "mock" });
  if (!guard.allowed && body.confirmed) {
    res.status(403).json({ error: guard.reason });
    return;
  }
  res.json(await sendBusinessMockNotifications());
});

businessRouter.patch("/settings/real-send", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const body = req.body as {
    dryRun?: boolean;
    mockOnly?: boolean;
    realSendEnabled?: boolean;
  };
  const saved = saveBusinessRealSendSettings(body);
  res.json(saved);
});

businessRouter.post("/pricing/preview-csv", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const body = req.body as { csv?: string };
  if (!body.csv) {
    res.status(400).json({ error: "csv required" });
    return;
  }
  res.json(previewPricingRulesCsv(body.csv));
});

businessRouter.post("/pricing/import-csv", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const body = req.body as { csv?: string; mode?: "append" | "replace" };
  if (!body.csv) {
    res.status(400).json({ error: "csv required" });
    return;
  }
  const mode = body.mode === "replace" ? "replace" : "append";
  const result = importPricingRulesCsv(body.csv, { mode });
  logBusinessIntegration({
    type: "status_flow",
    provider: "pricing_csv",
    status: result.errors.length ? "error" : "success",
    request: { bytes: body.csv.length },
    response: result,
  });
  res.json(result);
});

businessRouter.get("/pricing/export-csv", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const csv = exportPricingRulesCsv({
    customerCode: req.query.customer_code ? String(req.query.customer_code) : undefined,
    contractorCode: req.query.contractor_code ? String(req.query.contractor_code) : undefined,
  });
  res.type("text/csv; charset=utf-8");
  res.send(csv);
});

businessRouter.post("/projects/:projectId/payment", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const body = req.body as {
    amount?: number;
    paymentDate?: string;
    method?: string;
    memo?: string;
    invoiceId?: string;
  };
  if (body.amount == null || !body.paymentDate) {
    res.status(400).json({ error: "amount and paymentDate required" });
    return;
  }
  try {
    const payment = createBusinessPayment({
      projectId: String(req.params.projectId),
      amount: Number(body.amount),
      paymentDate: body.paymentDate,
      method: body.method,
      memo: body.memo,
      invoiceId: body.invoiceId,
    });
    logBusinessIntegration({
      projectId: String(req.params.projectId),
      type: "status_flow",
      provider: "payment",
      status: "success",
      request: body,
      response: payment,
    });
    res.status(201).json({ payment, statusUpdate: payment.statusUpdate });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

businessRouter.get("/payments", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
  res.json({ payments: listBusinessPayments(projectId ? { projectId } : undefined) });
});

businessRouter.get("/accounting/export-csv", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const format = String(req.query.format ?? "standard");
  const csv =
    format === "standard"
      ? buildAccountingExportCsv()
      : buildAccountingExportByFormat(format as "freee" | "yayoi" | "standard");
  res.type("text/csv; charset=utf-8");
  res.send(csv);
});

businessRouter.post("/offline/sync", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const body = req.body as { items?: unknown[] };
  const items = (body.items ?? []) as Parameters<typeof processBusinessOfflineSync>[0];
  res.json(processBusinessOfflineSync(items));
});

function servePdfDocument(kind: "estimate" | "invoice" | "completion_report") {
  return async (req: AuthedRequest, res: Response) => {
    if (!assertBusinessRole(req, res)) return;
    const projectId = String(req.params.projectId);
    const project = getBusinessProject(projectId);
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    try {
      if (kind === "estimate") {
        if (!project.estimateId) throw new Error("No estimate");
        const est = getEstimate(project.estimateId)!;
        const rendered = await renderBusinessPdf("estimate", project, est);
        if (req.query.format === "json") {
          return res.json({ htmlPath: rendered.htmlPath, pdfPath: rendered.pdfPath });
        }
        const accept = req.headers.accept ?? "";
        if (accept.includes("application/pdf") && rendered.localPath) {
          res.type("application/pdf");
          return res.send(fs.readFileSync(rendered.localPath));
        }
        const htmlPath = getRenderedHtmlPath(projectId, "estimate");
        const html = htmlPath
          ? fs.readFileSync(htmlPath, "utf8")
          : renderEstimateHtml(project, est);
        res.type("text/html; charset=utf-8");
        return res.send(html);
      }
      if (kind === "invoice") {
        if (!project.invoiceId) throw new Error("No invoice");
        const inv = getInvoice(project.invoiceId)!;
        const rendered = await renderBusinessPdf("invoice", project, inv);
        if (req.query.format === "json") {
          return res.json({ htmlPath: rendered.htmlPath, pdfPath: rendered.pdfPath });
        }
        const accept = req.headers.accept ?? "";
        if (accept.includes("application/pdf") && rendered.localPath) {
          res.type("application/pdf");
          return res.send(fs.readFileSync(rendered.localPath));
        }
        const html = renderInvoiceHtml(project, inv);
        res.type("text/html; charset=utf-8");
        return res.send(html);
      }
      if (!project.completionReportId) throw new Error("No completion report");
      const rep = getCompletionReport(project.completionReportId)!;
      const rendered = await renderBusinessPdf("completion_report", project, rep);
      if (req.query.format === "json") {
        return res.json({ htmlPath: rendered.htmlPath, pdfPath: rendered.pdfPath });
      }
      const accept = req.headers.accept ?? "";
      if (accept.includes("application/pdf") && rendered.localPath) {
        res.type("application/pdf");
        return res.send(fs.readFileSync(rendered.localPath));
      }
      const html = renderCompletionReportHtml(project, rep);
      res.type("text/html; charset=utf-8");
      return res.send(html);
    } catch (e) {
      res.status(404).json({ error: (e as Error).message });
    }
  };
}

businessRouter.get("/drawing-symbols", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const tradeType = req.query.tradeType
    ? (String(req.query.tradeType) as import("../../business/drawing-types.js").DrawingTradeType)
    : undefined;
  res.json({ symbols: listDrawingSymbols(tradeType) });
});

businessRouter.get("/projects/:projectId/drawing-plans", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  res.json({ plans: listDrawingPlans(String(req.params.projectId)) });
});

businessRouter.post("/projects/:projectId/drawing-plans", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const body = req.body as {
    title?: string;
    sourceType?: import("../../business/drawing-types.js").DrawingSourceType;
    tradeType?: import("../../business/drawing-types.js").DrawingTradeType;
  };
  const plan = createDrawingPlan({
    projectId: String(req.params.projectId),
    title: body.title,
    sourceType: body.sourceType,
    tradeType: body.tradeType,
  });
  res.status(201).json({ plan });
});

businessRouter.get("/drawing-plans/:planId", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  const plan = getDrawingPlan(String(req.params.planId));
  if (!plan) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ plan, symbols: listDrawingSymbols(plan.tradeType) });
});

businessRouter.patch("/drawing-plans/:planId", ...businessAuth, (req: AuthedRequest, res) => {
  if (!assertBusinessRole(req, res)) return;
  try {
    const plan = updateDrawingPlan(String(req.params.planId), req.body);
    res.json({ plan });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

businessRouter.post(
  "/projects/:projectId/drawing-plans/:planId/background",
  ...businessAuth,
  (req: AuthedRequest, res) => {
    if (!assertBusinessRole(req, res)) return;
    const body = req.body as { imageBase64?: string; fileName?: string };
    if (!body.imageBase64) {
      res.status(400).json({ error: "imageBase64 required" });
      return;
    }
    const projectId = String(req.params.projectId);
    const planId = String(req.params.planId);
    const plan = getDrawingPlan(planId);
    if (!plan || plan.projectId !== projectId) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const dir = businessUploadsDir(projectId, "drawing");
    const name = body.fileName ?? `bg-${Date.now()}.jpg`;
    const full = path.join(dir, name);
    fs.writeFileSync(full, Buffer.from(body.imageBase64, "base64"));
    const urlPath = `/uploads/business/${projectId}/drawing/${name}`;
    const updated = updateDrawingPlan(planId, {
      backgroundImagePath: urlPath,
      sourceType: "photo",
    });
    res.json({ plan: updated });
  }
);

businessRouter.post(
  "/projects/:projectId/drawing-plans/:planId/estimate-candidate",
  ...businessAuth,
  (req: AuthedRequest, res) => {
    if (!assertBusinessRole(req, res)) return;
    const plan = getDrawingPlan(String(req.params.planId));
    if (!plan || plan.projectId !== String(req.params.projectId)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ candidate: createEstimateCandidateFromDrawingPlan(plan) });
  }
);

businessRouter.get(
  "/projects/:projectId/specification",
  ...businessAuth,
  (req: AuthedRequest, res) => {
    if (!assertBusinessRole(req, res)) return;
    res.json({ documents: listSpecificationDocuments(String(req.params.projectId)) });
  }
);

businessRouter.post(
  "/projects/:projectId/specification/generate-pdf",
  ...businessAuth,
  (req: AuthedRequest, res) => {
    if (!assertBusinessRole(req, res)) return;
    const body = req.body as { drawingPlanId?: string; title?: string; overview?: string };
    const project = getBusinessProject(String(req.params.projectId));
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const plans = listDrawingPlans(project.id);
    const plan = body.drawingPlanId
      ? getDrawingPlan(body.drawingPlanId)
      : plans[0] ?? createDrawingPlan({ projectId: project.id });
    if (!plan || plan.projectId !== project.id) {
      res.status(404).json({ error: "Drawing plan not found" });
      return;
    }
    const doc = createSpecificationDocumentFromPlan(project, plan, {
      title: body.title,
      overview: body.overview,
    });
    saveSpecificationDocument(doc);
    const qnapPath = generateQnapSpecificationFilePath(project);
    logBusinessIntegration({
      projectId: project.id,
      type: "pdf",
      provider: "specification",
      status: "success",
      request: { drawingPlanId: plan.id },
      response: { pdfPath: doc.pdfPath, qnapPath },
    });
    res.status(201).json({ document: doc, qnapPath });
  }
);

businessRouter.get("/projects/:projectId/pdf/estimate", ...businessAuth, servePdfDocument("estimate"));
businessRouter.get("/projects/:projectId/pdf/invoice", ...businessAuth, servePdfDocument("invoice"));
businessRouter.get(
  "/projects/:projectId/pdf/completion-report",
  ...businessAuth,
  servePdfDocument("completion_report")
);
