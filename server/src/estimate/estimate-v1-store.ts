import fs from "fs";
import path from "path";
import { getDatabase } from "../db/database.js";
import {
  createBusinessProject,
  createEstimate,
  createInvoiceFromEstimate,
  getBusinessProject,
  getEstimate,
  getInvoice,
  saveBusinessPhoto,
  setEstimatePdfPath,
  setInvoicePdfPath,
  updateBusinessProject,
  updateEstimateHeader,
} from "../business/business-store.js";
import {
  buildTomsEstimateDocument,
  mergeEstimateHeader,
  type TomsEstimateHeader,
} from "../business/toms-document-format.js";
import { generateInvoicePdf } from "../business/services/pdfService.js";
import { listPricingRules } from "../business/business-pricing.js";
import type { Estimate, EstimateLineItem, PricingCategory, PricingItem } from "../business/business-types.js";
import { applyPricingTierToItems, calcTotals, normalizeLineItems } from "../business/estimate-math.js";
import { generateTomsDailyDocNo } from "../business/toms-document-format.js";
import { generateEstimatePdf } from "../business/services/pdfService.js";
import { v4 as uuid } from "uuid";
import {
  renderPracticalCompletionReportHtml,
  type PracticalCompletionReportContext,
} from "./practical-completion-report-template.js";
import { statusAfterSurveyDone, statusAfterSurveySchedule } from "../business/business-status.js";
import {
  getSurveyProjectV1,
  getSurveyProjectV1Detail,
  listSurveyPhotosV1,
  updateSurveyProjectV1,
} from "../survey/survey-v1-store.js";
import {
  SURVEY_MATERIAL_LABELS,
  SURVEY_TO_ESTIMATE_CATEGORY,
  type SurveyMaterialV1,
  type SurveyWorkflowStatus,
} from "../survey/survey-v1-types.js";
import { upsertProjectCaseChain } from "../projects/project-case-chain.js";
import type {
  EstimateHeaderInputV1,
  EstimatePendingSurveyV1,
  EstimateProjectV1Detail,
  EstimateProjectV1Summary,
  EstimateTotalsV1,
  TomsEstimateFormatV1,
} from "./estimate-v1-types.js";

function pricingRulesToItems(): PricingItem[] {
  return listPricingRules({ activeOnly: true }).map((r) => ({
    id: r.id,
    category: r.workCategory as PricingCategory,
    name: r.name,
    unit: r.unit,
    defaultUnitPrice: r.unitPrice,
    costPrice: r.costPrice,
    taxType: r.taxType,
    memo: r.memo,
  }));
}

function materialsToEstimateRows(materials: SurveyMaterialV1[]): Array<{
  category: string;
  name: string;
  unit: string;
  quantity: number;
}> {
  return materials.map((m) => ({
    category: SURVEY_TO_ESTIMATE_CATEGORY[m.category],
    name: m.itemLabel?.trim() || SURVEY_MATERIAL_LABELS[m.category],
    unit: m.category === "camera" ? "台" : "式",
    quantity: m.quantity,
  }));
}

function copyV1PhotosToBusiness(businessProjectId: string, surveyProjectId: string): number {
  const photos = listSurveyPhotosV1(surveyProjectId);
  const copied: Array<ReturnType<typeof saveBusinessPhoto> & { caption?: string }> = [];
  for (const ph of photos.slice(0, 20)) {
    if (ph.photoPath.startsWith("_memo:")) continue;
    const src = path.join(process.cwd(), "uploads", "survey", ph.photoPath);
    if (!fs.existsSync(src)) continue;
    const buf = fs.readFileSync(src);
    const saved = saveBusinessPhoto(
      businessProjectId,
      "survey",
      buf.toString("base64"),
      path.basename(src)
    );
    copied.push({ ...saved, caption: ph.title ?? ph.comment ?? undefined });
  }
  if (copied.length) {
    updateBusinessProject(businessProjectId, { surveyPhotos: copied });
  }
  return copied.length;
}

