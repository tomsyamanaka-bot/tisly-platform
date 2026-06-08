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
  return renderTomsCustomerSiteBlock({
    customerName,
    siteName: title,
    siteAddress: address,
    projectNo,
  });
}

export interface TomsCustomerSiteBlockInput {
  customerName: string;
  customerAddress?: string | null;
  siteName?: string | null;
  siteAddress?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  projectNo: string;
  estimateDate?: string | null;
}

export function renderTomsCustomerSiteBlock(input: TomsCustomerSiteBlockInput): string {
  const rows: string[] = [];
  rows.push(`<p class="recipient"><strong>${escapeHtml(input.customerName)}</strong> 様</p>`);
  if (input.customerAddress) {
    rows.push(`<p class="meta">ご住所: ${escapeHtml(input.customerAddress)}</p>`);
  }
  rows.push('<div class="site-block">');
  rows.push("<strong>工事内容</strong>");
  if (input.siteName) rows.push(`<p>現場名: ${escapeHtml(input.siteName)}</p>`);
  if (input.siteAddress) rows.push(`<p>工事場所: ${escapeHtml(input.siteAddress)}</p>`);
  if (input.contactName) rows.push(`<p>ご担当: ${escapeHtml(input.contactName)}</p>`);
  if (input.phone) rows.push(`<p>TEL: ${escapeHtml(input.phone)}</p>`);
  if (input.email) rows.push(`<p>Email: ${escapeHtml(input.email)}</p>`);
  rows.push("</div>");
  const meta = [
    input.estimateDate ? `見積日: ${escapeHtml(input.estimateDate)}` : "",
    `案件番号 ${escapeHtml(input.projectNo)}`,
  ]
    .filter(Boolean)
    .join(" · ");
  rows.push(`<p class="meta">${meta}</p>`);
  return rows.join("\n");
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
