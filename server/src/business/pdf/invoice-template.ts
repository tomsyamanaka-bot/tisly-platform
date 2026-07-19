import type { BusinessProject, Estimate, Invoice } from "../business-types.js";
import { buildCustomerFacingPdfNotes, filterCustomerFacingLineDescription } from "../customer-price-rules.js";
import {
  formatTomsPaymentDueDate,
  itemsToTomsLines,
  resolveTomsBankInfo,
  resolveTomsIssueDateDisplay,
  TOMS_DEFAULT_STAFF,
  type TomsInvoiceHeader,
} from "../toms-document-format.js";
import {
  sanitizePdfItemText,
  sanitizePdfNotesText,
  sanitizePdfRequiredField,
} from "./pdf-text-sanitize.js";
import { escapeHtml, resolvePdfProjectNo } from "./pdf-base-template.js";
import {
  renderTomsV2DocumentBody,
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
  // 請求日（invoice.createdAt）＞見積ヘッダー発行日＞当日
  const invoiceDate = resolveTomsIssueDateDisplay(
    opts?.header?.invoiceDate,
    invoice.createdAt,
    estHeader?.issueDate
  );
  return (
    opts?.header ?? {
      addressee: invoice.customerName,
      subject: invoice.title,
      invoiceDate,
      invoiceNo: invoice.invoiceNo,
      staffName: estHeader?.staffName ?? TOMS_DEFAULT_STAFF,
      siteName: estHeader?.siteName ?? project.title,
      workLocation: estHeader?.workLocation ?? project.address,
      estimateRefNo: opts?.estimateRefNo ?? estimate.estimateNo,
      bankInfo: invoice.bankInfo,
    }
  );
}

function buildInvoiceContext(
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
    projectNo: resolvePdfProjectNo(
      project.projectNo,
      header.estimateRefNo,
      estimate.estimateNo,
      header.invoiceNo
    ),
    issueDateLabel: "発行日",
    issueDate: resolveTomsIssueDateDisplay(
      header.invoiceDate,
      invoice.createdAt,
      estimate.header?.issueDate
    ),
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

export function renderInvoiceHtml(
  project: BusinessProject,
  invoice: Invoice,
  estimate: Estimate,
  opts?: InvoiceHtmlOptions
): string {
  const ctx = buildInvoiceContext(project, invoice, estimate, opts);
  return wrapTomsV2Html(`御請求書 ${ctx.docNo}`, renderTomsV2DocumentBody(ctx));
}

/** @deprecated use renderInvoiceHtml — v2 統合後の互換エイリアス */
export const renderInvoiceHtmlV2 = renderInvoiceHtml;

export { TOMS_V2_STYLES as INVOICE_TEMPLATE_STYLES };