function findBusinessProjectBySurveyId(surveyProjectId: string): string | null {
  const row = getDatabase()
    .prepare(`SELECT id FROM business_projects WHERE survey_project_id = ? LIMIT 1`)
    .get(surveyProjectId) as { id: string } | undefined;
  return row?.id ?? null;
}

function updateHandoffBusinessProjectId(surveyProjectId: string, businessProjectId: string): void {
  getDatabase()
    .prepare(
      `UPDATE survey_handoff_log SET business_project_id = ? WHERE survey_project_id = ?`
    )
    .run(businessProjectId, surveyProjectId);
}

export function listPendingSurveysV1(opts?: { customerCode?: string }): EstimatePendingSurveyV1[] {
  const clauses = ["sp.workflow_status = 'estimate_pending'"];
  const params: unknown[] = [];
  if (opts?.customerCode) {
    clauses.push("sp.customer_code = ?");
    params.push(opts.customerCode.toUpperCase());
  }
  const rows = getDatabase()
    .prepare(
      `SELECT sp.project_id, sp.project_no, sp.customer_code, sp.customer_name, sp.address, sp.survey_date,
              hl.handoff_at, hl.business_project_id,
              (SELECT COUNT(*) FROM survey_materials sm WHERE sm.project_id = sp.project_id) as material_count,
              (SELECT COUNT(*) FROM survey_photos sph WHERE sph.project_id = sp.project_id) as photo_count
       FROM survey_projects sp
       LEFT JOIN survey_handoff_log hl ON hl.survey_project_id = sp.project_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY sp.updated_at DESC`
    )
    .all(...params) as Record<string, unknown>[];

  return rows.map((r) => {
    const businessProjectId =
      r.business_project_id != null && String(r.business_project_id) !== ""
        ? String(r.business_project_id)
        : findBusinessProjectBySurveyId(String(r.project_id));
    let hasEstimate = false;
    if (businessProjectId) {
      const bp = getBusinessProject(businessProjectId);
      hasEstimate = Boolean(bp?.estimateId);
    }
    return {
      surveyProjectId: String(r.project_id),
      projectNo: r.project_no != null ? String(r.project_no) : null,
      customerCode: String(r.customer_code),
      customerName: String(r.customer_name ?? ""),
      address: r.address != null ? String(r.address) : null,
      surveyDate: r.survey_date != null ? String(r.survey_date) : null,
      materialCount: Number(r.material_count ?? 0),
      photoCount: Number(r.photo_count ?? 0),
      handoffAt: r.handoff_at != null ? String(r.handoff_at) : null,
      businessProjectId,
      hasEstimate,
    };
  });
}

export function listEstimateProjectsV1(opts?: { customerCode?: string }): EstimateProjectV1Summary[] {
  const clauses = ["bp.survey_project_id IS NOT NULL"];
  const params: unknown[] = [];
  if (opts?.customerCode) {
    clauses.push("sp.customer_code = ?");
    params.push(opts.customerCode.toUpperCase());
  }
  const rows = getDatabase()
    .prepare(
      `SELECT bp.id, bp.project_no, bp.customer_name, bp.title, bp.survey_project_id, bp.estimate_id, bp.updated_at,
              sp.workflow_status,
              be.estimate_no, be.subtotal, be.total, be.pdf_path
       FROM business_projects bp
       INNER JOIN survey_projects sp ON sp.project_id = bp.survey_project_id
       LEFT JOIN business_estimates be ON be.id = bp.estimate_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY bp.updated_at DESC`
    )
    .all(...params) as Record<string, unknown>[];

  return rows.map((r) => ({
    businessProjectId: String(r.id),
    projectNo: String(r.project_no),
    customerName: String(r.customer_name),
    title: String(r.title),
    surveyProjectId: r.survey_project_id != null ? String(r.survey_project_id) : null,
    estimateId: r.estimate_id != null ? String(r.estimate_id) : null,
    estimateNo: r.estimate_no != null ? String(r.estimate_no) : null,
    subtotal: r.subtotal != null ? Number(r.subtotal) : null,
    total: r.total != null ? Number(r.total) : null,
    pdfPath: r.pdf_path != null ? String(r.pdf_path) : null,
    surveyWorkflowStatus: r.workflow_status != null ? (String(r.workflow_status) as SurveyWorkflowStatus) : null,
    updatedAt: String(r.updated_at),
  }));
}

