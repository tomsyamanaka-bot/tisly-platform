import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import fs from "fs";
import path from "path";
import {
  buildTomsFormatPreviewV1,
  createEstimateFromSurveyV1,
  createInvoiceFromEstimateV1,
  createStandaloneEstimateV1,
  createStandaloneInvoiceV1,
  duplicateEstimateV1,
  finalizeEstimateV1,
  getEstimatePdfContextV1,
  getEstimateProjectV1Detail,
  listCustomerSuggestionsV1,
  listEstimateLineTemplatesForApiV1,
  applyEstimateLineTemplateV1,
  listEstimateProjectsV1,
  listInvoiceProjectsV1,
  listPendingSurveysV1,
  createCompletionReportV1,
  renderCompletionReportHtmlV1,
  renderSpecificationHtmlV1,
  updateEstimateHeaderV1,
  updateEstimateItemsV1,
  listEstimatePriceRulePresetsV1,
  generateAndSaveSpecificationPdfV1,
} from "../../estimate/estimate-v1-store.js";
import { maybeAutoSaveSpecificationPdfV1 } from "../../projects/project-pdf-auto-save.js";
import {
  addCompletionPhotoV1,
  deleteCompletionPhotoV1,
  listCompletionPhotosV1,
  moveCompletionPhotoV1,
  updateCompletionPhotoV1,
} from "../../estimate/completion-photos-store.js";
import { businessUploadsDir } from "../../business/business-store.js";
import {
  generateEstimatePdf,
  generateInvoicePdf,
  getEstimatePdfOrPlaceholder,
  getInvoicePdfOrPlaceholder,
} from "../../business/services/pdfService.js";
import { getBusinessProject, getEstimate, getInvoice, getCompletionReport, setEstimatePdfPath, setInvoicePdfPath } from "../../business/business-store.js";
import { regenerateProjectPdfV1, resolveProjectPdfFile, buildProjectPdfFileNameForProject } from "../../projects/project-pdf-store.js";
import { recordProjectPdfSavedV1 } from "../../projects/project-pdf-qnap-store.js";
import { sendPdfFile, logPdfApiError } from "../../business/pdf/pdf-serve.js";
import { isValidPdfFile, PDF_GENERATION_FAILED_MSG } from "../../business/pdf/pdf-validation.js";
import type { EstimateLineItem } from "../../business/business-types.js";
import type { EstimateHeaderInputV1 } from "../../estimate/estimate-v1-types.js";
import {
  buildMaterialCandidatesForSurvey,
  listAllMaterialCandidatePresets,
} from "../../estimate/material-candidates.js";
import {
  buildDocumentViewPayloadV1,
  DOCUMENT_VIEW_KINDS,
  type DocumentViewKindV1,
} from "../../estimate/document-view-v1.js";

export const estimateV1Router = Router();

const estimateV1Auth = [requireAuth("surveyor")] as const;

function assertEstimateV1Role(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (
    !roleMeetsRequirement(role, "surveyor") &&
    !roleMeetsRequirement(role, "manager") &&
    role !== "super_admin"
  ) {
    res.status(403).json({ error: "Surveyor, manager or admin role required" });
    return false;
  }
  return true;
}

function parseIncludePhotos(query: Record<string, unknown>, defaultValue = false): boolean {
  const raw = query.includePhotos ?? query.photos;
  if (raw === "0" || raw === "false" || raw === "no") return false;
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  return defaultValue;
}

function parseRegenerate(query: Record<string, unknown>): boolean {
  const raw = query.regenerate ?? query.live;
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  return false;
}

function parseFormatHtml(query: Record<string, unknown>): boolean {
  const raw = query.format ?? query.preview;
  return raw === "html";
}

estimateV1Router.get("/price-rules", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  res.json({ presets: listEstimatePriceRulePresetsV1() });
});

estimateV1Router.get("/material-candidates/:surveyProjectId", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const groups = buildMaterialCandidatesForSurvey(String(req.params.surveyProjectId));
  res.json({ groups });
});

estimateV1Router.get("/material-candidates", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  res.json({ groups: listAllMaterialCandidatePresets() });
});

estimateV1Router.get("/pending-surveys", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const customerCode = (req.query.customerCode as string) ?? req.admin?.customerCode;
  res.json({ surveys: listPendingSurveysV1({ customerCode }) });
});

