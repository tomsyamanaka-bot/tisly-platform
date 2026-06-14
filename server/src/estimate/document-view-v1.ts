import { calcTotals, normalizeLineItems } from "../business/estimate-math.js";
import { buildCustomerFacingPdfNotes } from "../business/customer-price-rules.js";
import { getBusinessProject, getEstimate, getInvoice, getCompletionReport } from "../business/business-store.js";
import type { EstimateLineItem } from "../business/business-types.js";
import { resolveTomsBankInfo } from "../business/toms-document-format.js";
import { listCompletionChecklistV1 } from "../field-ops/work-session-v1-store.js";
import { getSurveyProjectV1Detail } from "../survey/survey-v1-store.js";
import { getProjectPdfMeta } from "../projects/project-pdf-qnap-store.js";
import { buildProjectPdfFileNameForProject } from "../projects/project-pdf-store.js";
import { isValidPdfFile } from "../business/pdf/pdf-validation.js";
import path from "path";
import {
  buildCompletionReportContextV1,
  buildReportPhotosV1,
  buildSpecificationContextV1,
  getEstimateProjectV1Detail,
} from "./estimate-v1-store.js";

export const DOCUMENT_VIEW_KINDS = [
  "estimate",
  "invoice",
  "specification",
  "completion-report",
  "field-report",
] as const;

export type DocumentViewKindV1 = (typeof DOCUMENT_VIEW_KINDS)[number];

export interface DocumentViewLineItemV1 {
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  memo?: string;
}

export interface DocumentViewPhotoV1 {
  url: string;
  title: string;
}

export interface DocumentViewChecklistItemV1 {
  category: string;
  label: string;
  checked: boolean;
}

export interface DocumentViewPayloadV1 {
  kind: DocumentViewKindV1;
  label: string;
  projectId: string;
  projectTitle: string;
  projectNo: string;
  pdfUrl: string;
  shareFileName: string;
  storedPdfPath: string | null;
  hasStoredPdf: boolean;
  regenerateUrl: string | null;
  estimate?: {
    docNo: string;
    addressee: string;
    subject: string;
    issueDate: string;
    staffName: string;
    notes: string;
    items: DocumentViewLineItemV1[];
    lineSubtotal: number;
    shuseiDiscount: number;
    subtotal: number;
    tax: number;
    total: number;
  };
  invoice?: {
    docNo: string;
    addressee: string;
    subject: string;
    issueDate: string;
    paymentDueDate: string;
    estimateRefNo: string;
    bankInfo: string;
    items: DocumentViewLineItemV1[];
    subtotal: number;
    tax: number;
    total: number;
    notes: string;
  };
  specification?: {
    addressee: string;
    subject: string;
    siteName: string;
    workLocation: string;
    issueDate: string;
    estimateNo: string;
    staffName: string;
    notes: string;
    photos: DocumentViewPhotoV1[];
  };
  completionReport?: {
    addressee: string;
    subject: string;
    siteName: string;
    workLocation: string;
    issueDate: string;
    staffName: string;
    startTime: string;
    endTime: string;
    workContent: string;
    notes: string;
    photos: DocumentViewPhotoV1[];
    checklist: DocumentViewChecklistItemV1[];
  };
  fieldReport?: {
    siteName: string;
    customerName: string;
    address: string;
    surveyDate: string;
    assignee: string;
    notes: string;
    materials: Array<{ label: string; quantity: number; unit: string }>;
    photos: DocumentViewPhotoV1[];
  };
}

const KIND_LABELS: Record<DocumentViewKindV1, string> = {
  estimate: "見積書",
  invoice: "請求書",
  specification: "仕様書",
  "completion-report": "完了報告書",
  "field-report": "現場報告",
};

function mapLineItems(items: EstimateLineItem[]): DocumentViewLineItemV1[] {
  return items.map((i) => ({
    name: i.name,
    unit: i.unit,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    amount: i.amount,
    memo: i.memo,
  }));
}

