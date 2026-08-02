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
import { createEstimateFromMasterDraftV1, recalculateEstimateFromMasterDraftV1 } from "../../master/master-v1-estimate-apply-service.js";
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
import {
  getProjectDocumentsStatusV1,
  prefetchProjectPdfsV1,
  resolveProjectPdfForServeV1,
} from "../../projects/project-documents-v1.js";
import { recordPdfShareLogV1, listPdfShareLogsForProjectV1 } from "../../projects/pdf-share-log-store.js";
import { getMasterV1EstimateDraft } from "../../master/master-v1-draft-estimate-store.js";
import { summarizeMasterPreviewPricing } from "../../master/master-v1-estimate-apply-service.js";
import { parseEstimateLinesFromImageV1 } from "../../estimate/line-image-parse-v1.js";
import {
  applyTomsMasterPricesToItemsV1,
  listTomsMasterItemsV1,
  suggestTomsMasterPriceV1,
} from "../../estimate/toms-master-data-v1.js";
import {
  buildTomsEstimateLineShareTextV1,
  deleteTomsEstimateHistoryV1,
  duplicateTomsEstimateHistoryV1,
  getTomsEstimateHistoryByIdV1,
  listTomsEstimateHistoryV1,
  saveTomsEstimateHistoryV1,
} from "../../estimate/toms-estimate-history-store-v1.js";
import { saveEstimateInvoicePdfsToQnapV1 } from "../../storage/estimate-invoice-qnap-save-v1.js";
import {
  getQnapClientDirectConfigV1,
  getQnapSaveRouteV1,
  runQnapWebDavPingV1,
} from "../../storage/qnap-network-diagnose-v1.js";
import { maskWebDavUrlPreview } from "../../storage/qnap-storage-v1-config.js";
import {
  buildInvoicesEstimatesBackupRelativePathV1,
  buildInvoicesEstimatesBackupDisplayPathV1,
} from "../../storage/mothership-paths-v1.js";

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

/**
 * LINEメモ・写真から見積明細を抽出（Gemini Vision + rule）。
 * 既存明細はクライアント側で末尾 append する。
 */
estimateV1Router.post(
  "/parse-line-image",
  ...estimateV1Auth,
  async (req: AuthedRequest, res) => {
    if (!assertEstimateV1Role(req, res)) return;
    try {
      const body = (req.body || {}) as {
        ocrText?: string;
        fileName?: string;
        imageBase64?: string;
        forceDemo?: boolean;
      };
      const result = await parseEstimateLinesFromImageV1({
        ocrText: body.ocrText,
        fileName: body.fileName,
        imageBase64: body.imageBase64,
        forceDemo: body.forceDemo === true,
      });
      res.json(result);
    } catch (e) {
      console.error(
        "[estimate-v1] parse-line-image failed",
        e instanceof Error ? e.message : e
      );
      res.status(400).json({
        error:
          "解析エラーが発生しました。時間をおいて再試行してください。",
      });
    }
  }
);

/** TOMS 標準単価マスター一覧 */
estimateV1Router.get("/toms-master", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  res.json({
    schemaVersion: 1,
    items: listTomsMasterItemsV1(),
  });
});

/** 品名から TOMS マスター単価を提案 */
estimateV1Router.post(
  "/toms-master/suggest",
  ...estimateV1Auth,
  (req: AuthedRequest, res) => {
    if (!assertEstimateV1Role(req, res)) return;
    const body = (req.body || {}) as {
      name?: string;
      names?: string[];
      items?: Array<{ name: string; unitPrice?: number; unit?: string; category?: string }>;
    };
    if (Array.isArray(body.items)) {
      const applied = applyTomsMasterPricesToItemsV1(
        body.items.map((it) => ({
          name: String(it.name || ""),
          unitPrice: Number(it.unitPrice) || 0,
          unit: it.unit,
          category: it.category,
        }))
      );
      res.json(applied);
      return;
    }
    const names = Array.isArray(body.names)
      ? body.names.map((n) => String(n || ""))
      : [String(body.name || "")];
    res.json({
      suggestions: names.map((name) => suggestTomsMasterPriceV1(name)),
    });
  }
);