estimateV1Router.get("/projects", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const customerCode = (req.query.customerCode as string) ?? req.admin?.customerCode;
  res.json({ projects: listEstimateProjectsV1({ customerCode }) });
});

estimateV1Router.get("/invoices", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const customerCode = (req.query.customerCode as string) ?? req.admin?.customerCode;
  res.json({ projects: listInvoiceProjectsV1({ customerCode }) });
});

estimateV1Router.get("/customers/suggest", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const q = String(req.query.q ?? "");
  res.json({ suggestions: listCustomerSuggestionsV1(q) });
});

estimateV1Router.get("/line-templates", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  res.json({ templates: listEstimateLineTemplatesForApiV1() });
});

estimateV1Router.get("/line-templates/:id/items", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  try {
    const items = applyEstimateLineTemplateV1(String(req.params.id));
    res.json({ items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "template failed";
    res.status(msg === "template not found" ? 404 : 400).json({ error: msg });
  }
});

estimateV1Router.post("/from-survey/:surveyProjectId", ...estimateV1Auth, async (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  try {
    const detail = createEstimateFromSurveyV1(
      String(req.params.surveyProjectId),
      req.admin?.username
    );
    await maybeAutoSaveSpecificationPdfV1(detail.businessProjectId);
    res.status(201).json(detail);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "create failed";
    const status =
      msg === "survey project not found"
        ? 404
        : msg === "survey project must be estimate_pending"
          ? 400
          : 400;
    res.status(status).json({ error: msg });
  }
});

estimateV1Router.post("/standalone-estimate", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  try {
    const body = req.body as Record<string, unknown>;
    const detail = createStandaloneEstimateV1(
      {
        addressee: String(body.addressee ?? ""),
        subject: String(body.subject ?? ""),
        staffName: body.staffName != null ? String(body.staffName) : undefined,
        workLocation: body.workLocation != null ? String(body.workLocation) : "",
        notes: body.notes != null ? String(body.notes) : undefined,
        items: Array.isArray(body.items) ? (body.items as Partial<EstimateLineItem>[]) : [],
      },
      req.admin?.username
    );
    res.status(201).json(detail);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "create failed";
    res.status(400).json({ error: msg });
  }
});

estimateV1Router.post("/standalone-invoice", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  try {
    const body = req.body as Record<string, unknown>;
    const detail = createStandaloneInvoiceV1(
      {
        addressee: String(body.addressee ?? ""),
        subject: String(body.subject ?? ""),
        staffName: body.staffName != null ? String(body.staffName) : undefined,
        workLocation: body.workLocation != null ? String(body.workLocation) : "",
        notes: body.notes != null ? String(body.notes) : undefined,
        invoiceDate: body.invoiceDate != null ? String(body.invoiceDate) : undefined,
        paymentDueDate: body.paymentDueDate != null ? String(body.paymentDueDate) : undefined,
        items: Array.isArray(body.items) ? (body.items as Partial<EstimateLineItem>[]) : [],
      },
      req.admin?.username
    );
    res.status(201).json(detail);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "create failed";
    res.status(400).json({ error: msg });
  }
});

estimateV1Router.get("/projects/:id", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const detail = getEstimateProjectV1Detail(String(req.params.id));
  if (!detail) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(detail);
});

estimateV1Router.patch("/projects/:id/header", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const body = req.body as EstimateHeaderInputV1;
  try {
    const header = updateEstimateHeaderV1(String(req.params.id), body);
    res.json({ header });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "update failed";
    res.status(msg === "estimate not found" ? 404 : 400).json({ error: msg });
  }
});

estimateV1Router.patch("/projects/:id/items", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const body = req.body as {
    items?: Partial<EstimateLineItem>[];
    notes?: string;
    shuseiDiscount?: number;
    shuseiDiscountMemo?: string;
    applyPriceRule?: boolean;
    forceOverwriteManualLines?: boolean;
    priceRule?: { ruleName: string; costMultiplier?: number | null; laborMultiplier?: number | null };
  };
  if (!Array.isArray(body.items)) {
    res.status(400).json({ error: "items array required" });
    return;
  }
  try {
    const result = updateEstimateItemsV1(String(req.params.id), body.items, {
      notes: body.notes,
      shuseiDiscount: body.shuseiDiscount,
      shuseiDiscountMemo: body.shuseiDiscountMemo,
      applyPriceRule: body.applyPriceRule === true,
      forceOverwriteManualLines: body.forceOverwriteManualLines === true,
      priceRule: body.priceRule,
    });
    res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "update failed";
    if (msg === "manual_price_lines") {
      const manualLineIndices =
        (e as Error & { manualLineIndices?: number[] }).manualLineIndices ?? [];
      res.status(409).json({
        error: "manual_price_lines",
        message: "手入力で変更した単価があります。上書きしますか？",
        manualLineIndices,
      });
      return;
    }
    res.status(msg === "estimate not found" ? 404 : 400).json({ error: msg });
  }
});

