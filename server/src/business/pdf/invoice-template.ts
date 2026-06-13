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
  TOMS_PDF_CHARSET_META,
  TOMS_PDF_FONT_LINKS,
  TOMS_PDF_STYLES,
  TOMS_PDF_VIEWPORT_META,
} from "./styles.js";
import {
  sanitizePdfItemText,
  sanitizePdfNotesText,
  sanitizePdfRequiredField,
} from "./pdf-text-sanitize.js";
import {
  escapeHtml,
  renderBankBlock,
  renderNotes,
  renderPhotoGrid,
  renderSealPlaceholder,
  renderTomsDocFooter,
  renderTomsOfficialDocLayout,
  renderTomsLineItemsTable,
  renderTotals,
} from "./shared-blocks.js";

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

export function renderInvoiceHtml(
  project: BusinessProject,
  invoice: Invoice,
  estimate: Estimate,
  opts?: InvoiceHtmlOptions
): string {
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
  const includePhotos = opts?.includePhotos === true;
  const photoBlock =
    includePhotos && project.surveyPhotos?.length
      ? renderPhotoGrid(project.surveyPhotos, true)
      : "";
  const pageClass = includePhotos ? "doc with-photos" : "doc single-page";

  return `<!DOCTYPE html><html lang="ja"><head>${TOMS_PDF_CHARSET_META}${TOMS_PDF_FONT_LINKS}${TOMS_PDF_VIEWPORT_META}<title>御請求書 ${escapeHtml(header.invoiceNo)}</title><style>${TOMS_PDF_STYLES}</style></head><body>
<div class="${pageClass}">
${renderTomsOfficialDocLayout({
  docTitle: "御請求書",
  amountLabel: "ご請求金額",
  addressee: header.addressee,
  subject: header.subject,
  workLocation: header.workLocation,
  issueDateLabel: "請求日",
  issueDate: header.invoiceDate,
  docNoLabel: "請求番号",
  docNo: header.invoiceNo,
  total: invoice.total,
  extraMetaRows: header.estimateRefNo?.trim()
    ? [{ label: "見積参照番号", value: header.estimateRefNo }]
    : [],
})}
${renderTomsLineItemsTable(lines)}
${renderTotals({
  lineSubtotal: opts?.lineSubtotal ?? estimate.lineSubtotal,
  shuseiDiscount: opts?.shuseiDiscount ?? estimate.shuseiDiscount,
  shuseiDiscountMemo: opts?.shuseiDiscountMemo ?? estimate.shuseiDiscountMemo,
  subtotal: invoice.subtotal,
  tax: invoice.tax,
  total: invoice.total,
})}
${renderNotes(notes)}
${renderTomsDocFooter({ staffName: header.staffName, paymentDueDate })}
<div class="doc-invoice-footer">
${renderBankBlock(header.bankInfo)}
<div class="doc-footer">${renderSealPlaceholder()}</div>
</div>
${photoBlock}
</div></body></html>`;
}
