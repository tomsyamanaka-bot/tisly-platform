import fs from "fs";
import path from "path";
import { getDatabase } from "../db/database.js";
import {
  createBusinessProject,
  createCompletionReport,
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
import type {
  CustomerPriceRuleSummary,
  Estimate,
  EstimateLineItem,
  PricingCategory,
  PricingItem,
} from "../business/business-types.js";
import {
  applyCustomerPriceToItems,
  ensureBusinessCustomer,
  findManualPriceLineIndices,
  findPresetPriceRule,
  getCustomerPriceRuleOrDefault,
  listPresetPriceRuleOptions,
  MANUAL_PRICE_RULE_NAME,
  resolveEstimatePriceRule,
} from "../business/customer-price-rules.js";
import { applyPricingTierToItems, calcTotals, normalizeLineItems } from "../business/estimate-math.js";
import { generateTomsDailyDocNo } from "../business/toms-document-format.js";
import { generateEstimatePdf } from "../business/services/pdfService.js";
import { v4 as uuid } from "uuid";
import {
  renderPracticalCompletionReportHtml,
  type PracticalCompletionReportContext,
  type PracticalCompletionReportPhoto,
} from "./practical-completion-report-template.js";
import {
  renderSpecificationHtml,
  type SpecificationContext,
} from "./specification-template.js";
import {
  normalizeProjectStatus,
  statusAfterSurveyDone,
  statusAfterSurveySchedule,
} from "../business/business-status.js";
import { transitionProjectStatus } from "../business/business-workflow.js";
import {
  getSurveyProjectV1,
  getSurveyProjectV1Detail,
  listSurveyPhotosV1,
  updateSurveyProjectV1,
} from "../survey/survey-v1-store.js";
import { listCompletionPhotosV1 } from "./completion-photos-store.js";
import {
  SURVEY_MATERIAL_LABELS,
  SURVEY_TO_ESTIMATE_CATEGORY,
  type SurveyMaterialV1,
  type SurveyWorkflowStatus,
} from "../survey/survey-v1-types.js";
import { upsertProjectCaseChain } from "../projects/project-case-chain.js";
import { getMaterialV1 } from "../field-ops/materials-v1-store.js";
import {
  aggregateNeedsFromTemplates,
  listProjectWorkTemplateIds,
} from "../field-ops/work-templates-store.js";
import {
  buildWorkContentSummary,
  formatChecklistForPdf,
  getLatestWorkSessionForProject,
} from "../field-ops/work-session-v1-store.js";
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
  costPrice?: number;
}> {
  return materials.map((m) => ({
    category: SURVEY_TO_ESTIMATE_CATEGORY[m.category],
    name: m.itemLabel?.trim() || SURVEY_MATERIAL_LABELS[m.category],
    unit: m.category === "camera" ? "台" : "式",
    quantity: m.quantity,
  }));
}

function mapTemplateCategoryToEstimate(materialCategory: string | null, label: string): string {
  const cat = materialCategory ?? "";
  if (cat.includes("カメラ") || cat === "NVR" || cat === "HDD") return "camera";
  if (cat === "LAN") return "lan";
  if (cat.includes("Wi-Fi") || cat.includes("wifi")) return "ap";
  if (label.includes("インターホン")) return "intercom";
  if (cat === "電源") return "outlet";
  return "other";
}

function templateNeedsToEstimateRows(surveyProjectId: string): Array<{
  category: string;
  name: string;
  unit: string;
  quantity: number;
  costPrice: number;
}> {
  const templateIds = listProjectWorkTemplateIds({ source: "survey", projectId: surveyProjectId });
  if (!templateIds.length) return [];
  const needs = aggregateNeedsFromTemplates(templateIds).filter((n) => n.itemType === "material");
  return needs.map((n) => {
    const mat = n.materialId ? getMaterialV1(n.materialId) : null;
    return {
      category: mapTemplateCategoryToEstimate(n.category, n.label),
      name: mat?.name ?? n.label,
      unit: n.unit ?? mat?.unit ?? "式",
      quantity: n.qty,
      costPrice: mat?.cost ?? 0,
    };
  });
}