estimateV1Router.post("/projects/:id/finalize", ...estimateV1Auth, async (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const body = (req.body ?? {}) as { includePhotos?: boolean };
  try {
    const result = await finalizeEstimateV1(String(req.params.id), {
      includePhotos: body.includePhotos === true,
    });
    res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "finalize failed";
    res.status(msg === "estimate not found" ? 404 : 400).json({ error: msg });
  }
});

estimateV1Router.get("/projects/:id/pdf", ...estimateV1Auth, async (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const projectId = String(req.params.id);
  const project = getBusinessProject(projectId);
  if (!project?.estimateId) {
    res.status(404).json({ error: "No estimate" });
    return;
  }
  const estimate = getEstimate(project.estimateId);
  if (!estimate) {
    res.status(404).json({ error: "No estimate" });
    return;
  }
  const hasSurveyPhotos = (project.surveyPhotos?.length ?? 0) > 0;
  /** 見積書PDFは写真なし（PROJECT_STATUS: includePhotos 常に false） */
  const includePhotos = parseIncludePhotos(req.query as Record<string, unknown>, false);
  const regenerate = parseRegenerate(req.query as Record<string, unknown>);
  const pdfCtx = getEstimatePdfContextV1(projectId, { includePhotos }) ?? undefined;
  if (parseFormatHtml(req.query as Record<string, unknown>)) {
    const { contentType, path: filePath } = getEstimatePdfOrPlaceholder(project, estimate, pdfCtx, {
      regenerate,
    });
    res.type(contentType).sendFile(filePath);
    return;
  }
  let filePath = !regenerate ? resolveProjectPdfFile(projectId, "estimate") : null;
  if (filePath && includePhotos && hasSurveyPhotos) {
    filePath = null;
  }
  if (!filePath || !isValidPdfFile(filePath)) {
    try {
      const pdfPath = await generateEstimatePdf(project, estimate, pdfCtx);
      setEstimatePdfPath(estimate.id, pdfPath);
      recordProjectPdfSavedV1(projectId, "estimate", pdfPath);
      filePath = resolveProjectPdfFile(projectId, "estimate");
    } catch (e) {
      const msg = e instanceof Error ? e.message : PDF_GENERATION_FAILED_MSG;
      logPdfApiError("estimate", projectId, 500, msg);
      res.status(500).json({ error: msg });
      return;
    }
  }
  if (!filePath || !isValidPdfFile(filePath)) {
    logPdfApiError("estimate", projectId, 500, PDF_GENERATION_FAILED_MSG);
    res.status(500).json({ error: PDF_GENERATION_FAILED_MSG });
    return;
  }
  sendPdfFile(res, filePath, buildProjectPdfFileNameForProject("estimate", project, estimate), {
    documentType: "estimate",
    projectId,
  });
});

estimateV1Router.post("/projects/:id/pdf/regenerate", ...estimateV1Auth, async (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const project = getBusinessProject(String(req.params.id));
  if (!project?.estimateId) {
    res.status(404).json({ error: "No estimate" });
    return;
  }
  const estimate = getEstimate(project.estimateId);
  if (!estimate) {
    res.status(404).json({ error: "No estimate" });
    return;
  }
  try {
    const body = (req.body ?? {}) as { includePhotos?: boolean };
    const hasSurveyPhotos = (project.surveyPhotos?.length ?? 0) > 0;
    const includePhotos =
      body.includePhotos === false ? false : body.includePhotos === true || hasSurveyPhotos;
    const pdfCtx = getEstimatePdfContextV1(project.id, { includePhotos }) ?? undefined;
    const pdfPath = await generateEstimatePdf(project, estimate, pdfCtx);
    setEstimatePdfPath(estimate.id, pdfPath);
    recordProjectPdfSavedV1(project.id, "estimate", pdfPath);
    res.json({ pdfPath, estimate: getEstimate(estimate.id) });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "regenerate failed" });
  }
});