/** TOMS 見積履歴一覧 */
estimateV1Router.get(
  "/toms-estimate-history",
  ...estimateV1Auth,
  (req: AuthedRequest, res) => {
    if (!assertEstimateV1Role(req, res)) return;
    const limit = Number(req.query.limit) || 50;
    res.json({ records: listTomsEstimateHistoryV1({ limit }) });
  }
);

/** TOMS 見積履歴をワンタップ保存 */
estimateV1Router.post(
  "/toms-estimate-history",
  ...estimateV1Auth,
  (req: AuthedRequest, res) => {
    if (!assertEstimateV1Role(req, res)) return;
    try {
      const body = (req.body || {}) as {
        customerName?: string;
        subject?: string;
        workLocation?: string;
        notes?: string;
        items?: Array<Record<string, unknown>>;
        sourceProjectId?: string;
      };
      const record = saveTomsEstimateHistoryV1({
        customerName: body.customerName,
        subject: body.subject,
        workLocation: body.workLocation,
        notes: body.notes,
        items: (body.items || []).map((it) => ({
          name: String(it.name ?? ""),
          unit: it.unit != null ? String(it.unit) : undefined,
          quantity: it.quantity != null ? Number(it.quantity) : undefined,
          unitPrice: it.unitPrice != null ? Number(it.unitPrice) : undefined,
          amount: it.amount != null ? Number(it.amount) : undefined,
          category: it.category != null ? String(it.category) : undefined,
          memo: it.memo != null ? String(it.memo) : undefined,
        })),
        sourceProjectId: body.sourceProjectId,
        createdBy: req.admin?.username ?? null,
      });
      res.status(201).json({ record });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "save failed";
      res.status(400).json({ error: msg });
    }
  }
);

estimateV1Router.get(
  "/toms-estimate-history/:id",
  ...estimateV1Auth,
  (req: AuthedRequest, res) => {
    if (!assertEstimateV1Role(req, res)) return;
    const record = getTomsEstimateHistoryByIdV1(String(req.params.id));
    if (!record) {
      res.status(404).json({ error: "history not found" });
      return;
    }
    res.json({ record });
  }
);

/** 履歴を複製して再利用 */
estimateV1Router.post(
  "/toms-estimate-history/:id/duplicate",
  ...estimateV1Auth,
  (req: AuthedRequest, res) => {
    if (!assertEstimateV1Role(req, res)) return;
    try {
      const record = duplicateTomsEstimateHistoryV1(String(req.params.id), {
        createdBy: req.admin?.username ?? null,
      });
      res.status(201).json({ record });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "duplicate failed";
      res.status(msg === "history not found" ? 404 : 400).json({ error: msg });
    }
  }
);

estimateV1Router.delete(
  "/toms-estimate-history/:id",
  ...estimateV1Auth,
  (req: AuthedRequest, res) => {
    if (!assertEstimateV1Role(req, res)) return;
    const ok = deleteTomsEstimateHistoryV1(String(req.params.id));
    if (!ok) {
      res.status(404).json({ error: "history not found" });
      return;
    }
    res.json({ ok: true });
  }
);

/** LINE 共有用テキスト生成 */
estimateV1Router.post(
  "/toms-estimate-share-text",
  ...estimateV1Auth,
  (req: AuthedRequest, res) => {
    if (!assertEstimateV1Role(req, res)) return;
    const body = (req.body || {}) as {
      customerName?: string;
      subject?: string;
      items?: Array<{
        name?: string;
        unit?: string;
        quantity?: number;
        unitPrice?: number;
        amount?: number;
      }>;
      subtotal?: number;
      tax?: number;
      total?: number;
    };
    const text = buildTomsEstimateLineShareTextV1({
      customerName: body.customerName,
      subject: body.subject,
      items: (body.items || []).map((it) => ({
        name: String(it.name || ""),
        unit: String(it.unit || "式"),
        quantity: Number(it.quantity) || 1,
        unitPrice: Number(it.unitPrice) || 0,
        amount: Number(it.amount) || 0,
      })),
      subtotal: body.subtotal,
      tax: body.tax,
      total: body.total,
    });
    res.json({ text });
  }
);

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