function resolveStoredPdfLocal(storedPath: string | null | undefined): string | null {
  if (!storedPath?.trim()) return null;
  const local = path.join(process.cwd(), storedPath.replace(/^\//, ""));
  return isValidPdfFile(local) ? local : null;
}

/** PDF取得は常に estimate-v1 API（無効PDFはサーバー側で再生成） */
function pdfPathForKind(projectId: string, kind: DocumentViewKindV1): string {
  const estimateBase = `/api/estimate/v1/projects/${projectId}`;
  switch (kind) {
    case "estimate":
      return `${estimateBase}/pdf?includePhotos=false`;
    case "invoice":
      return `${estimateBase}/invoice/pdf?includePhotos=false`;
    case "specification":
    case "field-report":
      return `${estimateBase}/specification/pdf`;
    case "completion-report":
      return `${estimateBase}/completion-report/pdf`;
  }
}

function regenerateUrlForKind(projectId: string, kind: DocumentViewKindV1): string | null {
  const base = `/api/estimate/v1/projects/${projectId}`;
  const projectsBase = `/api/projects/v1/projects/${projectId}/pdfs`;
  switch (kind) {
    case "estimate":
      return `${base}/pdf/regenerate`;
    case "invoice":
      return `${base}/invoice/pdf/regenerate`;
    case "specification":
      return `${base}/specification/pdf/regenerate`;
    case "completion-report":
      return `${projectsBase}/report/regenerate`;
    default:
      return null;
  }
}

function customerFacingNotes(raw: string | null | undefined): string {
  return buildCustomerFacingPdfNotes(raw);
}

function finalizeDocumentViewPayload(payload: DocumentViewPayloadV1): DocumentViewPayloadV1 {
  return {
    ...payload,
    pdfUrl: pdfPathForKind(payload.projectId, payload.kind),
  };
}

function shareFileNameForKind(projectId: string, kind: DocumentViewKindV1): string {
  const project = getBusinessProject(projectId);
  if (!project) return "document.pdf";
  const estimate = project.estimateId ? getEstimate(project.estimateId) : null;
  switch (kind) {
    case "estimate":
      return buildProjectPdfFileNameForProject("estimate", project, estimate ?? undefined);
    case "invoice":
      return buildProjectPdfFileNameForProject("invoice", project, estimate ?? undefined);
    case "specification":
      return buildProjectPdfFileNameForProject("specification", project, estimate ?? undefined);
    case "completion-report":
      return buildProjectPdfFileNameForProject("report", project, estimate ?? undefined);
    default:
      return `${kind}.pdf`;
  }
}

export function buildDocumentViewPayloadV1(
  businessProjectId: string,
  kind: DocumentViewKindV1
): DocumentViewPayloadV1 | null {
  if (!DOCUMENT_VIEW_KINDS.includes(kind)) return null;
  const project = getBusinessProject(businessProjectId);
  if (!project) return null;

  const detail = getEstimateProjectV1Detail(businessProjectId);
  const base: DocumentViewPayloadV1 = {
    kind,
    label: KIND_LABELS[kind],
    projectId: businessProjectId,
    projectTitle: project.title,
    projectNo: project.projectNo,
    pdfUrl: pdfPathForKind(businessProjectId, kind),
    shareFileName: shareFileNameForKind(businessProjectId, kind),
    storedPdfPath: null,
    hasStoredPdf: false,
    regenerateUrl: regenerateUrlForKind(businessProjectId, kind),
  };

  if (kind === "estimate") {
    if (!detail?.estimate || !detail.header) return null;
    const items = normalizeLineItems(detail.estimate.items);
    const totals = calcTotals(items, { shuseiDiscount: detail.estimate.shuseiDiscount });
    const notes = customerFacingNotes(detail.estimateNotes ?? project.surveyMemo ?? "");
    return finalizeDocumentViewPayload({
      ...base,
      storedPdfPath: detail.estimate.pdfPath ?? null,
      hasStoredPdf: Boolean(resolveStoredPdfLocal(detail.estimate.pdfPath)),
      estimate: {
        docNo: detail.header.estimateNo ?? detail.estimate.estimateNo,
        addressee: detail.header.addressee,
        subject: detail.header.subject,
        issueDate: detail.header.issueDate,
        staffName: detail.header.staffName,
        notes,
        items: mapLineItems(items),
        lineSubtotal: totals.lineSubtotal,
        shuseiDiscount: totals.shuseiDiscount,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
      },
    });
  }

  if (kind === "invoice") {
    if (!project.invoiceId || !project.estimateId) return null;
    const invoice = getInvoice(project.invoiceId);
    const estimate = getEstimate(project.estimateId);
    if (!invoice || !estimate || !detail?.header) return null;
    const items = normalizeLineItems(estimate.items);
    const notes = customerFacingNotes(project.surveyMemo ?? "");
    return finalizeDocumentViewPayload({
      ...base,
      storedPdfPath: invoice.pdfPath ?? null,
      hasStoredPdf: Boolean(resolveStoredPdfLocal(invoice.pdfPath)),
      invoice: {
        docNo: invoice.invoiceNo,
        addressee: detail.header.addressee,
        subject: detail.header.subject,
        issueDate: detail.header.issueDate || invoice.createdAt.slice(0, 10),
        paymentDueDate: invoice.paymentDueDate ?? "",
        estimateRefNo: invoice.estimateRefNo ?? "",
        bankInfo: resolveTomsBankInfo(invoice.bankInfo),
        items: mapLineItems(items),
        subtotal: invoice.subtotal,
        tax: invoice.tax,
        total: invoice.total,
        notes,
      },
    });
  }

  if (kind === "specification") {
    const ctx = buildSpecificationContextV1(businessProjectId);
    if (!ctx) return null;
    const specMeta = getProjectPdfMeta(businessProjectId, "specification");
    return finalizeDocumentViewPayload({
      ...base,
      storedPdfPath: specMeta?.localPath ?? null,
      hasStoredPdf: Boolean(resolveStoredPdfLocal(specMeta?.localPath)),
      specification: {
        addressee: ctx.addressee,
        subject: ctx.subject,
        siteName: ctx.siteName,
        workLocation: ctx.workLocation,
        issueDate: ctx.issueDate,
        estimateNo: ctx.projectNo,
        staffName: ctx.staffName,
        notes: ctx.notes ?? "",
        photos: ctx.photos,
      },
    });
  }

  if (kind === "completion-report") {
    const ctx = buildCompletionReportContextV1(businessProjectId);
    if (!ctx) return null;
    const ref = { source: "business" as const, projectId: businessProjectId };
    const checklist = listCompletionChecklistV1(ref).map((it) => ({
      category: it.category,
      label: it.label,
      checked: it.checked,
    }));
    const reportMeta = project.completionReportId
      ? getCompletionReport(project.completionReportId)?.pdfPath
      : null;
    return finalizeDocumentViewPayload({
      ...base,
      storedPdfPath: reportMeta ?? null,
      hasStoredPdf: Boolean(resolveStoredPdfLocal(reportMeta)),
      completionReport: {
        addressee: ctx.addressee,
        subject: ctx.subject,
        siteName: ctx.siteName,
        workLocation: ctx.workLocation,
        issueDate: ctx.issueDate,
        staffName: ctx.staffName,
        startTime: ctx.startTime ?? "",
        endTime: ctx.endTime ?? "",
        workContent: ctx.workContent ?? "",
        notes: ctx.notes ?? "",
        photos: ctx.photos,
        checklist,
      },
    });
  }

  if (kind === "field-report") {
    const surveyId = project.surveyProjectId;
    const survey = surveyId ? getSurveyProjectV1Detail(surveyId) : null;
    const photos = buildReportPhotosV1(businessProjectId);
    return finalizeDocumentViewPayload({
      ...base,
      fieldReport: {
        siteName: survey?.siteName ?? project.title,
        customerName: survey?.customerName ?? project.customerName,
        address: survey?.address ?? project.address,
        surveyDate: survey?.surveyDate ?? "",
        assignee: survey?.assignee ?? "",
        notes: survey?.notes ?? project.surveyMemo ?? "",
        materials: (survey?.materials ?? []).map((m) => ({
          label: m.itemLabel,
          quantity: m.quantity,
          unit: "式",
        })),
        photos,
      },
    });
  }

  return null;
}
