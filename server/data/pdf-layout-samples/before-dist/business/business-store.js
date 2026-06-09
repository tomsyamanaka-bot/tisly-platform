import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { logBusinessIntegration } from "./business-integration-log.js";
import { assertTransition, canTransitionStatus, expandStatusAliases, normalizeProjectStatus, statusAfterAccepted, statusAfterCompletionReport, statusAfterConstructionDone, statusAfterConstructionSchedule, statusAfterEstimateCreated, statusAfterInvoiceCreated, statusAfterPaid, statusAfterSurveyDone, statusAfterSurveySchedule, } from "./business-status.js";
import { aiRecommendedToDraftLines, calcTotals, normalizeLineItems, } from "./estimate-math.js";
import { buildDefaultEstimateHeader, generateTomsDailyDocNo, parseEstimateHeaderJson, TOMS_DEFAULT_BANK_INFO, } from "./toms-document-format.js";
import { buildPracticalSearchIndex } from "../estimate/estimate-v1-search.js";
import { generateQnapProjectPath } from "./services/qnapService.js";
import { appendProjectTimeline } from "../toms/project-timeline.js";
let projectNoSeq = 0;
function nextProjectNo() {
    const year = new Date().getFullYear();
    projectNoSeq += 1;
    const row = getDatabase()
        .prepare(`SELECT COUNT(*) as c FROM business_projects WHERE project_no LIKE ?`)
        .get(`PRJ-${year}-%`);
    const n = (row?.c ?? 0) + projectNoSeq;
    return `PRJ-${year}-${String(n).padStart(4, "0")}`;
}
function parseJson(raw, fallback) {
    if (!raw)
        return fallback;
    try {
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}
function rowToProject(r) {
    return {
        id: String(r.id),
        projectNo: String(r.project_no),
        customerId: String(r.customer_id),
        customerName: String(r.customer_name),
        title: String(r.title),
        address: String(r.address ?? ""),
        phone: String(r.phone ?? ""),
        status: normalizeProjectStatus(String(r.status)),
        surveySchedule: parseJson(r.survey_schedule_json, null),
        surveyMemo: String(r.survey_memo ?? ""),
        surveyPhotos: parseJson(r.survey_photos_json, []),
        estimateId: r.estimate_id != null ? String(r.estimate_id) : null,
        constructionSchedule: parseJson(r.construction_schedule_json, null),
        requiredMaterials: String(r.required_materials ?? ""),
        constructionMemo: String(r.construction_memo ?? ""),
        constructionPhotos: parseJson(r.construction_photos_json, []),
        completionReportId: r.completion_report_id != null ? String(r.completion_report_id) : null,
        invoiceId: r.invoice_id != null ? String(r.invoice_id) : null,
        paymentDueDate: r.payment_due_date != null ? String(r.payment_due_date) : null,
        paidDate: r.paid_date != null ? String(r.paid_date) : null,
        qnapBasePath: String(r.qnap_base_path ?? ""),
        surveyProjectId: r.survey_project_id != null ? String(r.survey_project_id) : null,
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
    };
}
export function businessUploadsDir(projectId, folder) {
    const dir = path.join(process.cwd(), "uploads", "business", projectId, folder);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}
export function listBusinessProjects() {
    const rows = getDatabase()
        .prepare(`SELECT * FROM business_projects ORDER BY updated_at DESC`)
        .all();
    return rows.map(rowToProject);
}
export function getBusinessProject(id) {
    const row = getDatabase()
        .prepare(`SELECT * FROM business_projects WHERE id = ?`)
        .get(id);
    return row ? rowToProject(row) : null;
}
export function createBusinessProject(input) {
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
        status: "new",
        createdAt: now,
    };
    const qnapBasePath = generateQnapProjectPath(stub);
    getDatabase()
        .prepare(`INSERT INTO business_projects (
        id, project_no, customer_id, customer_name, title, address, phone, status,
        survey_schedule_json, survey_memo, survey_photos_json, estimate_id,
        construction_schedule_json, required_materials, construction_memo, construction_photos_json,
        completion_report_id, invoice_id, payment_due_date, paid_date, qnap_base_path,
        survey_project_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'new', NULL, '', '[]', NULL, NULL, '', '', '[]', NULL, NULL, NULL, NULL, ?, ?, ?, ?)`)
        .run(id, projectNo, input.customerId, input.customerName, input.title, input.address ?? "", input.phone ?? "", qnapBasePath, input.surveyProjectId ?? null, now, now);
    const created = getBusinessProject(id);
    appendProjectTimeline({
        projectId: id,
        eventType: "project_created",
        detail: `${created.projectNo} ${created.title}`,
        actor: "business",
    });
    return created;
}
export function updateBusinessProject(id, patch, opts) {
    const current = getBusinessProject(id);
    if (!current)
        throw new Error("project not found");
    if (patch.status && patch.status !== current.status && !opts?.skipTransitionCheck) {
        assertTransition(current.status, patch.status);
    }
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`UPDATE business_projects SET
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
      WHERE id = ?`)
        .run(patch.title ?? null, patch.address ?? null, patch.phone ?? null, patch.customerName ?? null, patch.status ?? null, patch.surveySchedule != null ? JSON.stringify(patch.surveySchedule) : null, patch.surveyMemo ?? null, patch.surveyPhotos != null ? JSON.stringify(patch.surveyPhotos) : null, patch.constructionSchedule != null ? JSON.stringify(patch.constructionSchedule) : null, patch.requiredMaterials ?? null, patch.constructionMemo ?? null, patch.constructionPhotos != null ? JSON.stringify(patch.constructionPhotos) : null, patch.paymentDueDate !== undefined ? patch.paymentDueDate : null, patch.paidDate !== undefined ? patch.paidDate : null, patch.estimateId !== undefined ? patch.estimateId : null, patch.completionReportId !== undefined ? patch.completionReportId : null, patch.invoiceId !== undefined ? patch.invoiceId : null, now, id);
    return getBusinessProject(id);
}
export function saveBusinessPhoto(projectId, kind, imageBase64, fileName) {
    const project = getBusinessProject(projectId);
    if (!project)
        throw new Error("project not found");
    const folder = kind === "survey"
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
    const photo = {
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
    }
    else if (kind === "construction") {
        updateBusinessProject(projectId, {
            constructionPhotos: [...project.constructionPhotos, photo],
        });
    }
    return photo;
}
export function setSurveySchedule(projectId, schedule) {
    const p = getBusinessProject(projectId);
    if (!p)
        throw new Error("project not found");
    return updateBusinessProject(projectId, {
        surveySchedule: schedule,
        status: statusAfterSurveySchedule(),
    });
}
export function markSurveyDone(projectId, memo) {
    const patch = {
        status: statusAfterSurveyDone(),
    };
    if (memo != null)
        patch.surveyMemo = memo;
    return updateBusinessProject(projectId, patch);
}
export function setConstructionSchedule(projectId, schedule, requiredMaterials, memo) {
    const patch = {
        constructionSchedule: schedule,
        status: statusAfterConstructionSchedule(),
    };
    if (requiredMaterials != null)
        patch.requiredMaterials = requiredMaterials;
    if (memo != null)
        patch.constructionMemo = memo;
    return updateBusinessProject(projectId, patch);
}
export function markConstructionDone(projectId) {
    return updateBusinessProject(projectId, { status: statusAfterConstructionDone() });
}
export function markAccepted(projectId) {
    const p = getBusinessProject(projectId);
    if (!p)
        throw new Error("project not found");
    if (canTransitionStatus(p.status, statusAfterConstructionSchedule())) {
        return updateBusinessProject(projectId, { status: statusAfterConstructionSchedule() });
    }
    return updateBusinessProject(projectId, { status: statusAfterAccepted() });
}
export function markPaid(projectId, paidDate) {
    return updateBusinessProject(projectId, {
        status: statusAfterPaid(),
        paidDate: paidDate ?? new Date().toISOString().slice(0, 10),
    });
}
export function setPaymentDue(projectId, dueDate) {
    return updateBusinessProject(projectId, {
        paymentDueDate: dueDate,
    });
}
// --- Customers ---
export function listCustomers() {
    return getDatabase()
        .prepare(`SELECT * FROM business_customers ORDER BY name`)
        .all()
        .map((r) => rowToCustomer(r));
}
function rowToCustomer(r) {
    return {
        id: String(r.id),
        name: String(r.name),
        type: String(r.type),
        contactName: String(r.contact_name ?? ""),
        phone: String(r.phone ?? ""),
        email: String(r.email ?? ""),
        address: String(r.address ?? ""),
        pricingTierId: r.pricing_tier_id != null ? String(r.pricing_tier_id) : null,
        paymentTerms: String(r.payment_terms ?? ""),
        invoiceClosingDay: r.invoice_closing_day != null ? Number(r.invoice_closing_day) : null,
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
    };
}
export function getCustomer(id) {
    const row = getDatabase()
        .prepare(`SELECT * FROM business_customers WHERE id = ?`)
        .get(id);
    return row ? rowToCustomer(row) : null;
}
export function createCustomer(input) {
    const id = `BCU-${uuid().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`INSERT INTO business_customers (
        id, name, type, contact_name, phone, email, address, pricing_tier_id,
        payment_terms, invoice_closing_day, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, input.name, input.type, input.contactName, input.phone, input.email, input.address, input.pricingTierId, input.paymentTerms, input.invoiceClosingDay, now, now);
    return getCustomer(id);
}
// --- Pricing ---
export function listPricingTiers() {
    return getDatabase()
        .prepare(`SELECT * FROM business_pricing_tiers ORDER BY name`)
        .all()
        .map((r) => rowToTier(r));
}
function rowToTier(r) {
    return {
        id: String(r.id),
        name: String(r.name),
        customerId: r.customer_id != null ? String(r.customer_id) : null,
        items: parseJson(r.items_json, []),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
    };
}
export function getPricingTier(id) {
    const row = getDatabase()
        .prepare(`SELECT * FROM business_pricing_tiers WHERE id = ?`)
        .get(id);
    return row ? rowToTier(row) : null;
}
export function getPricingItemsForCustomer(customerId) {
    const customer = getCustomer(customerId);
    if (!customer?.pricingTierId) {
        const defaultTier = getDatabase()
            .prepare(`SELECT * FROM business_pricing_tiers WHERE customer_id IS NULL LIMIT 1`)
            .get();
        return defaultTier ? rowToTier(defaultTier).items : [];
    }
    return getPricingTier(customer.pricingTierId)?.items ?? [];
}
// --- Estimates ---
function rowToEstimate(r) {
    const items = parseJson(r.items_json, []);
    const headerRaw = r.header_json != null ? String(r.header_json) : null;
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
        header: parseEstimateHeaderJson(headerRaw),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
    };
}
export function setEstimatePdfPath(estimateId, pdfPath) {
    getDatabase()
        .prepare(`UPDATE business_estimates SET pdf_path = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(pdfPath, estimateId);
}
export function setInvoicePdfPath(invoiceId, pdfPath) {
    getDatabase()
        .prepare(`UPDATE business_invoices SET pdf_path = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(pdfPath, invoiceId);
}
export function setCompletionReportPdfPath(reportId, pdfPath) {
    getDatabase()
        .prepare(`UPDATE business_completion_reports SET pdf_path = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(pdfPath, reportId);
}
export function getEstimate(id) {
    const row = getDatabase()
        .prepare(`SELECT * FROM business_estimates WHERE id = ?`)
        .get(id);
    return row ? rowToEstimate(row) : null;
}
function ensureEstimateReadyStatus(projectId) {
    const project = getBusinessProject(projectId);
    if (!project)
        throw new Error("project not found");
    if (canTransitionStatus(project.status, statusAfterEstimateCreated()))
        return;
    if (project.status === "new") {
        updateBusinessProject(projectId, { status: statusAfterSurveySchedule() });
        updateBusinessProject(projectId, { status: statusAfterSurveyDone() });
        return;
    }
    if (project.status === "survey_scheduled") {
        updateBusinessProject(projectId, { status: statusAfterSurveyDone() });
    }
}
export function createEstimate(projectId, items, opts) {
    const project = getBusinessProject(projectId);
    if (!project)
        throw new Error("project not found");
    ensureEstimateReadyStatus(projectId);
    const normalized = normalizeLineItems(items);
    const totals = calcTotals(normalized);
    const id = uuid();
    const estimateNo = generateTomsDailyDocNo("business_estimates", "estimate_no");
    const now = new Date().toISOString();
    const draftEstimate = {
        id,
        projectId,
        estimateNo,
        customerName: project.customerName,
        title: project.title,
        items: normalized,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        internalCost: totals.internalCost,
        grossProfit: totals.grossProfit,
        grossProfitRate: totals.grossProfitRate,
        pdfPath: null,
        createdAt: now,
        updatedAt: now,
    };
    const header = buildDefaultEstimateHeader(draftEstimate, {
        siteName: project.title,
        workLocation: project.address,
    });
    const searchIndex = buildPracticalSearchIndex(project, draftEstimate, header, null, {
        siteName: project.title,
    });
    getDatabase()
        .prepare(`INSERT INTO business_estimates (
        id, project_id, estimate_no, customer_name, title, items_json,
        subtotal, tax, total, internal_cost, gross_profit, gross_profit_rate,
        pdf_path, header_json, search_index_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`)
        .run(id, projectId, estimateNo, project.customerName, project.title, JSON.stringify(normalized), totals.subtotal, totals.tax, totals.total, totals.internalCost, totals.grossProfit, totals.grossProfitRate, JSON.stringify(header), JSON.stringify(searchIndex), now, now);
    updateBusinessProject(projectId, {
        estimateId: id,
        status: statusAfterEstimateCreated(),
    });
    if (opts?.fromAi) {
        getDatabase()
            .prepare(`UPDATE business_ai_candidates SET applied = 1 WHERE project_id = ? AND applied = 0`)
            .run(projectId);
    }
    return getEstimate(id);
}
function ensureInvoiceReadyStatus(projectId) {
    const project = getBusinessProject(projectId);
    if (!project)
        throw new Error("project not found");
    if (canTransitionStatus(project.status, statusAfterInvoiceCreated()))
        return;
    const chain = [
        "survey_done",
        "estimate_created",
        "estimate_sent",
        "construction_scheduled",
        "construction_done",
    ];
    let current = project.status;
    for (const target of chain) {
        if (current === target)
            continue;
        if (canTransitionStatus(current, target)) {
            updateBusinessProject(projectId, { status: target });
            current = target;
        }
    }
}
export function createInvoiceFromEstimate(projectId, paymentDueDate) {
    const project = getBusinessProject(projectId);
    if (!project?.estimateId)
        throw new Error("estimate required");
    ensureInvoiceReadyStatus(projectId);
    const est = getEstimate(project.estimateId);
    if (!est)
        throw new Error("estimate not found");
    const id = uuid();
    const invoiceNo = generateTomsDailyDocNo("business_invoices", "invoice_no");
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`INSERT INTO business_invoices (
        id, project_id, invoice_no, customer_name, title, items_json,
        subtotal, tax, total, payment_due_date, bank_info, estimate_ref_no, pdf_path, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`)
        .run(id, projectId, invoiceNo, est.customerName, est.title, JSON.stringify(est.items), est.subtotal, est.tax, est.total, paymentDueDate ?? project.paymentDueDate, TOMS_DEFAULT_BANK_INFO, est.estimateNo, now, now);
    updateBusinessProject(projectId, {
        invoiceId: id,
        status: statusAfterInvoiceCreated(),
    });
    return getInvoice(id);
}
export function updateEstimateHeader(estimateId, header) {
    const existing = getEstimate(estimateId);
    if (!existing)
        throw new Error("estimate not found");
    const project = getDatabase()
        .prepare(`SELECT project_id FROM business_estimates WHERE id = ?`)
        .get(estimateId);
    const bp = project ? getBusinessProject(project.project_id) : null;
    const merged = {
        ...(existing.header ??
            buildDefaultEstimateHeader(existing, {
                siteName: existing.title,
                workLocation: bp?.address ?? "",
                address: bp?.address ?? "",
                phone: bp?.phone ?? "",
            })),
        ...header,
    };
    const invoice = bp?.invoiceId ? getInvoice(bp.invoiceId) : null;
    const searchIndex = bp
        ? buildPracticalSearchIndex(bp, { ...existing, header: merged }, merged, invoice, {
            siteName: merged.siteName ?? bp.title,
            contactName: merged.staffName,
        })
        : null;
    getDatabase()
        .prepare(`UPDATE business_estimates SET header_json = ?, search_index_json = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(JSON.stringify(merged), searchIndex ? JSON.stringify(searchIndex) : null, estimateId);
    return getEstimate(estimateId);
}
function rowToInvoice(r) {
    return {
        id: String(r.id),
        projectId: String(r.project_id),
        invoiceNo: String(r.invoice_no),
        customerName: String(r.customer_name),
        title: String(r.title),
        items: parseJson(r.items_json, []),
        subtotal: Number(r.subtotal),
        tax: Number(r.tax),
        total: Number(r.total),
        paymentDueDate: r.payment_due_date != null ? String(r.payment_due_date) : null,
        bankInfo: String(r.bank_info ?? ""),
        estimateRefNo: r.estimate_ref_no != null ? String(r.estimate_ref_no) : null,
        pdfPath: r.pdf_path != null ? String(r.pdf_path) : null,
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
    };
}
export function getInvoice(id) {
    const row = getDatabase()
        .prepare(`SELECT * FROM business_invoices WHERE id = ?`)
        .get(id);
    return row ? rowToInvoice(row) : null;
}
export function createCompletionReport(projectId, input) {
    const project = getBusinessProject(projectId);
    if (!project)
        throw new Error("project not found");
    const id = uuid();
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`INSERT INTO business_completion_reports (
        id, project_id, title, before_photos_json, after_photos_json, work_memo, pdf_path, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`)
        .run(id, projectId, input.title ?? `${project.title} 完了報告`, JSON.stringify(input.beforePhotos ?? []), JSON.stringify(input.afterPhotos ?? project.constructionPhotos), input.workMemo ?? project.constructionMemo, now, now);
    updateBusinessProject(projectId, {
        completionReportId: id,
        status: statusAfterCompletionReport(),
    });
    return getCompletionReport(id);
}
function rowToReport(r) {
    return {
        id: String(r.id),
        projectId: String(r.project_id),
        title: String(r.title),
        beforePhotos: parseJson(r.before_photos_json, []),
        afterPhotos: parseJson(r.after_photos_json, []),
        workMemo: String(r.work_memo ?? ""),
        pdfPath: r.pdf_path != null ? String(r.pdf_path) : null,
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
    };
}
export function getCompletionReport(id) {
    const row = getDatabase()
        .prepare(`SELECT * FROM business_completion_reports WHERE id = ?`)
        .get(id);
    return row ? rowToReport(row) : null;
}
// --- Drafts persistence ---
export function saveCalendarDraft(draft) {
    getDatabase()
        .prepare(`INSERT OR REPLACE INTO business_calendar_drafts (
        id, project_id, type, title, start_at, end_at, location, description, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(draft.id, draft.projectId, draft.type, draft.title, draft.start, draft.end, draft.location, draft.description, draft.status, draft.createdAt);
    logBusinessIntegration({
        projectId: draft.projectId,
        type: "calendar",
        provider: process.env.GOOGLE_OAUTH_ENABLED === "true" ? "google" : "mock",
        status: "success",
        request: { draftId: draft.id, type: draft.type, title: draft.title },
        response: { status: draft.status },
    });
}
export function listCalendarDrafts(projectId) {
    return getDatabase()
        .prepare(`SELECT * FROM business_calendar_drafts WHERE project_id = ? ORDER BY created_at DESC`)
        .all(projectId)
        .map((r) => ({
        id: String(r.id),
        projectId,
        type: String(r.type),
        title: String(r.title),
        start: String(r.start_at),
        end: String(r.end_at),
        location: String(r.location),
        description: String(r.description),
        status: String(r.status),
        createdAt: String(r.created_at),
    }));
}
export function saveMailDraft(draft) {
    getDatabase()
        .prepare(`INSERT OR REPLACE INTO business_mail_drafts (
        id, project_id, type, mail_to, subject, body, attachment_paths_json, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(draft.id, draft.projectId, draft.type, draft.to, draft.subject, draft.body, JSON.stringify(draft.attachmentPaths), draft.status, draft.createdAt);
    logBusinessIntegration({
        projectId: draft.projectId,
        type: "gmail",
        provider: process.env.GOOGLE_OAUTH_ENABLED === "true" ? "google" : "mock",
        status: "success",
        request: { draftId: draft.id, type: draft.type, subject: draft.subject },
        response: { to: draft.to, status: draft.status },
    });
}
export function getMailDraftById(mailDraftId) {
    const row = getDatabase()
        .prepare(`SELECT * FROM business_mail_drafts WHERE id = ?`)
        .get(mailDraftId);
    if (!row)
        return null;
    return {
        id: String(row.id),
        projectId: String(row.project_id),
        type: String(row.type),
        to: String(row.mail_to),
        subject: String(row.subject),
        body: String(row.body),
        attachmentPaths: parseJson(row.attachment_paths_json, []),
        status: String(row.status),
        createdAt: String(row.created_at),
    };
}
export function updateMailDraftStatus(mailDraftId, status) {
    getDatabase()
        .prepare(`UPDATE business_mail_drafts SET status = ? WHERE id = ?`)
        .run(status, mailDraftId);
}
export function listMailDrafts(projectId) {
    return getDatabase()
        .prepare(`SELECT * FROM business_mail_drafts WHERE project_id = ? ORDER BY created_at DESC`)
        .all(projectId)
        .map((r) => {
        const row = r;
        return {
            id: String(row.id),
            projectId,
            type: String(row.type),
            to: String(row.mail_to),
            subject: String(row.subject),
            body: String(row.body),
            attachmentPaths: parseJson(row.attachment_paths_json, []),
            status: String(row.status),
            createdAt: String(row.created_at),
        };
    });
}
export function saveQnapPlan(plan) {
    getDatabase()
        .prepare(`INSERT OR REPLACE INTO business_qnap_plans (
        id, project_id, base_path, folders_json, files_json, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(plan.id, plan.projectId, plan.basePath, JSON.stringify(plan.folders), JSON.stringify(plan.files), plan.status, plan.createdAt);
}
export function getQnapPlan(projectId) {
    const row = getDatabase()
        .prepare(`SELECT * FROM business_qnap_plans WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`)
        .get(projectId);
    if (!row)
        return null;
    return {
        id: String(row.id),
        projectId,
        basePath: String(row.base_path),
        folders: parseJson(row.folders_json, []),
        files: parseJson(row.files_json, []),
        status: String(row.status),
        createdAt: String(row.created_at),
    };
}
// --- AI candidate ---
export function saveAiCandidate(projectId, recommended, source = "survey_ai") {
    const id = uuid();
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`INSERT INTO business_ai_candidates (id, project_id, source, recommended_json, applied, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`)
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
export function getLatestAiCandidate(projectId) {
    const row = getDatabase()
        .prepare(`SELECT * FROM business_ai_candidates WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`)
        .get(projectId);
    if (!row)
        return null;
    return {
        id: String(row.id),
        projectId,
        source: String(row.source),
        recommended: parseJson(row.recommended_json, {}),
        applied: Boolean(row.applied),
        createdAt: String(row.created_at),
    };
}
export function buildEstimateDraftFromAi(projectId) {
    const candidate = getLatestAiCandidate(projectId);
    if (!candidate)
        throw new Error("AI candidate not found");
    const project = getBusinessProject(projectId);
    if (!project)
        throw new Error("project not found");
    const pricing = getPricingItemsForCustomer(project.customerId);
    return aiRecommendedToDraftLines(candidate.recommended, pricing);
}
export function countProjectsByStatus(statuses) {
    const expanded = expandStatusAliases(statuses);
    const placeholders = expanded.map(() => "?").join(",");
    const row = getDatabase()
        .prepare(`SELECT COUNT(*) as c FROM business_projects WHERE status IN (${placeholders})`)
        .get(...expanded);
    return row.c;
}
export function listTodaySchedules(today) {
    const d = today ?? new Date().toISOString().slice(0, 10);
    const projects = listBusinessProjects();
    const out = [];
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
export function seedBusinessDefaults() {
    const hasTier = getDatabase()
        .prepare(`SELECT id FROM business_pricing_tiers LIMIT 1`)
        .get();
    if (hasTier)
        return;
    const tierId = "BPT-DEFAULT";
    const items = [
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
        .prepare(`INSERT INTO business_pricing_tiers (id, name, customer_id, items_json, created_at, updated_at)
       VALUES (?, '標準単価', NULL, ?, ?, ?)`)
        .run(tierId, JSON.stringify(items), now, now);
    const custId = "BCU-SEED-TOMS";
    getDatabase()
        .prepare(`INSERT OR IGNORE INTO business_customers (
        id, name, type, contact_name, phone, email, address, pricing_tier_id,
        payment_terms, invoice_closing_day, created_at, updated_at
      ) VALUES (?, '山田様（サンプル）', 'individual', '山田太郎', '090-0000-0000',
        'sample@example.com', '東京都千代田区', ?, '月末締め翌月末払い', 31, ?, ?)`)
        .run(custId, tierId, now, now);
}
