import { getTomsCompanyInfo } from "./company.js";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderPdfHeader(docTitle: string, docNo: string): string {
  const co = getTomsCompanyInfo();
  return `<header>
  <div><img class="logo" src="${escapeHtml(co.logoUrl)}" alt="TOMS"/><h1>${escapeHtml(docTitle)}</h1><p class="meta">${escapeHtml(docNo)}</p></div>
  <div class="company">${escapeHtml(co.name)}<br/>〒${escapeHtml(co.postalCode)} ${escapeHtml(co.address)}<br/>TEL ${escapeHtml(co.phone)}<br/>${escapeHtml(co.email)}${co.registrationNo ? `<br/>登録番号 ${escapeHtml(co.registrationNo)}` : ""}</div>
</header>`;
}

export function renderCustomerBlock(customerName: string, title: string, address: string, projectNo: string): string {
  return `<p><strong>宛名</strong> ${escapeHtml(customerName)} 様</p>
<p><strong>件名</strong> ${escapeHtml(title)}</p>
<p class="meta">住所: ${escapeHtml(address || "—")} · 案件番号 ${escapeHtml(projectNo)}</p>`;
}

export function renderLineItemsTable(
  items: Array<{ name: string; quantity: number; unit: string; unitPrice: number; amount: number; taxType?: string }>
): string {
  const rows = items
    .map(
      (i) =>
        `<tr><td>${escapeHtml(i.name)}</td><td class="num">${i.quantity}</td><td>${escapeHtml(i.unit)}</td><td>${escapeHtml(i.taxType ?? "課税")}</td><td class="num">¥${i.unitPrice.toLocaleString("ja-JP")}</td><td class="num">¥${i.amount.toLocaleString("ja-JP")}</td></tr>`
    )
    .join("");
  return `<table class="items"><thead><tr><th>品名</th><th>数量</th><th>単位</th><th>税区分</th><th>単価</th><th>金額</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function renderTotals(subtotal: number, tax: number, total: number): string {
  return `<div class="totals">
  <div><span>小計（税抜）</span><span>¥${subtotal.toLocaleString("ja-JP")}</span></div>
  <div><span>消費税</span><span>¥${tax.toLocaleString("ja-JP")}</span></div>
  <div class="grand"><span>税込合計</span><span>¥${total.toLocaleString("ja-JP")}</span></div>
</div>`;
}

export function renderNotes(notes: string): string {
  return `<div class="notes"><strong>備考</strong><br/>${escapeHtml(notes || "—")}</div>`;
}

export function renderPhotoGrid(photos: Array<{ fileName: string }>): string {
  const slots = photos
    .slice(0, 6)
    .map((p) => `<div class="photo-slot">${escapeHtml(p.fileName)}</div>`)
    .join("");
  if (!slots) return "";
  return `<h3>参考写真</h3><div class="photos">${slots}</div>`;
}

export function renderBankQrPlaceholder(bankInfo?: string): string {
  return `<div class="bank-block">
  <strong>振込先</strong><br/>${escapeHtml(bankInfo || "—")}
  <div class="qr-placeholder" title="振込QR placeholder">QR</div>
</div>`;
}

export function renderSealPlaceholder(): string {
  return `<div class="seal-placeholder" title="印影 placeholder">印</div>`;
}