export function getEstimateProjectV1Detail(businessProjectId: string): EstimateProjectV1Detail | null {
  const project = getBusinessProject(businessProjectId);
  if (!project) return null;
  const estimate = project.estimateId ? getEstimate(project.estimateId) : null;
  const invoice = project.invoiceId ? getInvoice(project.invoiceId) : null;
  const survey = project.surveyProjectId ? getSurveyProjectV1(project.surveyProjectId) : null;
  const pdfCtx = estimate
    ? {
        siteName: survey?.siteName ?? project.title,
        workLocation: survey?.siteName || survey?.address || project.address,
        address: survey?.address ?? project.address,
        phone: survey?.phone ?? project.phone,
        email: survey?.email ?? "",
      }
    : null;
  const header =
    estimate && pdfCtx
      ? mergeEstimateHeader(estimate, estimate.header ?? null, pdfCtx)
      : null;
  return {
    businessProjectId: project.id,
    projectNo: project.projectNo,
    customerName: project.customerName,
    title: project.title,
    address: project.address,
    phone: project.phone,
    siteName: survey?.siteName ?? project.title,
    customerAddress: survey?.customerAddress ?? null,
    contactName: survey?.assignee ?? null,
    email: survey?.email ?? null,
    estimateNotes: project.surveyMemo || null,
    header,
    surveyProjectId: project.surveyProjectId,
    surveyWorkflowStatus: survey?.workflowStatus ?? null,
    estimate,
    invoice,
    pdfPath: estimate?.pdfPath ?? null,
    tomsFormatReady: Boolean(estimate),
  };
}

export function createEstimateFromSurveyV1(
  surveyProjectId: string,
  createdBy?: string
): EstimateProjectV1Detail {
  const detail = getSurveyProjectV1Detail(surveyProjectId);
  if (!detail) throw new Error("survey project not found");
  if (detail.workflowStatus !== "estimate_pending") {
    throw new Error("survey project must be estimate_pending");
  }

  let businessProjectId = findBusinessProjectBySurveyId(surveyProjectId);
  if (!businessProjectId) {
    const handoffRow = getDatabase()
      .prepare(`SELECT business_project_id FROM survey_handoff_log WHERE survey_project_id = ?`)
      .get(surveyProjectId) as { business_project_id: string } | undefined;
    if (handoffRow?.business_project_id) {
      businessProjectId = handoffRow.business_project_id || null;
    }
  }

  let project = businessProjectId ? getBusinessProject(businessProjectId) : null;

  if (!project) {
    project = createBusinessProject({
      customerId: `BCU-SVY-${detail.customerCode}`,
      customerName: detail.customerName,
      title: detail.siteName || detail.customerName,
      address: detail.address ?? "",
      phone: detail.phone ?? "",
      surveyProjectId,
    });
    businessProjectId = project.id;

    const photoCount = copyV1PhotosToBusiness(project.id, surveyProjectId);
    const memoParts = [
      `現調PWA v1 連携 (${surveyProjectId})`,
      detail.notes ? `メモ: ${detail.notes}` : "",
      `部材${detail.materials.length}件`,
      photoCount ? `写真${photoCount}枚` : "",
      createdBy ? `作成: ${createdBy}` : "",
    ].filter(Boolean);

    updateBusinessProject(project.id, {
      surveyMemo: memoParts.join(" / "),
      status: statusAfterSurveySchedule(),
    });
    updateBusinessProject(project.id, { status: statusAfterSurveyDone() });
    updateHandoffBusinessProjectId(surveyProjectId, project.id);
  }

  if (!project.estimateId) {
    const pricingItems = pricingRulesToItems();
    const rows = materialsToEstimateRows(detail.materials);
    const seedRows =
      rows.length > 0
        ? rows
        : [{ category: "other", name: "工事一式（現調ベース）", unit: "式", quantity: 1 }];
    const items = applyPricingTierToItems(seedRows, pricingItems);
    createEstimate(project.id, items);
    project = getBusinessProject(project.id)!;
    updateEstimateHeader(project.estimateId!, {
      addressee: detail.customerName,
      subject: detail.siteName || detail.customerName,
      workLocation: detail.siteName || detail.address || project.address,
      address: detail.address ?? project.address,
      phone: detail.phone ?? project.phone,
      email: detail.email ?? "",
    });
  }

  upsertProjectCaseChain({
    surveyProjectId,
    businessProjectId: project.id,
    customerCode: detail.customerCode,
  });

  return getEstimateProjectV1Detail(project.id)!;
}

