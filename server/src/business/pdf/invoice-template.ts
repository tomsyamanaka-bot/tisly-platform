import type { BusinessProject, Invoice } from "../business-types.js";
import { getTomsCompanyInfo } from "./company.js";
import { TOMS_PDF_STYLES } from "./styles.js";

export function renderInvoiceHtml(project: BusinessProject, invoice: Invoice): string {
  const co = getTomsCompanyInfo();
  const rows = invoice.items
    .map(
      (i) =>
        `<tr><td>${escapeHtml(i.name)}</td><td class="num">${i.quantity}</td><td>${escapeHtml(i.unit)}</td><td class="num">¥${i.unitPrice.toLocaleString("ja-JP")}</td><td class="num">¥${i.amount.toLocaleString("ja-JP")}</td></tr>`
    )
    .join("");
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"/><title>請求 ${escapeHtml(invoice.invoiceNo)}</title><style>${TOMS_PDF_STYLES}</style></head><body>
<div class="doc">
<header>
  <div><img class="logo" src="${escapeHtml(co.logoUrl)}" alt="TOMS"/><h1>請求書</h1><p class="meta">${escapeHtml(invoice.invoiceNo)}</p></div>
  <div class="company">${escapeHtml(co.name)}<br/>〒${escapeHtml(co.postalCode)} ${escapeHtml(co.address)}<br/>TEL ${escapeHtml(co.phone)}</div>
</header>
<p><strong>宛名</strong> ${escapeHtml(project.customerName)} 様</p>
<p><strong>件名</strong> ${escapeHtml(project.title)}</p>
<p class="meta">支払期限: ${escapeHtml(invoice.paymentDueDate ?? "—")}</p>
<table class="items"><thead><tr><th>品名</th><th>数量</th><th>単位</th><th>単価</th><th>金額</th></tr></thead><tbody>${rows}</tbody></table>
<div class="totals">
  <div><span>小計（税抜）</span><span>¥${invoice.subtotal.toLocaleString("ja-JP")}</span></div>
  <div><span>消費税</span><span>¥${invoice.tax.toLocaleString("ja-JP")}</span></div>
  <div class="grand"><span>税込合計</span><span>¥${invoice.total.toLocaleString("ja-JP")}</span></div>
</div>
<div class="notes"><strong>振込先</strong><br/>${escapeHtml(invoice.bankInfo || "—")}</div>
</div></body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
