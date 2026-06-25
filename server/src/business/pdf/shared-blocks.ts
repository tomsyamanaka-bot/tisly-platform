import type { BusinessPhoto } from "../business-types.js";
import { formatTomsAddressee } from "../toms-document-format.js";
import { getTomsCompanyInfo } from "./company.js";
import {
  escapeHtml,
  escapeHtmlMultiline,
  formatPhotoCircledNumber,
} from "./pdf-base-template.js";

export { escapeHtml, escapeHtmlMultiline, formatPhotoCircledNumber };

/** business モジュール完了報告書（レガシー）向けシンプルヘッダー */
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
  rows.push(`<p class="recipient"><strong>${escapeHtml(formatTomsAddressee(input.customerName))}</strong></p>`);
  if (input.customerAddress) {
    rows.push(`<p class="meta">ご住所: ${escapeHtml(input.customerAddress)}</p>`);
  }
  rows.push('<div class="site-block">');
  rows.push("<strong>工事内容</strong>");
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

export function renderNotes(notes: string): string {
  if (!notes?.trim()) return "";
  return `<div class="toms-official-notes"><strong>〈備考〉</strong><br/>${escapeHtmlMultiline(notes)}</div>`;
}

export function renderPhotoGrid(photos: BusinessPhoto[], includeImages = false): string {
  const items = photos.slice(0, 20);
  const slots = items
    .map((p, i) => {
      const num = formatPhotoCircledNumber(i + 1);
      const title = (p.caption || p.fileName || `写真${i + 1}`).trim();
      if (includeImages && p.urlPath) {
        return `<div class="photo-slot"><div class="photo-img-wrap"><img src="${escapeHtml(p.urlPath)}" alt="${escapeHtml(title)}"/></div><p class="photo-title"><span class="photo-num">${num}</span> ${escapeHtml(title)}</p></div>`;
      }
      return `<div class="photo-slot"><p class="photo-title"><span class="photo-num">${num}</span> ${escapeHtml(title)}</p></div>`;
    })
    .join("");
  if (!slots) return "";
  return `<h3 class="photo-section-title">参考写真</h3><div class="photos">${slots}</div>`;
}

export function renderSealPlaceholder(): string {
  return `<div class="seal-placeholder" title="印影 placeholder">印</div>`;
}