export function updateEstimateItemsV1(
  businessProjectId: string,
  items: Partial<EstimateLineItem>[],
  opts?: { notes?: string }
): { estimate: Estimate; totals: EstimateTotalsV1 } {
  const project = getBusinessProject(businessProjectId);
  if (!project?.estimateId) throw new Error("estimate not found");
  const normalized = normalizeLineItems(items);
  const totals = calcTotals(normalized);
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `UPDATE business_estimates SET
        items_json = ?, subtotal = ?, tax = ?, total = ?,
        internal_cost = ?, gross_profit = ?, gross_profit_rate = ?,
        pdf_path = NULL, updated_at = ?
       WHERE id = ?`
    )
    .run(
      JSON.stringify(normalized),
      totals.subtotal,
      totals.tax,
      totals.total,
      totals.internalCost,
      totals.grossProfit,
      totals.grossProfitRate,
      now,
      project.estimateId
    );
  if (opts?.notes !== undefined) {
    updateBusinessProject(businessProjectId, { surveyMemo: opts.notes });
  }
  const estimate = getEstimate(project.estimateId)!;
  return { estimate, totals };
}

export function getEstimatePdfContextV1(
  businessProjectId: string,
  opts?: { includePhotos?: boolean }
) {
  const project = getBusinessProject(businessProjectId);
  if (!project) return null;
  const survey = project.surveyProjectId ? getSurveyProjectV1(project.surveyProjectId) : null;
  const estimate = project.estimateId ? getEstimate(project.estimateId) : null;
  return {
    siteName: survey?.siteName ?? project.title,
    workLocation: survey?.address ?? project.address,
    customerAddress: survey?.customerAddress ?? null,
    contactName: survey?.assignee ?? null,
    phone: survey?.phone ?? project.phone,
    email: survey?.email ?? null,
    notes: project.surveyMemo || null,
    header: estimate?.header ?? null,
    includePhotos: opts?.includePhotos,
  };
}

export function updateEstimateHeaderV1(
  businessProjectId: string,
  header: EstimateHeaderInputV1
): TomsEstimateHeader {
  const project = getBusinessProject(businessProjectId);
  if (!project?.estimateId) throw new Error("estimate not found");
  const updated = updateEstimateHeader(project.estimateId, header);
  return updated.header!;
}

export function finalizeEstimateV1(
  businessProjectId: string,
  opts?: { includePhotos?: boolean }
): {
  estimate: Estimate;
  pdfPath: string;
  surveyWorkflowStatus: SurveyWorkflowStatus;
} {
  const project = getBusinessProject(businessProjectId);
  if (!project?.estimateId) throw new Error("estimate not found");
  const estimate = getEstimate(project.estimateId)!;
  const pdfCtx = getEstimatePdfContextV1(businessProjectId, {
    includePhotos: opts?.includePhotos === true,
  }) ?? undefined;
  const pdfPath = generateEstimatePdf(project, estimate, pdfCtx);
  setEstimatePdfPath(estimate.id, pdfPath);

  if (project.surveyProjectId) {
    updateSurveyProjectV1(project.surveyProjectId, { workflowStatus: "estimate_done" });
  }

  return {
    estimate: getEstimate(estimate.id)!,
    pdfPath,
    surveyWorkflowStatus: "estimate_done",
  };
}