estimateV1Router.post("/from-master-draft/:masterDraftId", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  try {
    const detail = createEstimateFromMasterDraftV1(
      String(req.params.masterDraftId),
      req.admin?.username
    );
    res.status(201).json(detail);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "create failed";
    const status = msg === "master draft not found" ? 404 : 400;
    res.status(status).json({ error: msg });
  }
});

estimateV1Router.post("/projects/:id/recalculate-master-pricing", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  try {
    const detail = recalculateEstimateFromMasterDraftV1(String(req.params.id));
    res.json(detail);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "recalculate failed";
    const status =
      msg === "estimate not found" || msg === "master draft not linked" || msg === "master draft not found"
        ? 404
        : 400;
    res.status(status).json({ error: msg });
  }
});

estimateV1Router.get("/master-drafts/:masterDraftId", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const draft = getMasterV1EstimateDraft(String(req.params.masterDraftId));
  if (!draft) {
    res.status(404).json({ error: "master draft not found" });
    return;
  }
  res.json({ draft, pricingSummary: summarizeMasterPreviewPricing(draft.preview) });
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
  try {
    const result = await finalizeEstimateV1(String(req.params.id));
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
  const regenerate = parseRegenerate(req.query as Record<string, unknown>);
  if (parseFormatHtml(req.query as Record<string, unknown>)) {
    const freshEstimate = getEstimate(project.estimateId)!;
    const { contentType, path: filePath } = getEstimatePdfOrPlaceholder(
      getBusinessProject(projectId)!,
      freshEstimate,
      getEstimatePdfContextV1(projectId) ?? undefined,
      { regenerate: true }
    );
    res.type(contentType).sendFile(filePath);
    return;
  }
  let filePath = regenerate ? null : await resolveProjectPdfForServeV1(projectId, "estimate");
  if (!filePath || !isValidPdfFile(filePath)) {
    try {
      const freshProject = getBusinessProject(projectId)!;
      const freshEstimate = getEstimate(freshProject.estimateId!)!;
      const freshCtx = getEstimatePdfContextV1(projectId) ?? undefined;
      const pdfPath = await generateEstimatePdf(freshProject, freshEstimate, freshCtx);
      setEstimatePdfPath(freshEstimate.id, pdfPath);
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
  const freshForName = getEstimate(project.estimateId);
  sendPdfFile(res, filePath, buildProjectPdfFileNameForProject("estimate", project, freshForName ?? estimate), {
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
  try {
    const freshProject = getBusinessProject(project.id)!;
    const estimate = getEstimate(freshProject.estimateId!);
    if (!estimate) {
      res.status(404).json({ error: "No estimate" });
      return;
    }
    const pdfCtx = getEstimatePdfContextV1(freshProject.id) ?? undefined;
    const pdfPath = await generateEstimatePdf(freshProject, estimate, pdfCtx);
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
  const regenerate = parseRegenerate(req.query as Record<string, unknown>);
  if (parseFormatHtml(req.query as Record<string, unknown>)) {
    const freshProject = getBusinessProject(projectId)!;
    const freshInvoice = getInvoice(freshProject.invoiceId!)!;
    const freshEstimate = getEstimate(freshProject.estimateId!)!;
    const freshCtx = getEstimatePdfContextV1(projectId) ?? undefined;
    const { contentType, path: filePath } = getInvoicePdfOrPlaceholder(
      freshProject,
      freshInvoice,
      freshEstimate,
      { notes: freshCtx?.notes },
      { regenerate: true }
    );
    res.type(contentType).sendFile(filePath);
    return;
  }
  let filePath = regenerate ? null : await resolveProjectPdfForServeV1(projectId, "invoice");
  if (!filePath || !isValidPdfFile(filePath)) {
    try {
      const freshProject = getBusinessProject(projectId)!;
      const freshInvoice = getInvoice(freshProject.invoiceId!)!;
      const freshEstimate = getEstimate(freshProject.estimateId!)!;
      const freshCtx = getEstimatePdfContextV1(projectId) ?? undefined;
      const pdfPath = await generateInvoicePdf(freshProject, freshInvoice, freshEstimate, {
        notes: freshCtx?.notes,
      });
      setInvoicePdfPath(freshInvoice.id, pdfPath);
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
    try {
      const freshProject = getBusinessProject(project.id)!;
      const invoice = getInvoice(freshProject.invoiceId!);
      const estimate = getEstimate(freshProject.estimateId!);
      if (!invoice || !estimate) {
        res.status(404).json({ error: "No invoice" });
        return;
      }
      const pdfCtx = getEstimatePdfContextV1(freshProject.id) ?? undefined;
      const pdfPath = await generateInvoicePdf(freshProject, invoice, estimate, {
        notes: pdfCtx?.notes,
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
    let filePath = regenerate ? null : await resolveProjectPdfForServeV1(projectId, "specification");
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
    let filePath = regenerate ? null : await resolveProjectPdfForServeV1(projectId, "completion");
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

estimateV1Router.get("/projects/:id/documents-status", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const status = getProjectDocumentsStatusV1(String(req.params.id));
  if (!status) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json(status);
});

estimateV1Router.post("/projects/:id/pdfs/prefetch", ...estimateV1Auth, async (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const projectId = String(req.params.id);
  if (!getBusinessProject(projectId)) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  try {
    const result = await prefetchProjectPdfsV1(projectId);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "prefetch failed" });
  }
});

estimateV1Router.post("/projects/:id/pdf-share-log", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const projectId = String(req.params.id);
  if (!getBusinessProject(projectId)) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  const body = req.body as { documentKind?: string; fileName?: string };
  const documentKind = String(body.documentKind ?? "").trim();
  const fileName = String(body.fileName ?? "").trim();
  if (!documentKind || !fileName) {
    res.status(400).json({ error: "documentKind and fileName required" });
    return;
  }
  const row = recordPdfShareLogV1({ projectId, documentKind, fileName });
  res.status(201).json(row);
});

estimateV1Router.get("/projects/:id/pdf-share-log", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const projectId = String(req.params.id);
  if (!getBusinessProject(projectId)) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json({ logs: listPdfShareLogsForProjectV1(projectId) });
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

/**
 * QNAP WebDAV Reachability 診断
 * — .env の QNAP_WEBDAV_URL への導通確認・応答時間・エラーコード
 */
estimateV1Router.get("/qnap/ping", ...estimateV1Auth, async (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const ping = await runQnapWebDavPingV1();
  res.status(ping.ok ? 200 : 502).json(ping);
});

estimateV1Router.post("/qnap/ping", ...estimateV1Auth, async (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const ping = await runQnapWebDavPingV1();
  res.status(ping.ok ? 200 : 502).json(ping);
});

/**
 * ローカル Wi-Fi 直接保存用設定（事務所 LAN 内のブラウザ→QNAP）
 * 認証済みユーザーのみ。パスワードを含むため HTTPS 必須。
 */
estimateV1Router.get("/qnap/client-direct-config", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const cfg = getQnapClientDirectConfigV1();
  res.json({
    available: cfg.available,
    webdavUrl: cfg.webdavUrl,
    webdavUrlPreview: cfg.webdavUrl ? maskWebDavUrlPreview(cfg.webdavUrl) : null,
    username: cfg.username,
    password: cfg.password,
    shareName: cfg.shareName,
    baseDir: cfg.baseDir,
    saveRoute: cfg.saveRoute,
    reason: cfg.reason ?? null,
  });
});

/**
 * クライアント直接保存用のリモートパス解決（VPS で PDF 確保後にブラウザが PUT）
 */
estimateV1Router.get(
  "/projects/:id/qnap-direct-manifest",
  ...estimateV1Auth,
  async (req: AuthedRequest, res) => {
    if (!assertEstimateV1Role(req, res)) return;
    const projectId = String(req.params.id);
    const project = getBusinessProject(projectId);
    if (!project) {
      res.status(404).json({ error: "project not found" });
      return;
    }
    if (!project.estimateId && !project.invoiceId) {
      res.status(400).json({ error: "no documents" });
      return;
    }

    const files: Array<{
      kind: "estimate" | "invoice";
      downloadPath: string;
      remotePath: string;
      displayPath: string;
      fileName: string;
    }> = [];

    const kinds: Array<"estimate" | "invoice"> = [];
    if (project.estimateId) kinds.push("estimate");
    if (project.invoiceId) kinds.push("invoice");

    for (const kind of kinds) {
      try {
        await regenerateProjectPdfV1(projectId, kind);
      } catch {
        /* 既存ファイルがあれば続行 */
      }
      const localAbs = resolveProjectPdfFile(projectId, kind);
      if (!localAbs || !fs.existsSync(localAbs)) continue;
      const fileName = path.basename(localAbs);
      const remotePath = buildInvoicesEstimatesBackupRelativePathV1(fileName);
      const displayPath = buildInvoicesEstimatesBackupDisplayPathV1(fileName);
      const downloadPath =
        kind === "invoice"
          ? `/api/estimate/v1/projects/${encodeURIComponent(projectId)}/invoice/pdf?includePhotos=false`
          : `/api/estimate/v1/projects/${encodeURIComponent(projectId)}/pdf?includePhotos=false`;
      files.push({ kind, downloadPath, remotePath, displayPath, fileName });
    }

    const cfg = getQnapClientDirectConfigV1();
    res.json({
      ok: files.length > 0,
      projectId,
      saveRoute: getQnapSaveRouteV1(),
      clientDirect: {
        available: cfg.available,
        webdavUrl: cfg.webdavUrl,
        username: cfg.username,
        password: cfg.password,
        baseDir: cfg.baseDir,
        reason: cfg.reason ?? null,
      },
      files,
    });
  }
);

/**
 * 見積一覧「QNAP保存」—
 * 見積書準備済み / 請求書作成済み案件の PDF を
 * TiSLY_Storage/Invoices_Estimates/YYYY-MM/ へ実機 WebDAV 保存（モック不可）
 */
estimateV1Router.post(
  "/projects/:id/qnap-save-invoices-estimates",
  ...estimateV1Auth,
  async (req: AuthedRequest, res) => {
    if (!assertEstimateV1Role(req, res)) return;
    const projectId = String(req.params.id);
    const saveRoute = getQnapSaveRouteV1();

    // 案件存在確認を先に（保存ルート判定より優先）
    const project = getBusinessProject(projectId);
    if (!project) {
      res.status(404).json({
        ok: false,
        mock: false,
        projectId,
        message: "案件が見つかりません",
        files: [],
        error: "project not found",
        saveRoute,
      });
      return;
    }

    // local_wifi 専用モードでは VPS 経由保存をスキップし、クライアントへフォールバック指示
    if (saveRoute === "local_wifi") {
      res.status(503).json({
        ok: false,
        mock: false,
        projectId,
        message: "保存ルートが「ローカルWi-Fi経由」のため、ブラウザ直接保存を使用してください",
        files: [],
        error: "use_client_direct",
        saveRoute,
        clientDirectFallback: true,
      });
      return;
    }

    try {
      const result = await saveEstimateInvoicePdfsToQnapV1(projectId);
      if (result.error === "project not found") {
        res.status(404).json({ ...result, saveRoute });
        return;
      }
      if (
        result.error === "no documents" ||
        result.error === "qnap not configured"
      ) {
        res.status(400).json({ ...result, saveRoute });
        return;
      }
      if (!result.ok && saveRoute === "auto") {
        res.status(502).json({
          ...result,
          saveRoute,
          clientDirectFallback: true,
          message:
            result.message ||
            "VPS経由のQNAP保存に失敗しました。ローカルWi-Fi経由へフォールバックできます",
        });
        return;
      }
      res.status(result.ok ? 200 : 502).json({ ...result, saveRoute });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "qnap save failed";
      res.status(502).json({
        ok: false,
        mock: false,
        projectId,
        message: msg,
        files: [],
        error: msg,
        saveRoute,
        clientDirectFallback: saveRoute === "auto",
      });
    }
  }
);
