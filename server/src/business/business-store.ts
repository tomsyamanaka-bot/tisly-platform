import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import {
  assertTransition,
  canTransitionStatus,
  expandStatusAliases,
  normalizeProjectStatus,
  statusAfterAccepted,
  statusAfterCompletionReport,
  statusAfterConstructionDone,
  statusAfterConstructionSchedule,
  statusAfterEstimateCreated,
  statusAfterInvoiceCreated,
  statusAfterPaid,
  statusAfterPaymentScheduled,
  statusAfterSurveyDone,
  statusAfterSurveySchedule,
} from "./business-status.js";
import {
  aiRecommendedToDraftLines,
  calcTotals,
  normalizeLineItems,
} from "./estimate-math.js";
import type {
  AiEstimateCandidate,
  BusinessPhoto,
  BusinessProject,
  BusinessProjectStatus,
  CalendarDraft,
  CompletionReport,
  ConstructionSchedule,
  Customer,
  Estimate,
  EstimateLineItem,
  Invoice,
  MailDraft,
  PricingItem,
  PricingTier,
  QnapSavePlan,
  SurveySchedule,
} from "./business-types.js";
import { generateQnapProjectPath } from "./services/qnapService.js";

let projectNoSeq = 0;

function nextProjectNo(): string {
  const year = new Date().getFullYear();
  projectNoSeq += 1;
  const row = getDatabase()
    .prepare(`SELECT COUNT(*) as c FROM business_projects WHERE project_no LIKE ?`)
    .get(`PRJ-${year}-%`) as { c: number };
  const n = (row?.c ?? 0) + projectNoSeq;
  return `PRJ-${year}-${String(n).padStart(4, "0")}`;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function rowToProject(r: Record<string, unknown>): BusinessProject {
  return {
    id: String(r.id),
    projectNo: String(r.project_no),
    customerId: String(r.customer_id),
    customerName: String(r.customer_name),
    title: String(r.title),
    address: String(r.address ?? ""),
    phone: String(r.phone ?? ""),
    status: normalizeProjectStatus(String(r.status)),
    surveySchedule: parseJson<SurveySchedule | null>(r.survey_schedule_json as string, null),
    surveyMemo: String(r.survey_memo ?? ""),
    surveyPhotos: parseJson<BusinessPhoto[]>(r.survey_photos_json as string, []),
    estimateId: r.estimate_id != null ? String(r.estimate_id) : null,
    constructionSchedule: parseJson<ConstructionSchedule | null>(
      r.construction_schedule_json as string,
      null
    ),
    requiredMaterials: String(r.required_materials ?? ""),
    constructionMemo: String(r.construction_memo ?? ""),
    constructionPhotos: parseJson<BusinessPhoto[]>(r.construction_photos_json as string, []),
    completionReportId:
      r.completion_report_id != null ? String(r.completion_report_id) : null,
    invoiceId: r.invoice_id != null ? String(r.invoice_id) : null,
    paymentDueDate: r.payment_due_date != null ? String(r.payment_due_date) : null,
    paidDate: r.paid_date != null ? String(r.paid_date) : null,
    qnapBasePath: String(r.qnap_base_path ?? ""),
    surveyProjectId: r.survey_project_id != null ? String(r.survey_project_id) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function businessUploadsDir(projectId: string, folder: string): string {
  const dir = path.join(process.cwd(), "uploads", "business", projectId, folder);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function listBusinessProjects(): BusinessProject[] {
  const rows = getDatabase()
    .prepare(`SELECT * FROM business_projects ORDER BY updated_at DESC`)
    .all() as Record<string, unknown>[];
  return rows.map(rowToProject);
}

export function getBusinessProject(id: string): BusinessProject | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM business_projects WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToProject(row) : null;
}

export function createBusinessProject(input: {
  customerId: string;
  customerName: string;
  title: string;
  address?: string;
  phone?: string;
  surveyProjectId?: string;
}): BusinessProject {
  const id = `BIZ-${uuid().slice(0, 8).toUpperCase()}`;
  const projectNo = nextProjectNo();
  const now = new Date().toISOString();
  const stub = {
    id,
    projectNo,
    customerId: input.customerId,
    customerName: input.customerName,
    title: input.title,
    address: input.address ?? "",
    phone: input.phone ?? "",
    status: "new" as BusinessProjectStatus,
    createdAt: now,
  };
  const qnapBasePath = generateQnapProjectPath(stub as BusinessProject);
  getDatabase()
    .prepare(
      `INSERT INTO business_projects (
        id, project_no, customer_id, customer_name, title, address, phone, status,
        survey_schedule_json, survey_memo, survey_photos_json, estimate_id,
        construction_schedule_json, required_materials, construction_memo, construction_photos_json,
        completion_report_id, invoice_id, payment_due_date, paid_date, qnap_base_path,
        survey_project_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'new', NULL, '', '[]', NULL, NULL, '', '', '[]', NULL, NULL, NULL, NULL, ?, ?, ?, ?)`
    )
    .run(
      id,
      projectNo,
      input.customerId,
      input.customerName,
      input.title,
      input.address ?? "",
      input.phone ?? "",
      qnapBasePath,
      input.surveyProjectId ?? null,
      now,
      now
    );
  return getBusinessProject(id)!;
}

export function updateBusinessProject(
  id: string,
  patch: Partial<{
    title: string;
    address: string;
    phone: string;
    customerName: string;
    status: BusinessProjectStatus;
    surveySchedule: SurveySchedule | null;
    surveyMemo: string;
    surveyPhotos: BusinessPhoto[];
    constructionSchedule: ConstructionSchedule | null;
    requiredMaterials: string;
    constructionMemo: string;
    constructionPhotos: BusinessPhoto[];
    paymentDueDate: string | null;
    paidDate: string | null;
    estimateId: string | null;
    completionReportId: string | null;
    invoiceId: string | null;
  }>
): BusinessProject {
  const current = getBusinessProject(id);
  if (!current) throw new Error("project not found");
  if (patch.status && patch.status !== current.status) {
    assertTransition(current.status, patch.status);
  }
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `UPDATE business_projects SET
        title = COALESCE(?, title),
        address = COALESCE(?, address),
        phone = COALESCE(?, phone),
        customer_name = COALESCE(?, customer_name),
        status = COALESCE(?, status),
        survey_schedule_json = COALESCE(?, survey_schedule_json),
        survey_memo = COALESCE(?, survey_memo),
        survey_photos_json = COALESCE(?, survey_photos_json),
        construction_schedule_json = COALESCE(?, construction_schedule_json),
        required_materials = COALESCE(?, required_materials),
        construction_memo = COALESCE(?, construction_memo),
        construction_photos_json = COALESCE(?, construction_photos_json),
        payment_due_date = COALESCE(?, payment_due_date),
        paid_date = COALESCE(?, paid_date),
        estimate_id = COALESCE(?, estimate_id),
        completion_report_id = COALESCE(?, completion_report_id),
        invoice_id = COALESCE(?, invoice_id),
        updated_at = ?
      WHERE id = ?`
    )
    .run(
      patch.title ?? null,
      patch.address ?? null,
      patch.phone ?? null,
      patch.customerName ?? null,
      patch.status ?? null,
      patch.surveySchedule != null ? JSON.stringify(patch.surveySchedule) : null,
      patch.surveyMemo ?? null,
      patch.surveyPhotos != null ? JSON.stringify(patch.surveyPhotos) : null,
      patch.constructionSchedule != null ? JSON.stringify(patch.constructionSchedule) : null,
      patch.requiredMaterials ?? null,
      patch.constructionMemo ?? null,
      patch.constructionPhotos != null ? JSON.stringify(patch.constructionPhotos) : null,
      patch.paymentDueDate !== undefined ? patch.paymentDueDate : null,
      patch.paidDate !== undefined ? patch.paidDate : null,
      patch.estimateId !== undefined ? patch.estimateId : null,
      patch.completionReportId !== undefined ? patch.completionReportId : null,
      patch.invoiceId !== undefined ? patch.invoiceId : null,
      now,
      id
    );
  return getBusinessProject(id)!;
}

export function saveBusinessPhoto(
  projectId: string,
  kind: "survey" | "construction" | "report_before" | "report_after",
  imageBase64: string,
  fileName: string
): BusinessPhoto {
  const project = getBusinessProject(projectId);
  if (!project) throw new Error("project not found");
  const folder =
    kind === "survey"
      ? "survey"
      : kind === "construction"
        ? "construction"
        : kind === "report_before"
          ? "report_before"
          : "report_after";
  const dir = businessUploadsDir(projectId, folder);
  const ext = path.extname(fileName) || ".jpg";
  const id = uuid();
  const outName = `${id}${ext}`;
  const filePath = path.join(dir, outName);
  const buf = Buffer.from(imageBase64, "base64");
  fs.writeFileSync(filePath, buf);
  const photo: BusinessPhoto = {
    id,
    fileName: outName,
    urlPath: `/uploads/business/${projectId}/${folder}/${outName}`,
    takenAt: new Date().toISOString(),
  };
  if (kind === "survey") {
    updateBusinessProject(projectId, {
      surveyPhotos: [...project.surveyPhotos, photo],
      status: project.status === "survey_scheduled" ? statusAfterSurveyDone() : project.status,
    });
  } else if (kind === "construction") {
    updateBusinessProject(projectId, {
      constructionPhotos: [...project.constructionPhotos, photo],
    });
  }
  return photo;
}

export function setSurveySchedule(projectId: string, schedule: SurveySchedule): BusinessProject {
  const p = getBusinessProject(projectId);
  if (!p) throw new Error("project not found");
  return updateBusinessProject(projectId, {
    surveySchedule: schedule,
    status: statusAfterSurveySchedule(),
  });
}

export function markSurveyDone(projectId: string, memo?: string): BusinessProject {
  const patch: Parameters<typeof updateBusinessProject>[1] = {
    status: statusAfterSurveyDone(),
  };
  if (memo != null) patch.surveyMemo = memo;
  return updateBusinessProject(projectId, patch);
}

export function setConstructionSchedule(
  projectId: string,
  schedule: ConstructionSchedule,
  requiredMaterials?: string,
  memo?: string
): BusinessProject {
  const patch: Parameters<typeof updateBusinessProject>[1] = {
    constructionSchedule: schedule,
    status: statusAfterConstructionSchedule(),
  };
  if (requiredMaterials != null) patch.requiredMaterials = requiredMaterials;
  if (memo != null) patch.constructionMemo = memo;
  return updateBusinessProject(projectId, patch);
}

export function markConstructionDone(projectId: string): BusinessProject {
  return updateBusinessProject(projectId, { status: statusAfterConstructionDone() });
}

export function markAccepted(projectId: string): BusinessProject {
  const p = getBusinessProject(projectId);
  if (!p) throw new Error("project not found");
  if (canTransitionStatus(p.status, statusAfterConstructionSchedule())) {
    return updateBusinessProject(projectId, { status: statusAfterConstructionSchedule() });
  }
  return updateBusinessProject(projectId, { status: statusAfterAccepted() });
}

export function markPaid(projectId: string, paidDate?: string): BusinessProject {
  return updateBusinessProject(projectId, {
    status: statusAfterPaid(),
    paidDate: paidDate ?? new Date().toISOString().slice(0, 10),
  });
}

export function setPaymentDue(projectId: string, dueDate: string): BusinessProject {
  return updateBusinessProject(projectId, {
    paymentDueDate: dueDate,
  });
}

// --- Customers ---

export function listCustomers(): Customer[] {
  return getDatabase()
    .prepare(`SELECT * FROM business_customers ORDER BY name`)
    .all()
    .map((r) => rowToCustomer(r as Record<string, unknown>));
}

function rowToCustomer(r: Record<string, unknown>): Customer {
  return {
    id: String(r.id),
    name: String(r.name),
    type: String(r.type) as Customer["type"],
    contactName: String(r.contact_name ?? ""),
    phone: String(r.phone ?? ""),
    email: String(r.email ?? ""),
    address: String(r.address ?? ""),
    pricingTierId: r.pricing_tier_id != null ? String(r.pricing_tier_id) : null,
    paymentTerms: String(r.payment_terms ?? ""),
    invoiceClosingDay:
      r.invoice_closing_day != null ? Number(r.invoice_closing_day) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function getCustomer(id: string): Customer | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM business_customers WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToCustomer(row) : null;
}

export function createCustomer(input: Omit<Customer, "id" | "createdAt" | "updatedAt">): Customer {
  const id = `BCU-${uuid().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO business_customers (
        id, name, type, contact_name, phone, email, address, pricing_tier_id,
        payment_terms, invoice_closing_day, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.name,
      input.type,
      input.contactName,
      input.phone,
      input.email,
      input.address,
      input.pricingTierId,
      input.paymentTerms,
      input.invoiceClosingDay,
      now,
      now
    );
  return getCustomer(id)!;
}

// --- Pricing ---

export function listPricingTiers(): PricingTier[] {
  return getDatabase()
    .prepare(`SELECT * FROM business_pricing_tiers ORDER BY name`)
    .all()
    .map((r) => rowToTier(r as Record<string, unknown>));
}

function rowToTier(r: Record<string, unknown>): PricingTier {
  return {
    id: String(r.id),
    name: String(r.name),
    customerId: r.customer_id != null ? String(r.customer_id) : null,
    items: parseJson<PricingItem[]>(r.items_json as string, []),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function getPricingTier(id: string): PricingTier | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM business_pricing_tiers WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToTier(row) : null;
}

export function getPricingItemsForCustomer(customerId: string): PricingItem[] {
  const customer = getCustomer(customerId);
  if (!customer?.pricingTierId) {
    const defaultTier = getDatabase()
      .prepare(`SELECT * FROM business_pricing_tiers WHERE customer_id IS NULL LIMIT 1`)
      .get() as Record<string, unknown> | undefined;
    return defaultTier ? rowToTier(defaultTier).items : [];
  }
  return getPricingTier(customer.pricingTierId)?.items ?? [];
}

// --- Estimates ---

function rowToEstimate(r: Record<string, unknown>): Estimate {
  const items = parseJson<Estimate["items"]>(r.items_json as string, []);
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    estimateNo: String(r.estimate_no),
    customerName: String(r.customer_name),
    title: String(r.title),
    items,
    subtotal: Number(r.subtotal),
    tax: Number(r.tax),
    total: Number(r.total),
    internalCost: Number(r.internal_cost),
    grossProfit: Number(r.gross_profit),
    grossProfitRate: Number(r.gross_profit_rate),
    pdfPath: r.pdf_path != null ? String(r.pdf_path) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function setEstimatePdfPath(estimateId: string, pdfPath: string): void {
  getDatabase()
    .prepare(`UPDATE business_estimates SET pdf_path = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(pdfPath, estimateId);
}

export function setInvoicePdfPath(invoiceId: string, pdfPath: string): void {
  getDatabase()
    .prepare(`UPDATE business_invoices SET pdf_path = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(pdfPath, invoiceId);
}

export function setCompletionReportPdfPath(reportId: string, pdfPath: string): void {
  getDatabase()
    .prepare(
      `UPDATE business_completion_reports SET pdf_path = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .run(pdfPath, reportId);
}

export function getEstimate(id: string): Estimate | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM business_estimates WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToEstimate(row) : null;
}

function ensureEstimateReadyStatus(projectId: string): void {
  const project = getBusinessProject(projectId);
  if (!project) throw new Error("project not found");
  if (canTransitionStatus(project.status, statusAfterEstimateCreated())) return;
  if (project.status === "new") {
    updateBusinessProject(projectId, { status: statusAfterSurveySchedule() });
    updateBusinessProject(projectId, { status: statusAfterSurveyDone() });
    return;
  }
  if (project.status === "survey_scheduled") {
    updateBusinessProject(projectId, { status: statusAfterSurveyDone() });
  }
}

export function createEstimate(
  projectId: string,
  items: Estimate["items"],
  opts?: { fromAi?: boolean }
): Estimate {
  const project = getBusinessProject(projectId);
  if (!project) throw new Error("project not found");
  ensureEstimateReadyStatus(projectId);
  const normalized = normalizeLineItems(items);
  const totals = calcTotals(normalized);
  const id = uuid();
  const year = new Date().getFullYear();
  const count = (
    getDatabase()
      .prepare(`SELECT COUNT(*) as c FROM business_estimates`)
      .get() as { c: number }
  ).c;
  const estimateNo = `EST-${year}-${String(count + 1).padStart(4, "0")}`;
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO business_estimates (
        id, project_id, estimate_no, customer_name, title, items_json,
        subtotal, tax, total, internal_cost, gross_profit, gross_profit_rate,
        pdf_path, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
    )
    .run(
      id,
      projectId,
      estimateNo,
      project.customerName,
      project.title,
      JSON.stringify(normalized),
      totals.subtotal,
      totals.tax,
      totals.total,
      totals.internalCost,
      totals.grossProfit,
      totals.grossProfitRate,
      now,
      now
    );
  updateBusinessProject(projectId, {
    estimateId: id,
    status: statusAfterEstimateCreated(),
  });
  if (opts?.fromAi) {
    getDatabase()
      .prepare(
        `UPDATE business_ai_candidates SET applied = 1 WHERE project_id = ? AND applied = 0`
      )
      .run(projectId);
  }
  return getEstimate(id)!;
}

function ensureInvoiceReadyStatus(projectId: string): void {
  const project = getBusinessProject(projectId);
  if (!project) throw new Error("project not found");
  if (canTransitionStatus(project.status, statusAfterInvoiceCreated())) return;
  const chain: BusinessProjectStatus[] = [
    "survey_done",
    "estimate_created",
    "estimate_sent",
    "construction_scheduled",
    "construction_done",
  ];
  let current = project.status;
  for (const target of chain) {
    if (current === target) continue;
    if (canTransitionStatus(current, target)) {
      updateBusinessProject(projectId, { status: target });
      current = target;
    }
  }
}

export function createInvoiceFromEstimate(projectId: string, paymentDueDate?: string): Invoice {
  const project = getBusinessProject(projectId);
  if (!project?.estimateId) throw new Error("estimate required");
  ensureInvoiceReadyStatus(projectId);
  const est = getEstimate(project.estimateId);
  if (!est) throw new Error("estimate not found");
  const id = uuid();
  const year = new Date().getFullYear();
  const count = (
    getDatabase()
      .prepare(`SELECT COUNT(*) as c FROM business_invoices`)
      .get() as { c: number }
  ).c;
  const invoiceNo = `INV-${year}-${String(count + 1).padStart(4, "0")}`;
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO business_invoices (
        id, project_id, invoice_no, customer_name, title, items_json,
        subtotal, tax, total, payment_due_date, bank_info, pdf_path, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
    )
    .run(
      id,
      projectId,
      invoiceNo,
      est.customerName,
      est.title,
      JSON.stringify(est.items),
      est.subtotal,
      est.tax,
      est.total,
      paymentDueDate ?? project.paymentDueDate,
      "三菱UFJ銀行 〇〇支店 普通 1234567 カ）ヤマナカ（スタブ）",
      now,
      now
    );
  updateBusinessProject(projectId, {
    invoiceId: id,
    status: statusAfterInvoiceCreated(),
  });
  return getInvoice(id)!;
}

function rowToInvoice(r: Record<string, unknown>): Invoice {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    invoiceNo: String(r.invoice_no),
    customerName: String(r.customer_name),
    title: String(r.title),
    items: parseJson(r.items_json as string, []),
    subtotal: Number(r.subtotal),
    tax: Number(r.tax),
    total: Number(r.total),
    paymentDueDate: r.payment_due_date != null ? String(r.payment_due_date) : null,
    bankInfo: String(r.bank_info ?? ""),
    pdfPath: r.pdf_path != null ? String(r.pdf_path) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function getInvoice(id: string): Invoice | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM business_invoices WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToInvoice(row) : null;
}

export function createCompletionReport(
  projectId: string,
  input: { title?: string; workMemo?: string; beforePhotos?: BusinessPhoto[]; afterPhotos?: BusinessPhoto[] }
): CompletionReport {
  const project = getBusinessProject(projectId);
  if (!project) throw new Error("project not found");
  const id = uuid();
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO business_completion_reports (
        id, project_id, title, before_photos_json, after_photos_json, work_memo, pdf_path, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`
    )
    .run(
      id,
      projectId,
      input.title ?? `${project.title} 完了報告`,
      JSON.stringify(input.beforePhotos ?? []),
      JSON.stringify(input.afterPhotos ?? project.constructionPhotos),
      input.workMemo ?? project.constructionMemo,
      now,
      now
    );
  updateBusinessProject(projectId, {
    completionReportId: id,
    status: statusAfterCompletionReport(),
  });
  return getCompletionReport(id)!;
}

function rowToReport(r: Record<string, unknown>): CompletionReport {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    title: String(r.title),
    beforePhotos: parseJson(r.before_photos_json as string, []),
    afterPhotos: parseJson(r.after_photos_json as string, []),
    workMemo: String(r.work_memo ?? ""),
    pdfPath: r.pdf_path != null ? String(r.pdf_path) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function getCompletionReport(id: string): CompletionReport | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM business_completion_reports WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToReport(row) : null;
}

// --- Drafts persistence ---

export function saveCalendarDraft(draft: CalendarDraft): void {
  getDatabase()
    .prepare(
      `INSERT OR REPLACE INTO business_calendar_drafts (
        id, project_id, type, title, start_at, end_at, location, description, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      draft.id,
      draft.projectId,
      draft.type,
      draft.title,
      draft.start,
      draft.end,
      draft.location,
      draft.description,
      draft.status,
      draft.createdAt
    );
}

export function listCalendarDrafts(projectId: string): CalendarDraft[] {
  return getDatabase()
    .prepare(`SELECT * FROM business_calendar_drafts WHERE project_id = ? ORDER BY created_at DESC`)
    .all(projectId)
    .map((r) => ({
      id: String((r as Record<string, unknown>).id),
      projectId,
      type: String((r as Record<string, unknown>).type) as CalendarDraft["type"],
      title: String((r as Record<string, unknown>).title),
      start: String((r as Record<string, unknown>).start_at),
      end: String((r as Record<string, unknown>).end_at),
      location: String((r as Record<string, unknown>).location),
      description: String((r as Record<string, unknown>).description),
      status: String((r as Record<string, unknown>).status) as CalendarDraft["status"],
      createdAt: String((r as Record<string, unknown>).created_at),
    }));
}

export function saveMailDraft(draft: MailDraft): void {
  getDatabase()
    .prepare(
      `INSERT OR REPLACE INTO business_mail_drafts (
        id, project_id, type, mail_to, subject, body, attachment_paths_json, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      draft.id,
      draft.projectId,
      draft.type,
      draft.to,
      draft.subject,
      draft.body,
      JSON.stringify(draft.attachmentPaths),
      draft.status,
      draft.createdAt
    );
}

export function listMailDrafts(projectId: string): MailDraft[] {
  return getDatabase()
    .prepare(`SELECT * FROM business_mail_drafts WHERE project_id = ? ORDER BY created_at DESC`)
    .all(projectId)
    .map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: String(row.id),
        projectId,
        type: String(row.type) as MailDraft["type"],
        to: String(row.mail_to),
        subject: String(row.subject),
        body: String(row.body),
        attachmentPaths: parseJson<string[]>(row.attachment_paths_json as string, []),
        status: String(row.status) as MailDraft["status"],
        createdAt: String(row.created_at),
      };
    });
}

export function saveQnapPlan(plan: QnapSavePlan): void {
  getDatabase()
    .prepare(
      `INSERT OR REPLACE INTO business_qnap_plans (
        id, project_id, base_path, folders_json, files_json, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      plan.id,
      plan.projectId,
      plan.basePath,
      JSON.stringify(plan.folders),
      JSON.stringify(plan.files),
      plan.status,
      plan.createdAt
    );
}

export function getQnapPlan(projectId: string): QnapSavePlan | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM business_qnap_plans WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(projectId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    projectId,
    basePath: String(row.base_path),
    folders: parseJson(row.folders_json as string, []),
    files: parseJson(row.files_json as string, []),
    status: String(row.status) as QnapSavePlan["status"],
    createdAt: String(row.created_at),
  };
}

// --- AI candidate ---

export function saveAiCandidate(
  projectId: string,
  recommended: Record<string, unknown>,
  source: "survey_ai" | "manual" = "survey_ai"
): AiEstimateCandidate {
  const id = uuid();
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO business_ai_candidates (id, project_id, source, recommended_json, applied, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`
    )
    .run(id, projectId, source, JSON.stringify(recommended), now);
  return {
    id,
    projectId,
    source,
    recommended,
    applied: false,
    createdAt: now,
  };
}

export function getLatestAiCandidate(projectId: string): AiEstimateCandidate | null {
  const row = getDatabase()
    .prepare(
      `SELECT * FROM business_ai_candidates WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`
    )
    .get(projectId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    projectId,
    source: String(row.source) as AiEstimateCandidate["source"],
    recommended: parseJson(row.recommended_json as string, {}),
    applied: Boolean(row.applied),
    createdAt: String(row.created_at),
  };
}

export function buildEstimateDraftFromAi(projectId: string): EstimateLineItem[] {
  const candidate = getLatestAiCandidate(projectId);
  if (!candidate) throw new Error("AI candidate not found");
  const project = getBusinessProject(projectId);
  if (!project) throw new Error("project not found");
  const pricing = getPricingItemsForCustomer(project.customerId);
  return aiRecommendedToDraftLines(candidate.recommended, pricing);
}

export function countProjectsByStatus(statuses: BusinessProjectStatus[]): number {
  const expanded = expandStatusAliases(statuses);
  const placeholders = expanded.map(() => "?").join(",");
  const row = getDatabase()
    .prepare(`SELECT COUNT(*) as c FROM business_projects WHERE status IN (${placeholders})`)
    .get(...expanded) as { c: number };
  return row.c;
}

export interface TodayScheduleItem {
  projectId: string;
  projectNo: string;
  title: string;
  customerName: string;
  kind: "site_survey" | "construction" | "payment";
  date: string;
  startTime?: string;
  endTime?: string;
}

export function listTodaySchedules(today?: string): TodayScheduleItem[] {
  const d = today ?? new Date().toISOString().slice(0, 10);
  const projects = listBusinessProjects();
  const out: TodayScheduleItem[] = [];
  for (const p of projects) {
    if (p.surveySchedule?.date === d) {
      out.push({
        projectId: p.id,
        projectNo: p.projectNo,
        title: p.title,
        customerName: p.customerName,
        kind: "site_survey",
        date: d,
        startTime: p.surveySchedule.startTime,
        endTime: p.surveySchedule.endTime,
      });
    }
    if (p.constructionSchedule?.date === d) {
      out.push({
        projectId: p.id,
        projectNo: p.projectNo,
        title: p.title,
        customerName: p.customerName,
        kind: "construction",
        date: d,
        startTime: p.constructionSchedule.startTime,
        endTime: p.constructionSchedule.endTime,
      });
    }
    if (p.paymentDueDate === d) {
      out.push({
        projectId: p.id,
        projectNo: p.projectNo,
        title: p.title,
        customerName: p.customerName,
        kind: "payment",
        date: d,
      });
    }
  }
  return out.sort((a, b) => a.kind.localeCompare(b.kind));
}

export function seedBusinessDefaults(): void {
  const hasTier = getDatabase()
    .prepare(`SELECT id FROM business_pricing_tiers LIMIT 1`)
    .get();
  if (hasTier) return;

  const tierId = "BPT-DEFAULT";
  const items: PricingItem[] = [
    {
      id: uuid(),
      category: "camera",
      name: "防犯カメラ outdoor",
      unit: "台",
      defaultUnitPrice: 45000,
      costPrice: 28000,
      taxType: "standard",
      memo: "",
    },
    {
      id: uuid(),
      category: "camera",
      name: "防犯カメラ indoor",
      unit: "台",
      defaultUnitPrice: 38000,
      costPrice: 22000,
      taxType: "standard",
      memo: "",
    },
    {
      id: uuid(),
      category: "lan",
      name: "LAN配線",
      unit: "m",
      defaultUnitPrice: 1200,
      costPrice: 600,
      taxType: "standard",
      memo: "",
    },
    {
      id: uuid(),
      category: "other",
      name: "工事一式",
      unit: "式",
      defaultUnitPrice: 150000,
      costPrice: 90000,
      taxType: "standard",
      memo: "",
    },
  ];
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO business_pricing_tiers (id, name, customer_id, items_json, created_at, updated_at)
       VALUES (?, '標準単価', NULL, ?, ?, ?)`
    )
    .run(tierId, JSON.stringify(items), now, now);

  const custId = "BCU-SEED-TOMS";
  getDatabase()
    .prepare(
      `INSERT OR IGNORE INTO business_customers (
        id, name, type, contact_name, phone, email, address, pricing_tier_id,
        payment_terms, invoice_closing_day, created_at, updated_at
      ) VALUES (?, '山田様（サンプル）', 'individual', '山田太郎', '090-0000-0000',
        'sample@example.com', '東京都千代田区', ?, '月末締め翌月末払い', 31, ?, ?)`
    )
    .run(custId, tierId, now, now);
}
