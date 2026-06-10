import type { BusinessProject, Estimate, Invoice } from "../business-types.js";
import { buildCustomerFacingPdfNotes } from "../customer-price-rules.js";
import {
  formatTomsIssueDate,
  itemsToTomsLines,
  TOMS_DEFAULT_STAFF,
  type TomsInvoiceHeader,
} from "../toms-document-format.js";
import { TOMS_PDF_STYLES, TOMS_PDF_VIEWPORT_META } from "./styles.js";
import {
  escapeHtml,
  renderBankBlock,
  renderNotes,
  renderPhotoGrid,
  renderSealPlaceholder,
  renderTomsOfficialDocLayout,
  renderTomsLineItemsTable,
  renderTotals,
} from "./shared-blocks.js";

export interface InvoiceHtmlOptions {
  header?: TomsInvoiceHeader | null;
  estimateRefNo?: string;
  notes?: string | null;
  includePhotos?: boolean;
  priceRuleName?: string | null;
  shuseiDiscount?: number;
  shuseiDiscountMemo?: string;
  lineSubtotal?: number;
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
  const header = buildInvoiceHeader(project, invoice, estimate, opts);
  const lines = itemsToTomsLines(invoice.items);
  const notes = buildCustomerFacingPdfNotes(
    opts?.notes ?? project.surveyMemo ?? "",
    opts?.priceRuleName ?? estimate.priceRuleName
  );
  const includePhotos = opts?.includePhotos === true;
  const photoBlock =
    includePhotos && project.surveyPhotos?.length
      ? renderPhotoGrid(project.surveyPhotos, true)
      : "";
  const pageClass = includePhotos ? "doc with-photos" : "doc single-page";

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"/>${TOMS_PDF_VIEWPORT_META}<title>御請求書 ${escapeHtml(header.invoiceNo)}</title><style>${TOMS_PDF_STYLES}</style></head><body>
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
  extraMetaRows: [{ label: "見積参照番号", value: header.estimateRefNo }],
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
${renderBankBlock(header.bankInfo)}
${photoBlock}
<div class="doc-footer">${renderSealPlaceholder()}</div>
</div></body></html>`;
}