estimateV1Router.post("/projects/:id/invoice", ...estimateV1Auth, async (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  try {
    const result = await createInvoiceFromEstimateV1(String(req.params.id));
    res.status(201).json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "invoice failed";
    res.status(msg === "estimate not found" ? 404 : 400).json({ error: msg });
  }
});

estimateV1Router.get("/projects/:id/invoice/pdf", ...estimateV1Auth, async (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const projectId = String(req.params.id);
  const project = getBusinessProject(projectId);
  if (!project?.invoiceId || !project.estimateId) {
    res.status(404).json({ error: "No invoice" });
    return;
  }
  const invoice = getInvoice(project.invoiceId);
  const estimate = getEstimate(project.estimateId);
  if (!invoice || !estimate) {
    res.status(404).json({ error: "No invoice" });
    return;
  }
  const hasSurveyPhotos = (project.surveyPhotos?.length ?? 0) > 0;
  /** 請求書PDFは写真なし（PROJECT_STATUS: includePhotos 常に false） */
  const includePhotos = parseIncludePhotos(req.query as Record<string, unknown>, false);
  const regenerate = parseRegenerate(req.query as Record<string, unknown>);
  const pdfCtx = getEstimatePdfContextV1(projectId, { includePhotos }) ?? undefined;
  if (parseFormatHtml(req.query as Record<string, unknown>)) {
    const { contentType, path: filePath } = getInvoicePdfOrPlaceholder(
      project,
      invoice,
      estimate,
      { notes: pdfCtx?.notes, includePhotos: pdfCtx?.includePhotos },
      { regenerate }
    );
    res.type(contentType).sendFile(filePath);
    return;
  }
  let filePath = !regenerate ? resolveProjectPdfFile(projectId, "invoice") : null;
  if (filePath && includePhotos && hasSurveyPhotos) {
    filePath = null;
  }
  if (!filePath || !isValidPdfFile(filePath)) {
    try {
      const pdfPath = await generateInvoicePdf(project, invoice, estimate, {
        notes: pdfCtx?.notes,
        includePhotos: pdfCtx?.includePhotos,
      });
      setInvoicePdfPath(invoice.id, pdfPath);
      recordProjectPdfSavedV1(projectId, "invoice", pdfPath);
      filePath = resolveProjectPdfFile(projectId, "invoice");
    } catch (e) {
      const msg = e instanceof Error ? e.message : PDF_GENERATION_FAILED_MSG;
      logPdfApiError("invoice", projectId, 500, msg);
      res.status(500).json({ error: msg });
      return;
    }
  }
  if (!filePath || !isValidPdfFile(filePath)) {
    logPdfApiError("invoice", projectId, 500, PDF_GENERATION_FAILED_MSG);
    res.status(500).json({ error: PDF_GENERATION_FAILED_MSG });
    return;
  }
  sendPdfFile(res, filePath, buildProjectPdfFileNameForProject("invoice", project, estimate), {
    documentType: "invoice",
    projectId,
  });
});

estimateV1Router.post(
  "/projects/:id/invoice/pdf/regenerate",
  ...estimateV1Auth,
  async (req: AuthedRequest, res) => {
    if (!assertEstimateV1Role(req, res)) return;
    const project = getBusinessProject(String(req.params.id));
    if (!project?.invoiceId || !project.estimateId) {
      res.status(404).json({ error: "No invoice" });
      return;
    }
    const invoice = getInvoice(project.invoiceId);
    const estimate = getEstimate(project.estimateId);
    if (!invoice || !estimate) {
      res.status(404).json({ error: "No invoice" });
      return;
    }
    try {
      const body = (req.body ?? {}) as { includePhotos?: boolean };
      const hasSurveyPhotos = (project.surveyPhotos?.length ?? 0) > 0;
      const includePhotos =
        body.includePhotos === false ? false : body.includePhotos === true || hasSurveyPhotos;
      const pdfCtx = getEstimatePdfContextV1(project.id, { includePhotos }) ?? undefined;
      const pdfPath = await generateInvoicePdf(project, invoice, estimate, {
        notes: pdfCtx?.notes,
        includePhotos: pdfCtx?.includePhotos,
      });
      setInvoicePdfPath(invoice.id, pdfPath);
      recordProjectPdfSavedV1(project.id, "invoice", pdfPath);
      res.json({ pdfPath, invoice: getInvoice(invoice.id) });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "regenerate failed" });
    }
  }
);