function buildEstimateSeedRows(surveyProjectId: string, materials: SurveyMaterialV1[]): Array<{
  category: string;
  name: string;
  unit: string;
  quantity: number;
  costPrice?: number;
}> {
  const fromTemplate = templateNeedsToEstimateRows(surveyProjectId);
  if (fromTemplate.length) return fromTemplate;
  const rows = materialsToEstimateRows(materials);
  if (rows.length) return rows;
  return [{ category: "other", name: "工事一式（現調ベース）", unit: "式", quantity: 1 }];
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
  const priceRule = estimate
    ? resolveEstimatePriceRule(estimate, project.customerId)
    : (() => {
        const row = getCustomerPriceRuleOrDefault(project.customerId);
        return {
          ruleName: row.ruleName,
          costMultiplier: row.costMultiplier,
          laborMultiplier: row.laborMultiplier,
          discountPolicyMemo: row.discountPolicyMemo,
        };
      })();
  return {
    businessProjectId: project.id,
    projectNo: project.projectNo,
    customerName: project.customerName,
    customerId: project.customerId,
    priceRule,
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
    const customerId = `BCU-SVY-${detail.customerCode}`;
    ensureBusinessCustomer({
      id: customerId,
      name: detail.customerName,
      type: "company",
    });
    project = createBusinessProject({
      customerId,
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
    const seedRows = buildEstimateSeedRows(surveyProjectId, detail.materials);
    const tiered = applyPricingTierToItems(seedRows, pricingItems).map((item, i) => ({
      ...item,
      costPrice: seedRows[i]?.costPrice ?? item.costPrice,
    }));
    const priceRule = getCustomerPriceRuleOrDefault(project.customerId);
    const items = applyCustomerPriceToItems(tiered, priceRule);
    createEstimate(project.id, items);
    project = getBusinessProject(project.id)!;
    if (project.estimateId) {
      persistEstimatePriceRule(project.estimateId, {
        ruleName: priceRule.ruleName,
        costMultiplier: priceRule.costMultiplier,
        laborMultiplier: priceRule.laborMultiplier,
      });
    }
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

export function listEstimatePriceRulePresetsV1() {
  return listPresetPriceRuleOptions();
}

function ruleForApply(
  existing: Estimate | null,
  customerId: string,
  priceRuleInput?: { ruleName: string; costMultiplier?: number | null; laborMultiplier?: number | null }
): CustomerPriceRuleSummary | null {
  if (priceRuleInput?.ruleName === MANUAL_PRICE_RULE_NAME) return null;
  if (priceRuleInput?.ruleName && priceRuleInput.costMultiplier != null) {
    return {
      ruleName: priceRuleInput.ruleName,
      costMultiplier: priceRuleInput.costMultiplier,
      laborMultiplier: priceRuleInput.laborMultiplier ?? priceRuleInput.costMultiplier,
      discountPolicyMemo: "",
    };
  }
  if (existing) {
    const resolved = resolveEstimatePriceRule(existing, customerId);
    if (resolved.ruleName === MANUAL_PRICE_RULE_NAME) return null;
    return resolved;
  }
  const customer = getCustomerPriceRuleOrDefault(customerId);
  return {
    ruleName: customer.ruleName,
    costMultiplier: customer.costMultiplier,
    laborMultiplier: customer.laborMultiplier,
    discountPolicyMemo: customer.discountPolicyMemo,
  };
}

function persistEstimatePriceRule(
  estimateId: string,
  priceRuleInput?: { ruleName: string; costMultiplier?: number | null; laborMultiplier?: number | null }
): void {
  if (!priceRuleInput?.ruleName) return;
  const preset = findPresetPriceRule(priceRuleInput.ruleName);
  const ruleName = priceRuleInput.ruleName;
  const costMult =
    priceRuleInput.costMultiplier !== undefined
      ? priceRuleInput.costMultiplier
      : (preset?.costMultiplier ?? null);
  const laborMult =
    priceRuleInput.laborMultiplier !== undefined
      ? priceRuleInput.laborMultiplier
      : (preset?.laborMultiplier ?? null);
  const applyPriceRule = ruleName !== MANUAL_PRICE_RULE_NAME ? 1 : 0;
  getDatabase()
    .prepare(
      `UPDATE business_estimates SET
        price_rule_name = ?, price_rule_cost_multiplier = ?, price_rule_labor_multiplier = ?,
        apply_price_rule = ?
       WHERE id = ?`
    )
    .run(ruleName, costMult, laborMult, applyPriceRule, estimateId);
}

export function updateEstimateItemsV1(
  businessProjectId: string,
  items: Partial<EstimateLineItem>[],
  opts?: {
    notes?: string;
    shuseiDiscount?: number;
    shuseiDiscountMemo?: string;
    applyPriceRule?: boolean;
    forceOverwriteManualLines?: boolean;
    priceRule?: { ruleName: string; costMultiplier?: number | null; laborMultiplier?: number | null };
  }
): { estimate: Estimate; totals: EstimateTotalsV1 } {
  const project = getBusinessProject(businessProjectId);
  if (!project?.estimateId) throw new Error("estimate not found");
  const existing = getEstimate(project.estimateId);
  let normalized = normalizeLineItems(items);
  if (opts?.applyPriceRule) {
    const priceRule = ruleForApply(existing, project.customerId, opts.priceRule);
    if (priceRule) {
      const manualIndices = findManualPriceLineIndices(normalized, priceRule);
      if (manualIndices.length > 0 && !opts.forceOverwriteManualLines) {
        const err = new Error("manual_price_lines");
        (err as Error & { manualLineIndices: number[] }).manualLineIndices = manualIndices;
        throw err;
      }
      normalized = applyCustomerPriceToItems(normalized, priceRule);
    }
  }
  const shuseiDiscount =
    opts?.shuseiDiscount !== undefined ? opts.shuseiDiscount : (existing?.shuseiDiscount ?? 0);
  const shuseiDiscountMemo =
    opts?.shuseiDiscountMemo !== undefined
      ? opts.shuseiDiscountMemo
      : (existing?.shuseiDiscountMemo ?? "");
  const totals = calcTotals(normalized, { shuseiDiscount });
  const now = new Date().toISOString();
  if (opts?.priceRule?.ruleName) {
    persistEstimatePriceRule(project.estimateId, opts.priceRule);
  }
  getDatabase()
    .prepare(
      `UPDATE business_estimates SET
        items_json = ?, subtotal = ?, tax = ?, total = ?,
        internal_cost = ?, gross_profit = ?, gross_profit_rate = ?,
        shusei_discount_amount = ?, shusei_discount_memo = ?,
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
      totals.shuseiDiscount,
      shuseiDiscountMemo,
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
  const doc = buildTomsEstimateDocument(project, detail.estimate, detail.header, {
    notes: project.surveyMemo ?? "",
    photosIncluded: opts?.includePhotos === true,
    priceRule: detail.priceRule ?? null,
    shuseiDiscount: detail.estimate.shuseiDiscount,
    shuseiDiscountMemo: detail.estimate.shuseiDiscountMemo,
  });
  return doc;
}

/** 現調写真（仕様書・完了報告書の reportPhotos 用） */
export function buildReportPhotosV1(businessProjectId: string): PracticalCompletionReportPhoto[] {
  const project = getBusinessProject(businessProjectId);
  if (!project) return [];
  const raw = project.surveyProjectId
    ? listSurveyPhotosV1(project.surveyProjectId)
        .filter((p) => !p.photoPath.startsWith("_memo:") && p.url)
        .map((p) => ({ url: p.url, title: p.title ?? p.comment ?? "" }))
    : (project.surveyPhotos || [])
        .filter((p) => p.urlPath)
        .map((p) => ({ url: p.urlPath, title: p.caption ?? "" }));
  return raw.map((p, i) => ({
    url: p.url,
    title: p.title.trim() || `写真${i + 1}`,
  }));
}

/** 完了報告書専用写真（現調写真とは別管理） */
export function buildCompletionPhotosV1(businessProjectId: string): PracticalCompletionReportPhoto[] {
  if (!getBusinessProject(businessProjectId)) return [];
  return listCompletionPhotosV1(businessProjectId).map((p, i) => ({
    url: p.url,
    title: p.title.trim() || `写真${i + 1}`,
  }));
}

export function buildSpecificationContextV1(businessProjectId: string): SpecificationContext | null {
  const project = getBusinessProject(businessProjectId);
  if (!project) return null;
  const survey = project.surveyProjectId ? getSurveyProjectV1Detail(project.surveyProjectId) : null;
  const estimate = project.estimateId ? getEstimate(project.estimateId) : null;
  const header = estimate?.header ?? null;
  return {
    addressee: header?.addressee ?? project.customerName,
    subject: header?.subject ?? estimate?.title ?? project.title,
    siteName: survey?.siteName ?? header?.siteName ?? project.title,
    workLocation: survey?.address ?? header?.workLocation ?? project.address,
    issueDate: header?.issueDate ?? survey?.surveyDate ?? "",
    estimateNo: header?.estimateNo ?? estimate?.estimateNo ?? "",
    staffName: survey?.assignee ?? header?.staffName ?? "",
    notes: survey?.notes ?? project.surveyMemo ?? "",
    photos: buildReportPhotosV1(businessProjectId),
  };
}

export function renderSpecificationHtmlV1(businessProjectId: string): string | null {
  const ctx = buildSpecificationContextV1(businessProjectId);
  if (!ctx) return null;
  return renderSpecificationHtml(ctx);
}

function formatSessionTime(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function buildCompletionReportContextV1(
  businessProjectId: string
): PracticalCompletionReportContext | null {
  const project = getBusinessProject(businessProjectId);
  if (!project) return null;
  const survey = project.surveyProjectId ? getSurveyProjectV1Detail(project.surveyProjectId) : null;
  const estimate = project.estimateId ? getEstimate(project.estimateId) : null;
  const header = estimate?.header ?? null;
  const ref = { source: "business" as const, projectId: businessProjectId };
  const session = getLatestWorkSessionForProject(ref);
  const worker = session?.workerName ?? survey?.assignee ?? header?.staffName ?? "";
  return {
    projectNo: project.projectNo,
    addressee: header?.addressee ?? project.customerName,
    subject: header?.subject ?? estimate?.title ?? project.title,
    siteName: survey?.siteName ?? project.title,
    workLocation: survey?.address ?? project.address,
    issueDate: header?.issueDate ?? new Date().toISOString().slice(0, 10),
    staffName: worker,
    startTime: formatSessionTime(session?.startTime),
    endTime: formatSessionTime(session?.completionTime),
    workContent: buildWorkContentSummary(ref),
    checklistSummary: formatChecklistForPdf(ref),
    notes: survey?.notes ?? project.surveyMemo ?? "",
    photos: buildCompletionPhotosV1(businessProjectId),
  };
}

export function renderCompletionReportHtmlV1(businessProjectId: string): string | null {
  const ctx = buildCompletionReportContextV1(businessProjectId);
  if (!ctx) return null;
  return renderPracticalCompletionReportHtml(ctx);
}

export function createCompletionReportV1(businessProjectId: string): { reportId: string } {
  const project = getBusinessProject(businessProjectId);
  if (!project) throw new Error("project not found");
  if (project.completionReportId) {
    return { reportId: project.completionReportId };
  }
  const ref = { source: "business" as const, projectId: businessProjectId };
  let status = normalizeProjectStatus(project.status);
  if (["estimate_created", "estimate_sent"].includes(status)) {
    transitionProjectStatus(businessProjectId, "construction_scheduled");
    status = "construction_scheduled";
  }
  if (status === "construction_scheduled") {
    transitionProjectStatus(businessProjectId, "construction_done");
  }
  const report = createCompletionReport(businessProjectId, {
    title: `${project.title} 完了報告`,
    workMemo: buildWorkContentSummary(ref),
  });
  return { reportId: report.id };
}

export function duplicateEstimateV1(businessProjectId: string): EstimateProjectV1Detail {
  const project = getBusinessProject(businessProjectId);
  if (!project?.estimateId) throw new Error("estimate not found");
  const est = getEstimate(project.estimateId)!;
  const normalized = normalizeLineItems(est.items);
  const totals = calcTotals(normalized, { shuseiDiscount: est.shuseiDiscount });
  const id = uuid();
  const estimateNo = generateTomsDailyDocNo("business_estimates", "estimate_no");
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO business_estimates (
        id, project_id, estimate_no, customer_name, title, items_json,
        subtotal, tax, total, internal_cost, gross_profit, gross_profit_rate,
        shusei_discount_amount, shusei_discount_memo,
        price_rule_name, price_rule_cost_multiplier, price_rule_labor_multiplier, apply_price_rule,
        pdf_path, header_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`
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
      totals.shuseiDiscount,
      est.shuseiDiscountMemo ?? "",
      est.priceRuleName ?? "",
      est.priceRuleCostMultiplier ?? null,
      est.priceRuleLaborMultiplier ?? null,
      est.applyPriceRule ? 1 : 0,
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

export interface StandaloneDocInputV1 {
  addressee: string;
  subject: string;
  workLocation?: string;
  items: Partial<EstimateLineItem>[];
}

function createStandaloneBusinessProjectV1(input: StandaloneDocInputV1) {
  const addressee = input.addressee.trim();
  const subject = input.subject.trim();
  if (!addressee) throw new Error("addressee is required");
  if (!subject) throw new Error("subject is required");
  const customerId = `BCU-EST-${uuid().slice(0, 8).toUpperCase()}`;
  ensureBusinessCustomer({ id: customerId, name: addressee, type: "company" });
  return createBusinessProject({
    customerId,
    customerName: addressee,
    title: subject,
    address: input.workLocation?.trim() ?? "",
  });
}

export function createStandaloneEstimateV1(
  input: StandaloneDocInputV1,
  createdBy?: string
): EstimateProjectV1Detail {
  const items = normalizeLineItems(input.items);
  if (!items.length) throw new Error("items required");
  const project = createStandaloneBusinessProjectV1(input);
  createEstimate(project.id, items);
  const refreshed = getBusinessProject(project.id)!;
  if (!refreshed.estimateId) throw new Error("estimate create failed");
  updateEstimateHeader(refreshed.estimateId, {
    addressee: input.addressee.trim(),
    subject: input.subject.trim(),
    workLocation: input.workLocation?.trim() ?? "",
    siteName: input.subject.trim(),
    staffName: createdBy ?? "",
    issueDate: new Date().toISOString().slice(0, 10),
  });
  return getEstimateProjectV1Detail(project.id)!;
}

export function createStandaloneInvoiceV1(
  input: StandaloneDocInputV1,
  createdBy?: string
): EstimateProjectV1Detail {
  const detail = createStandaloneEstimateV1(input, createdBy);
  createInvoiceFromEstimateV1(detail.businessProjectId);
  return getEstimateProjectV1Detail(detail.businessProjectId)!;
}
