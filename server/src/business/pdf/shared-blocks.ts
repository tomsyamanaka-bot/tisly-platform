import type { BusinessPhoto } from "../business-types.js";
import type { TomsEstimateHeader, TomsInvoiceHeader } from "../toms-document-format.js";
import { getTomsCompanyInfo } from "./company.js";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escapeHtmlMultiline(s: string): string {
  return escapeHtml(s).replace(/\n/g, "<br/>");
}

export function renderPdfHeader(docTitle: string, docNo: string): string {
  const co = getTomsCompanyInfo();
  const emailLine = co.email ? `<br/>${escapeHtml(co.email)}` : "";
  return `<header>
  <div><img class="logo" src="${escapeHtml(co.logoUrl)}" alt="TOMS"/><h1>${escapeHtml(docTitle)}</h1><p class="meta doc-no">${escapeHtml(docNo)}</p></div>
  <div class="company">${escapeHtml(co.name)}<br/>〒${escapeHtml(co.postalCode)}<br/>${escapeHtml(co.address)}<br/>担当：${escapeHtml(co.representativeName)}<br/>TEL ${escapeHtml(co.phone)}${emailLine}<br/>登録番号 ${escapeHtml(co.registrationNo)}</div>
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

export function renderTomsEstimateHeaderTable(header: TomsEstimateHeader): string {
  const rows = [
    ["宛名", `${header.addressee} 様`],
    ["件名", header.subject],
    ["発行日", header.issueDate],
    ["見積番号", header.estimateNo],
    ["担当者", header.staffName],
    ["現場名", header.siteName],
    ["工事場所", header.workLocation],
  ];
  const body = rows
    .map(
      ([label, value]) =>
        `<tr><th class="hdr-label">${escapeHtml(label)}</th><td class="hdr-value">${escapeHtmlMultiline(value)}</td></tr>`
    )
    .join("");
  return `<table class="header-table"><tbody>${body}</tbody></table>`;
}

export function renderTomsInvoiceHeaderTable(header: TomsInvoiceHeader): string {
  const rows = [
    ["宛名", `${header.addressee} 様`],
    ["件名", header.subject],
    ["請求日", header.invoiceDate],
    ["請求番号", header.invoiceNo],
    ["見積参照番号", header.estimateRefNo],
    ["担当者", header.staffName],
    ["現場名", header.siteName],
    ["工事場所", header.workLocation],
  ];
  const body = rows
    .map(
      ([label, value]) =>
        `<tr><th class="hdr-label">${escapeHtml(label)}</th><td class="hdr-value">${escapeHtmlMultiline(value)}</td></tr>`
    )
    .join("");
  return `<table class="header-table"><tbody>${body}</tbody></table>`;
}

export function renderTomsLineItemsTable(
  items: Array<{ lineNo?: number; description: string; quantity: number; unitPrice: number; amount: number }>
): string {
  const rows = items
    .map(
      (i, idx) =>
        `<tr><td class="num col-no">${i.lineNo ?? idx + 1}</td><td class="col-desc">${escapeHtmlMultiline(i.description)}</td><td class="num col-qty">${i.quantity}</td><td class="num col-price">¥${i.unitPrice.toLocaleString("ja-JP")}</td><td class="num col-amount">¥${i.amount.toLocaleString("ja-JP")}</td></tr>`
    )
    .join("");
  return `<table class="items toms-items"><thead><tr><th class="col-no">No</th><th class="col-desc">適用</th><th class="col-qty">数量</th><th class="col-price">単価</th><th class="col-amount">金額</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function renderLineItemsTable(
  items: Array<{ name: string; quantity: number; unit: string; unitPrice: number; amount: number; taxType?: string; memo?: string }>
): string {
  return renderTomsLineItemsTable(
    items.map((i, idx) => ({
      lineNo: idx + 1,
      description: i.memo ? `${i.name}\n${i.memo}` : i.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      amount: i.amount,
    }))
  );
}

export function renderTotals(subtotal: number, tax: number, total: number): string {
  return `<div class="totals">
  <div><span>小計（税抜）</span><span>¥${subtotal.toLocaleString("ja-JP")}</span></div>
  <div><span>消費税</span><span>¥${tax.toLocaleString("ja-JP")}</span></div>
  <div class="grand"><span>税込合計</span><span>¥${total.toLocaleString("ja-JP")}</span></div>
</div>`;
}

export function renderNotes(notes: string): string {
  return `<div class="notes"><strong>備考</strong><br/>${escapeHtmlMultiline(notes || "—")}</div>`;
}

export function renderPhotoGrid(photos: BusinessPhoto[], includeImages = false): string {
  const slots = photos
    .slice(0, 6)
    .map((p) => {
      if (includeImages && p.urlPath) {
        return `<div class="photo-slot"><img src="${escapeHtml(p.urlPath)}" alt="${escapeHtml(p.fileName)}"/><span class="photo-caption">${escapeHtml(p.caption || p.fileName)}</span></div>`;
      }
      return `<div class="photo-slot">${escapeHtml(p.fileName)}</div>`;
    })
    .join("");
  if (!slots) return "";
  return `<h3>参考写真</h3><div class="photos">${slots}</div>`;
}

export function renderBankBlock(bankInfo: string): string {
  return `<div class="bank-block">
  <strong>振込先</strong><br/>${escapeHtmlMultiline(bankInfo || "—")}
</div>`;
}

export function renderBankQrPlaceholder(bankInfo?: string): string {
  return `${renderBankBlock(bankInfo || "—")}
  <div class="qr-placeholder" title="振込QR placeholder">QR</div>`;
}

export function renderSealPlaceholder(): string {
  return `<div class="seal-placeholder" title="印影 placeholder">印</div>`;
}