estimateV1Router.get(
  "/projects/:id/specification/pdf",
  ...estimateV1Auth,
  async (req: AuthedRequest, res) => {
    if (!assertEstimateV1Role(req, res)) return;
    const projectId = String(req.params.id);
    const project = getBusinessProject(projectId);
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const regenerate = parseRegenerate(req.query as Record<string, unknown>);
    if (parseFormatHtml(req.query as Record<string, unknown>)) {
      const html = renderSpecificationHtmlV1(projectId);
      if (!html) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const tmp = businessUploadsDir(project.id, "pdf-html");
      const p = path.join(tmp, "specification-live.html");
      fs.writeFileSync(p, html, "utf8");
      res.type("text/html; charset=utf-8").sendFile(p);
      return;
    }
    let filePath = !regenerate ? resolveProjectPdfFile(projectId, "specification") : null;
    if (!filePath || !isValidPdfFile(filePath)) {
      try {
        const pdfPath = await maybeAutoSaveSpecificationPdfV1(projectId);
        if (!pdfPath) {
          const entry = await regenerateProjectPdfV1(projectId, "specification");
          filePath = resolveProjectPdfFile(projectId, "specification");
          if (!filePath && entry.pdfPath) {
            filePath = path.join(process.cwd(), entry.pdfPath.replace(/^\//, ""));
          }
        } else {
          filePath = resolveProjectPdfFile(projectId, "specification");
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : PDF_GENERATION_FAILED_MSG;
        logPdfApiError("specification", projectId, 500, msg);
        res.status(500).json({ error: msg });
        return;
      }
    }
    if (!filePath || !isValidPdfFile(filePath)) {
      logPdfApiError("specification", projectId, 500, PDF_GENERATION_FAILED_MSG);
      res.status(500).json({ error: PDF_GENERATION_FAILED_MSG });
      return;
    }
    sendPdfFile(
      res,
      filePath,
      buildProjectPdfFileNameForProject(
        "specification",
        project,
        project.estimateId ? getEstimate(project.estimateId) ?? undefined : undefined
      ),
      { documentType: "specification", projectId }
    );
  }
);

estimateV1Router.post(
  "/projects/:id/specification/pdf/regenerate",
  ...estimateV1Auth,
  async (req: AuthedRequest, res) => {
    if (!assertEstimateV1Role(req, res)) return;
    try {
      const entry = await regenerateProjectPdfV1(String(req.params.id), "specification");
      res.json({ pdfPath: entry.pdfPath, pdf: entry });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "regenerate failed";
      res.status(msg.includes("not found") || msg.startsWith("No ") ? 404 : 500).json({ error: msg });
    }
  }
);

estimateV1Router.get("/projects/:id/completion-photos", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const project = getBusinessProject(String(req.params.id));
  if (!project) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ photos: listCompletionPhotosV1(project.id) });
});

estimateV1Router.post("/projects/:id/completion-photos", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const projectId = String(req.params.id);
  const body = req.body as { imageBase64?: string; fileName?: string; title?: string };
  if (!body.imageBase64) {
    res.status(400).json({ error: "imageBase64 required" });
    return;
  }
  try {
    const photo = addCompletionPhotoV1(projectId, {
      imageBase64: body.imageBase64,
      fileName: body.fileName,
      title: body.title,
      uploadedBy: req.admin?.username,
    });
    res.status(201).json(photo);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upload failed";
    res.status(msg === "project not found" ? 404 : 400).json({ error: msg });
  }
});

estimateV1Router.post(
  "/projects/:id/completion-photos/:photoId/move",
  ...estimateV1Auth,
  (req: AuthedRequest, res) => {
    if (!assertEstimateV1Role(req, res)) return;
    const body = req.body as { direction?: string };
    if (body.direction !== "up" && body.direction !== "down") {
      res.status(400).json({ error: "direction must be up or down" });
      return;
    }
    const photos = moveCompletionPhotoV1(
      String(req.params.id),
      String(req.params.photoId),
      body.direction
    );
    if (!photos) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ photos });
  }
);

estimateV1Router.patch(
  "/projects/:id/completion-photos/:photoId",
  ...estimateV1Auth,
  (req: AuthedRequest, res) => {
    if (!assertEstimateV1Role(req, res)) return;
    const body = req.body as { title?: string; imageBase64?: string; fileName?: string };
    const updated = updateCompletionPhotoV1(String(req.params.id), String(req.params.photoId), body);
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(updated);
  }
);

