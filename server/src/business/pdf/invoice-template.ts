import type { BusinessProject, Estimate, Invoice } from "../business-types.js";
import {
  formatTomsIssueDate,
  itemsToTomsLines,
  TOMS_DEFAULT_STAFF,
  type TomsInvoiceHeader,
} from "../toms-document-format.js";
import { TOMS_PDF_STYLES } from "./styles.js";
import {
  escapeHtml,
  renderBankBlock,
  renderPdfHeader,
  renderSealPlaceholder,
  renderTomsInvoiceHeaderTable,
  renderTomsLineItemsTable,
  renderTotals,
} from "./shared-blocks.js";

export interface InvoiceHtmlOptions {
  header?: TomsInvoiceHeader | null;
  estimateRefNo?: string;
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

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"/><title>御請求書 ${escapeHtml(header.invoiceNo)}</title><style>${TOMS_PDF_STYLES}</style></head><body>
<div class="doc single-page">
${renderPdfHeader("御請求書", header.invoiceNo)}
${renderTomsInvoiceHeaderTable(header)}
<p class="intro">下記の通りご請求申し上げます。</p>
${renderTomsLineItemsTable(lines)}
${renderTotals(invoice.subtotal, invoice.tax, invoice.total)}
${renderBankBlock(header.bankInfo)}
<div class="doc-footer">${renderSealPlaceholder()}</div>
</div></body></html>`;
}
