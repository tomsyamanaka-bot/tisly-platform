import type { BusinessProject, Estimate, Invoice } from "../business-types.js";
import { buildCustomerFacingPdfNotes, filterCustomerFacingLineDescription } from "../customer-price-rules.js";
import {
  formatTomsIssueDate,
  formatTomsPaymentDueDate,
  itemsToTomsLines,
  resolveTomsBankInfo,
  TOMS_DEFAULT_STAFF,
  type TomsInvoiceHeader,
} from "../toms-document-format.js";
import {
  sanitizePdfItemText,
  sanitizePdfNotesText,
  sanitizePdfRequiredField,
} from "./pdf-text-sanitize.js";
import { renderTomsDocWithPhotoLayout } from "./toms-doc-photo-layout.js";
import { escapeHtml } from "./shared-blocks.js";
import {
  renderTomsV2CoverHeader,
  renderTomsV2DocumentBody,
  renderTomsV2DocumentLower,
  TOMS_V2_PHOTO_EXTRA_STYLES,
  TOMS_V2_STYLES,
  wrapTomsV2Html,
  type TomsV2PageContext,
} from "./toms-excel-doc-layout-v2.js";

function sanitizeInvoiceHeader(header: TomsInvoiceHeader): TomsInvoiceHeader {
  return {
    ...header,
    addressee: sanitizePdfRequiredField(header.addressee),
    subject: sanitizePdfRequiredField(header.subject),
    workLocation: sanitizePdfRequiredField(header.workLocation),
    staffName: sanitizePdfRequiredField(header.staffName, TOMS_DEFAULT_STAFF),
    address: sanitizePdfRequiredField(header.address ?? "", ""),
    phone: sanitizePdfRequiredField(header.phone ?? "", ""),
    email: sanitizePdfRequiredField(header.email ?? "", ""),
    estimateRefNo: sanitizePdfRequiredField(header.estimateRefNo, ""),
    bankInfo: resolveTomsBankInfo(header.bankInfo),
  };
}

export interface InvoiceHtmlOptions {
  header?: TomsInvoiceHeader | null;
  estimateRefNo?: string;
  notes?: string | null;
  includePhotos?: boolean;
  priceRuleName?: string | null;
  shuseiDiscount?: number;
  shuseiDiscountMemo?: string;
  lineSubtotal?: number;
  paymentDueDate?: string | null;
}

export function buildInvoiceHeader(
  project: BusinessProject,
  invoice: Invoice,
  estimate: Estimate,
  opts?: InvoiceHtmlOptions
): TomsInvoiceHeader {
  const estHeader = estimate.header;
  return (
    opts?.header ?? {
      addressee: invoice.customerName,
      subject: invoice.title,
      invoiceDate: formatTomsIssueDate(new Date(invoice.createdAt)),
      invoiceNo: invoice.invoiceNo,
      staffName: estHeader?.staffName ?? TOMS_DEFAULT_STAFF,
      siteName: estHeader?.siteName ?? project.title,
      workLocation: estHeader?.workLocation ?? project.address,
      estimateRefNo: opts?.estimateRefNo ?? estimate.estimateNo,
      bankInfo: invoice.bankInfo,
    }
  );
}

function buildInvoiceV2Context(
  project: BusinessProject,
  invoice: Invoice,
  estimate: Estimate,
  opts?: InvoiceHtmlOptions
): TomsV2PageContext {
  const header = sanitizeInvoiceHeader(buildInvoiceHeader(project, invoice, estimate, opts));
  const lines = itemsToTomsLines(invoice.items).map((line) => ({
    ...line,
    description: sanitizePdfItemText(filterCustomerFacingLineDescription(line.description)),
  }));
  const notes = sanitizePdfNotesText(
    buildCustomerFacingPdfNotes(opts?.notes ?? project.surveyMemo ?? "")
  );
  const paymentDueDate = formatTomsPaymentDueDate(
    opts?.paymentDueDate ?? invoice.paymentDueDate ?? project.paymentDueDate
  );
  const footerExtras = `<div class="toms-v2-footer-extras">支払期限：${escapeHtml(paymentDueDate)}</div>`;
  const extraMetaRows = header.estimateRefNo?.trim()
    ? [{ label: "見積参照番号", value: header.estimateRefNo }]
    : [];

  return {
    kind: "invoice",
    docTitle: "御請求書",
    introText: "下記の通り、御請求申し上げます。",
    addressee: header.addressee,
    subject: header.subject,
    workLocation: header.workLocation,
    issueDateLabel: "発行日",
    issueDate: header.invoiceDate,
    docNoLabel: "請求番号",
    docNo: header.invoiceNo,
    includeRegistrationNo: true,
    staffName: header.staffName,
    total: invoice.total,
    lines,
    totals: {
      lineSubtotal: opts?.lineSubtotal ?? estimate.lineSubtotal,
      shuseiDiscount: opts?.shuseiDiscount ?? estimate.shuseiDiscount,
      shuseiDiscountMemo: opts?.shuseiDiscountMemo ?? estimate.shuseiDiscountMemo,
      subtotal: invoice.subtotal,
      tax: invoice.tax,
      total: invoice.total,
    },
    notes,
    bankInfo: header.bankInfo,
    extraMetaRows,
    footerExtras,
  };
}

export function renderInvoiceHtmlV2(
  project: BusinessProject,
  invoice: Invoice,
  estimate: Estimate,
  opts?: InvoiceHtmlOptions
): string {
  const ctx = buildInvoiceV2Context(project, invoice, estimate, opts);
  const includePhotos = opts?.includePhotos === true && (project.surveyPhotos?.length ?? 0) > 0;

  if (includePhotos) {
    const coverHeaderHtml = renderTomsV2CoverHeader({
      kind: "invoice",
      docTitle: ctx.docTitle,
      introText: ctx.introText,
      addressee: ctx.addressee,
      subject: ctx.subject,
      workLocation: ctx.workLocation,
      issueDateLabel: ctx.issueDateLabel,
      issueDate: ctx.issueDate,
      docNoLabel: ctx.docNoLabel,
      docNo: ctx.docNo,
      includeRegistrationNo: ctx.includeRegistrationNo,
      staffName: ctx.staffName,
      total: ctx.total,
      bankInfo: ctx.bankInfo,
      extraMetaRows: ctx.extraMetaRows,
    });
    const documentBodyHtml = renderTomsV2DocumentLower(ctx);
    const { photoPageStyles, bodyHtml } = renderTomsDocWithPhotoLayout({
      prefix: "inv",
      photos: project.surveyPhotos ?? [],
      projectNo: project.projectNo,
      generatedAt: invoice.updatedAt ?? invoice.createdAt,
      coverHeaderHtml,
      documentBodyHtml,
    });
    return wrapTomsV2Html(
      `御請求書 ${ctx.docNo}`,
      bodyHtml,
      photoPageStyles + TOMS_V2_PHOTO_EXTRA_STYLES
    );
  }

  return wrapTomsV2Html(`御請求書 ${ctx.docNo}`, renderTomsV2DocumentBody(ctx));
}

export { TOMS_V2_STYLES as INVOICE_TEMPLATE_V2_STYLES };