export function buildTomsFormatPreviewV1(
  businessProjectId: string,
  opts?: { includePhotos?: boolean }
): TomsEstimateFormatV1 {
  const project = getBusinessProject(businessProjectId);
  const detail = getEstimateProjectV1Detail(businessProjectId);
  if (!project || !detail?.estimate || !detail.header) throw new Error("estimate not found");
  return buildTomsEstimateDocument(project, detail.estimate, detail.header, {
    notes: project.surveyMemo ?? "",
    photosIncluded: opts?.includePhotos === true,
  });
}

export function buildCompletionReportContextV1(
  businessProjectId: string
): PracticalCompletionReportContext | null {
  const project = getBusinessProject(businessProjectId);
  if (!project) return null;
  const survey = project.surveyProjectId ? getSurveyProjectV1(project.surveyProjectId) : null;
  const estimate = project.estimateId ? getEstimate(project.estimateId) : null;
  const header = estimate?.header ?? null;
  const photos = project.surveyProjectId
    ? listSurveyPhotosV1(project.surveyProjectId)
        .filter((p) => !p.photoPath.startsWith("_memo:") && p.url)
        .map((p) => ({
          url: p.url,
          title: p.title ?? p.comment ?? "",
        }))
    : (project.surveyPhotos || []).map((p) => ({
        url: p.urlPath,
        title: p.caption ?? "",
      }));
  return {
    projectNo: project.projectNo,
    addressee: header?.addressee ?? project.customerName,
    siteName: survey?.siteName ?? project.title,
    workLocation: survey?.address ?? project.address,
    workDate: survey?.surveyDate ?? header?.issueDate ?? "",
    staffName: header?.staffName ?? survey?.assignee ?? "",
    photos,
  };
}

export function renderCompletionReportHtmlV1(businessProjectId: string): string | null {
  const ctx = buildCompletionReportContextV1(businessProjectId);
  if (!ctx) return null;
  return renderPracticalCompletionReportHtml(ctx);
}

export function duplicateEstimateV1(businessProjectId: string): EstimateProjectV1Detail {
  const project = getBusinessProject(businessProjectId);
  if (!project?.estimateId) throw new Error("estimate not found");
  const est = getEstimate(project.estimateId)!;
  const normalized = normalizeLineItems(est.items);
  const totals = calcTotals(normalized);
  const id = uuid();
  const estimateNo = generateTomsDailyDocNo("business_estimates", "estimate_no");
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO business_estimates (
        id, project_id, estimate_no, customer_name, title, items_json,
        subtotal, tax, total, internal_cost, gross_profit, gross_profit_rate,
        pdf_path, header_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`
    )
    .run(
      id,
      businessProjectId,
      estimateNo,
      est.customerName,
      est.title,
      JSON.stringify(normalized),
      totals.subtotal,
      totals.tax,
      totals.total,
      totals.internalCost,
      totals.grossProfit,
      totals.grossProfitRate,
      est.header ? JSON.stringify(est.header) : null,
      now,
      now
    );
  updateBusinessProject(businessProjectId, {
    estimateId: id,
    invoiceId: null,
  });
  return getEstimateProjectV1Detail(businessProjectId)!;
}

export function createInvoiceFromEstimateV1(businessProjectId: string): {
  invoice: NonNullable<ReturnType<typeof getInvoice>>;
  pdfPath: string;
} {
  const project = getBusinessProject(businessProjectId);
  if (!project?.estimateId) throw new Error("estimate not found");
  const estimate = getEstimate(project.estimateId)!;
  let invoice = project.invoiceId ? getInvoice(project.invoiceId) : null;
  if (!invoice) {
    invoice = createInvoiceFromEstimate(businessProjectId);
  }
  const pdfPath = generateInvoicePdf(project, invoice, estimate);
  setInvoicePdfPath(invoice.id, pdfPath);
  return { invoice: getInvoice(invoice.id)!, pdfPath };
}