estimateV1Router.delete(
  "/projects/:id/completion-photos/:photoId",
  ...estimateV1Auth,
  (req: AuthedRequest, res) => {
    if (!assertEstimateV1Role(req, res)) return;
    const ok = deleteCompletionPhotoV1(String(req.params.id), String(req.params.photoId));
    if (!ok) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(204).send();
  }
);

estimateV1Router.post(
  "/projects/:id/completion-report/create",
  ...estimateV1Auth,
  async (req: AuthedRequest, res) => {
    if (!assertEstimateV1Role(req, res)) return;
    try {
      const result = await createCompletionReportV1(String(req.params.id));
      res.status(201).json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "create failed";
      res.status(msg === "project not found" ? 404 : 400).json({ error: msg });
    }
  }
);

estimateV1Router.get(
  "/projects/:id/completion-report/pdf",
  ...estimateV1Auth,
  async (req: AuthedRequest, res) => {
    if (!assertEstimateV1Role(req, res)) return;
    const projectId = String(req.params.id);
    const project = getBusinessProject(projectId);
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const regenerate = parseRegenerate(req.query as Record<string, unknown>);
    if (parseFormatHtml(req.query as Record<string, unknown>)) {
      const html = renderCompletionReportHtmlV1(projectId);
      if (!html) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const tmp = businessUploadsDir(project.id, "pdf-html");
      const p = path.join(tmp, "completion-report-live.html");
      fs.writeFileSync(p, html, "utf8");
      res.type("text/html; charset=utf-8").sendFile(p);
      return;
    }
    let filePath = !regenerate ? resolveProjectPdfFile(projectId, "report") : null;
    if (!filePath || !isValidPdfFile(filePath)) {
      try {
        if (!project.completionReportId) {
          await createCompletionReportV1(projectId);
        }
        const entry = await regenerateProjectPdfV1(projectId, "report");
        filePath = resolveProjectPdfFile(projectId, "report");
        if (!filePath && entry.pdfPath) {
          filePath = path.join(process.cwd(), entry.pdfPath.replace(/^\//, ""));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : PDF_GENERATION_FAILED_MSG;
        logPdfApiError("completion-report", projectId, 500, msg);
        res.status(500).json({ error: msg });
        return;
      }
    }
    if (!filePath || !isValidPdfFile(filePath)) {
      logPdfApiError("completion-report", projectId, 500, PDF_GENERATION_FAILED_MSG);
      res.status(500).json({ error: PDF_GENERATION_FAILED_MSG });
      return;
    }
    sendPdfFile(
      res,
      filePath,
      buildProjectPdfFileNameForProject(
        "report",
        project,
        project.estimateId ? getEstimate(project.estimateId) ?? undefined : undefined
      ),
      { documentType: "completion-report", projectId }
    );
  }
);

estimateV1Router.post(
  "/projects/:id/completion-report/pdf/regenerate",
  ...estimateV1Auth,
  async (req: AuthedRequest, res) => {
    if (!assertEstimateV1Role(req, res)) return;
    try {
      const entry = await regenerateProjectPdfV1(String(req.params.id), "report");
      res.json({ pdfPath: entry.pdfPath, pdf: entry });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "regenerate failed";
      res.status(msg.includes("not found") || msg.startsWith("No ") ? 404 : 500).json({ error: msg });
    }
  }
);

estimateV1Router.post("/projects/:id/duplicate", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  try {
    const detail = duplicateEstimateV1(String(req.params.id));
    res.status(201).json(detail);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "duplicate failed";
    res.status(msg === "estimate not found" ? 404 : 400).json({ error: msg });
  }
});

estimateV1Router.get("/projects/:id/document-view", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const kind = String(req.query.kind ?? "") as DocumentViewKindV1;
  if (!DOCUMENT_VIEW_KINDS.includes(kind)) {
    res.status(400).json({ error: "kind must be one of: " + DOCUMENT_VIEW_KINDS.join(", ") });
    return;
  }
  const payload = buildDocumentViewPayloadV1(String(req.params.id), kind);
  if (!payload) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(payload);
});

estimateV1Router.get("/projects/:id/toms-format", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  try {
    const includePhotos = parseIncludePhotos(req.query as Record<string, unknown>);
    res.json(buildTomsFormatPreviewV1(String(req.params.id), { includePhotos }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "toms format failed";
    res.status(msg === "estimate not found" ? 404 : 400).json({ error: msg });
  }
});
