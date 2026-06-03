import type { BusinessProject, Invoice } from "../business-types.js";
import { TOMS_PDF_STYLES } from "./styles.js";
import {
  escapeHtml,
  renderBankQrPlaceholder,
  renderCustomerBlock,
  renderLineItemsTable,
  renderNotes,
  renderPdfHeader,
  renderSealPlaceholder,
  renderTotals,
} from "./shared-blocks.js";

export function renderInvoiceHtml(project: BusinessProject, invoice: Invoice): string {
  const items = invoice.items.map((i) => ({
    ...i,
    taxType: "課税10%",
  }));
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"/><title>請求 ${escapeHtml(invoice.invoiceNo)}</title><style>${TOMS_PDF_STYLES}</style></head><body>
<div class="doc">
${renderPdfHeader("請求書", invoice.invoiceNo)}
${renderCustomerBlock(project.customerName, project.title, project.address, project.projectNo)}
<p class="meta">支払期限: ${escapeHtml(invoice.paymentDueDate ?? "—")}</p>
${renderLineItemsTable(items)}
${renderTotals(invoice.subtotal, invoice.tax, invoice.total)}
${renderBankQrPlaceholder(invoice.bankInfo)}
${renderNotes("")}
<div class="doc-footer">${renderSealPlaceholder()}</div>
</div></body></html>`;
}
