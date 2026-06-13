import type { BusinessPhoto } from "../business-types.js";
import { formatTomsAddressee } from "../toms-document-format.js";
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

export interface TomsDocHeaderInput {
  docTitle: string;
  addressee: string;
  subject: string;
  issueDateLabel: string;
  issueDate: string;
  docNoLabel: string;
  docNo: string;
  /** @deprecated TOMS Official Layout v1 では常にインボイス番号を表示 */
  includeRegistrationNo?: boolean;
  workLocation?: string;
}

export interface TomsOfficialDocLayoutInput {
  docTitle: string;
  amountLabel: string;
  addressee: string;
  subject: string;
  workLocation?: string;
  issueDateLabel: string;
  issueDate: string;
  docNoLabel: string;
  docNo: string;
  total: number;
  extraMetaRows?: Array<{ label: string; value: string }>;
}

export interface TomsDocFooterInput {
  staffName: string;
  validUntil?: string;
  paymentDueDate?: string;
}

export interface TomsOfficialReportHeaderInput {
  docTitle: string;
  addressee: string;
  subject: string;
  workLocation?: string;
  /** @default 工事場所 */
  workLocationLabel?: string;
  notes?: string;
  issueDateLabel: string;
  issueDate: string;
  docNoLabel?: string;
  docNo?: string;
  includeRegistrationNo?: boolean;
  compact?: boolean;
}

export function renderTomsOfficialReportHeader(input: TomsOfficialReportHeaderInput): string {
  const co = getTomsCompanyInfo();
  const addressee = formatTomsAddressee(input.addressee);
  const locLabel = input.workLocationLabel ?? "工事場所";
  const workLocation = input.workLocation?.trim()
    ? `<p class="toms-official-field"><span class="toms-official-field-label">${escapeHtml(locLabel)}</span>${escapeHtml(input.workLocation.trim())}</p>`
    : "";
  const notes = input.notes?.trim()
    ? `<p class="toms-official-field toms-official-notes-inline"><span class="toms-official-field-label">現調メモ</span>${escapeHtmlMultiline(input.notes.trim())}</p>`
    : "";
  const docNoRow =
    input.docNoLabel?.trim() && input.docNo?.trim()
      ? `<tr><th>${escapeHtml(input.docNoLabel)}</th><td>${escapeHtml(input.docNo)}</td></tr>`
      : "";
  const regRow =
    input.includeRegistrationNo !== false
      ? `<tr><th>インボイス番号</th><td>${escapeHtml(co.registrationNo)}</td></tr>`
      : "";
  const compactClass = input.compact !== false ? " toms-official-compact" : "";
  return `<div class="toms-official${compactClass}">
  <div class="toms-official-header">
    <div class="toms-official-header-main">
      <div class="toms-official-title-band"><h1>${escapeHtml(input.docTitle)}</h1></div>
      <p class="toms-official-addressee">${escapeHtml(addressee)}</p>
      <p class="toms-official-field"><span class="toms-official-field-label">件名</span>${escapeHtml(input.subject)}</p>
      ${workLocation}
      ${notes}
    </div>
    <div class="toms-official-header-side">
      <div class="toms-official-company">
        <div class="toms-official-company-name">${escapeHtml(co.name)}</div>
        <div>〒${escapeHtml(co.postalCode)}</div>
        <div>${escapeHtml(co.address)}</div>
        <div>TEL ${escapeHtml(co.phone)}</div>
        <div>担当 ${escapeHtml(co.representativeName)}</div>
      </div>
      <table class="toms-official-meta">
        <tr><th>${escapeHtml(input.issueDateLabel)}</th><td>${escapeHtml(input.issueDate || "—")}</td></tr>
        ${docNoRow}
        ${regRow}
      </table>
    </div>
  </div>
</div>`;
}

export function renderTomsOfficialDocLayout(input: TomsOfficialDocLayoutInput): string {
  const co = getTomsCompanyInfo();
  const addressee = formatTomsAddressee(input.addressee);
  const subject = input.subject?.trim() || "未設定";
  const workLocation = input.workLocation?.trim() || "未設定";
  const extraRows = (input.extraMetaRows ?? [])
    .filter((row) => row.value.trim())
    .map(
      (row) =>
        `<tr><th>${escapeHtml(row.label)}</th><td>${escapeHtml(row.value)}</td></tr>`
    )
    .join("");
  return `<div class="toms-official">
  <div class="toms-official-header">
    <div class="toms-official-header-main">
      <div class="toms-official-title-band"><h1>${escapeHtml(input.docTitle)}</h1></div>
      <p class="toms-official-addressee">${escapeHtml(addressee)}</p>
      <p class="toms-official-field"><span class="toms-official-field-label">件名</span>${escapeHtml(subject)}</p>
      <p class="toms-official-field"><span class="toms-official-field-label">作業場所</span>${escapeHtml(workLocation)}</p>
    </div>
    <div class="toms-official-header-side">
      <div class="toms-official-company">
        <div class="toms-official-company-name">${escapeHtml(co.name)}</div>
        <div>〒${escapeHtml(co.postalCode)}</div>
        <div>${escapeHtml(co.address)}</div>
        <div>TEL ${escapeHtml(co.phone)}</div>
        <div>担当 ${escapeHtml(co.representativeName)}</div>
      </div>
      <table class="toms-official-meta">
        <tr><th>${escapeHtml(input.issueDateLabel)}</th><td>${escapeHtml(input.issueDate)}</td></tr>
        <tr><th>${escapeHtml(input.docNoLabel)}</th><td>${escapeHtml(input.docNo)}</td></tr>
        <tr><th>インボイス番号</th><td>${escapeHtml(co.registrationNo)}</td></tr>
        ${extraRows}
      </table>
    </div>
  </div>
  <div class="toms-official-amount">
    <span class="toms-official-amount-label">${escapeHtml(input.amountLabel)}</span>
    <span class="toms-official-amount-value">¥${input.total.toLocaleString("ja-JP")}<span class="toms-official-amount-tax">（税込）</span></span>
  </div>
</div>`;
}

export function renderTomsDocFooter(input: TomsDocFooterInput): string {
  const staff = input.staffName?.trim() || "未設定";
  const rows: string[] = [];
  if (input.validUntil?.trim()) {
    rows.push(
      `<p class="toms-official-field"><span class="toms-official-field-label">有効期限</span>${escapeHtml(input.validUntil.trim())}</p>`
    );
  }
  if (input.paymentDueDate?.trim()) {
    rows.push(
      `<p class="toms-official-field"><span class="toms-official-field-label">支払期限</span>${escapeHtml(input.paymentDueDate.trim())}</p>`
    );
  }
  rows.push(
    `<p class="toms-official-field"><span class="toms-official-field-label">担当者</span>${escapeHtml(staff)}</p>`
  );
  return `<div class="toms-official-footer">${rows.join("")}</div>`;
}

export function renderTomsDocLayoutHeader(input: TomsDocHeaderInput): string {
  const co = getTomsCompanyInfo();
  const addressee = formatTomsAddressee(input.addressee);
  const regRow =
    input.includeRegistrationNo !== false
      ? `<tr><th>登録番号</th><td>${escapeHtml(co.registrationNo)}</td></tr>`
      : "";
  return `<div class="toms-doc-header">
  <div class="toms-doc-left">
    <h1 class="toms-doc-title">${escapeHtml(input.docTitle)}</h1>
    <p class="toms-addressee">${escapeHtml(addressee)}</p>
    <p class="toms-subject"><span class="toms-subject-label">件名</span> ${escapeHtml(input.subject)}</p>
    ${input.workLocation?.trim() ? `<p class="toms-subject"><span class="toms-subject-label">工事場所</span> ${escapeHtml(input.workLocation.trim())}</p>` : ""}
  </div>
  <div class="toms-doc-right">
    <table class="toms-meta-table">
      <tr><th>${escapeHtml(input.issueDateLabel)}</th><td>${escapeHtml(input.issueDate)}</td></tr>
      <tr><th>${escapeHtml(input.docNoLabel)}</th><td>${escapeHtml(input.docNo)}</td></tr>
      ${regRow}
    </table>
    <div class="toms-company-block">
      <div class="toms-company-name">${escapeHtml(co.name)}</div>
      <div>〒${escapeHtml(co.postalCode)}</div>
      <div>${escapeHtml(co.address)}</div>
      <div>TEL：${escapeHtml(co.phone)}</div>
      <div>担当：${escapeHtml(co.representativeName)}</div>
    </div>
  </div>
</div>`;
}

export function renderAmountBanner(total: number): string {
  return `<div class="amount-banner">
  <div class="amount-banner-label">御見積金額</div>
  <div class="amount-banner-total">¥${total.toLocaleString("ja-JP")}<span class="amount-tax-note">（税込）</span></div>
</div>`;
}

export function renderTomsEstimateStandardHeader(header: TomsEstimateHeader): string {
  const addressee = formatTomsAddressee(header.addressee);
  return `<div class="toms-estimate-head">
  <h1 class="toms-doc-title">お見積書</h1>
  <p class="toms-addressee">${escapeHtml(addressee)}</p>
  <p class="toms-subject"><span class="toms-subject-label">件名</span> ${escapeHtml(header.subject)}</p>
  <table class="toms-meta-table toms-meta-inline">
    <tr><th>発行日</th><td>${escapeHtml(header.issueDate)}</td></tr>
    <tr><th>見積番号</th><td>${escapeHtml(header.estimateNo)}</td></tr>
  </table>
</div>`;
}

export function renderTomsCompanyFooter(): string {
  const co = getTomsCompanyInfo();
  const emailLine = co.email ? `<div>${escapeHtml(co.email)}</div>` : "";
  return `<div class="toms-company-footer">
  <div class="toms-company-name">${escapeHtml(co.name)}</div>
  <div>〒${escapeHtml(co.postalCode)} ${escapeHtml(co.address)}</div>
  <div>TEL ${escapeHtml(co.phone)}</div>
  <div>担当 ${escapeHtml(co.representativeName)}</div>
  ${emailLine}
</div>`;
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

export function renderTomsEstimateHeaderTable(header: TomsEstimateHeader): string {
  const rows = [
    ["宛名", formatTomsAddressee(header.addressee)],
    ["件名", header.subject],
    ["発行日", header.issueDate],
    ["見積番号", header.estimateNo],
    ["担当者", header.staffName],
    ["工事場所", header.workLocation],
    ["住所", header.address ?? ""],
    ["電話", header.phone ?? ""],
    ["メール", header.email ?? ""],
  ].filter(([, value]) => value !== "");
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
    ["宛名", formatTomsAddressee(header.addressee)],
    ["件名", header.subject],
    ["請求日", header.invoiceDate],
    ["請求番号", header.invoiceNo],
    ["見積参照番号", header.estimateRefNo],
    ["担当者", header.staffName],
    ["工事場所", header.workLocation],
    ["住所", header.address ?? ""],
    ["電話", header.phone ?? ""],
    ["メール", header.email ?? ""],
  ].filter(([, value]) => value !== "");
  const body = rows
    .map(
      ([label, value]) =>
        `<tr><th class="hdr-label">${escapeHtml(label)}</th><td class="hdr-value">${escapeHtmlMultiline(value)}</td></tr>`
    )
    .join("");
  return `<table class="header-table"><tbody>${body}</tbody></table>`;
}

/** PDF専用 A4 横書き明細（見積・請求）— 旧 toms-official-items は使用しない */
export function renderPdfA4LineItemsTable(
  items: Array<{
    lineNo?: number;
    description: string;
    quantity: number;
    unit?: string;
    unitPrice: number;
    amount: number;
  }>
): string {
  const rows = items
    .map(
      (i, idx) =>
        `<tr><td class="num col-no">${i.lineNo ?? idx + 1}</td><td class="col-desc">${escapeHtmlMultiline(i.description)}</td><td class="num col-qty">${i.quantity}</td><td class="col-unit">${escapeHtml(i.unit ?? "")}</td><td class="num col-price">¥${i.unitPrice.toLocaleString("ja-JP")}</td><td class="num col-amount">¥${i.amount.toLocaleString("ja-JP")}</td></tr>`
    )
    .join("");
  return `<table class="pdf-a4-line-items"><colgroup><col style="width:5%"/><col style="width:48%"/><col style="width:8%"/><col style="width:8%"/><col style="width:15%"/><col style="width:16%"/></colgroup><thead><tr><th class="col-no">No</th><th class="col-desc">項目</th><th class="col-qty">数量</th><th class="col-unit">単位</th><th class="col-price">単価</th><th class="col-amount">金額</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function renderTomsLineItemsTable(
  items: Array<{
    lineNo?: number;
    description: string;
    quantity: number;
    unit?: string;
    unitPrice: number;
    amount: number;
  }>
): string {
  return renderPdfA4LineItemsTable(items);
}

export function renderLineItemsTable(
  items: Array<{ name: string; quantity: number; unit: string; unitPrice: number; amount: number; taxType?: string; memo?: string }>
): string {
  return renderTomsLineItemsTable(
    items.map((i, idx) => ({
      lineNo: idx + 1,
      description: i.memo ? `${i.name}\n${i.memo}` : i.name,
      quantity: i.quantity,
      unit: i.unit,
      unitPrice: i.unitPrice,
      amount: i.amount,
    }))
  );
}

export interface RenderTotalsInput {
  lineSubtotal?: number;
  shuseiDiscount?: number;
  shuseiDiscountMemo?: string;
  subtotal: number;
  tax: number;
  total: number;
}

export function renderTotals(input: RenderTotalsInput): string;
export function renderTotals(subtotal: number, tax: number, total: number): string;
export function renderTotals(
  subtotalOrInput: number | RenderTotalsInput,
  tax?: number,
  total?: number
): string {
  const data: RenderTotalsInput =
    typeof subtotalOrInput === "object"
      ? subtotalOrInput
      : { subtotal: subtotalOrInput, tax: tax ?? 0, total: total ?? 0 };
  const lineSubtotal = data.lineSubtotal ?? data.subtotal + (data.shuseiDiscount ?? 0);
  const discount = data.shuseiDiscount ?? 0;
  const discountRow =
    discount > 0
      ? `<div class="discount-row"><span>出精値引き${data.shuseiDiscountMemo?.trim() ? `（${escapeHtml(data.shuseiDiscountMemo.trim())}）` : ""}</span><span>-¥${discount.toLocaleString("ja-JP")}</span></div>`
      : "";
  const lineRow =
    discount > 0
      ? `<div><span>明細合計（税抜）</span><span>¥${lineSubtotal.toLocaleString("ja-JP")}</span></div>`
      : "";
  const taxBreakdown = `<div class="toms-official-tax-breakdown">
    <div><span>税率内訳（10%）</span><span></span></div>
    <div><span>10%対象額</span><span>¥${data.subtotal.toLocaleString("ja-JP")}</span></div>
    <div><span>消費税</span><span>¥${data.tax.toLocaleString("ja-JP")}</span></div>
  </div>`;
  return `<div class="toms-official-totals">
  ${lineRow}
  ${discountRow}
  <div><span>小計</span><span>¥${data.subtotal.toLocaleString("ja-JP")}</span></div>
  <div><span>消費税</span><span>¥${data.tax.toLocaleString("ja-JP")}</span></div>
  <div class="grand"><span>税込合計</span><span>¥${data.total.toLocaleString("ja-JP")}</span></div>
  ${taxBreakdown}
</div>`;
}

export function renderPriceRuleLine(ruleName?: string | null): string {
  const name = (ruleName ?? "").trim();
  if (!name || name === "手動調整") return "";
  return `<p class="price-rule-line">単価ルール：${escapeHtml(name)}</p>`;
}

export function renderNotes(notes: string): string {
  if (!notes?.trim()) return "";
  return `<div class="toms-official-notes"><strong>〈備考〉</strong><br/>${escapeHtmlMultiline(notes)}</div>`;
}

export function renderPhotoGrid(photos: BusinessPhoto[], includeImages = false): string {
  const slots = photos
    .slice(0, 20)
    .map((p) => {
      if (includeImages && p.urlPath) {
        return `<div class="photo-slot"><img src="${escapeHtml(p.urlPath)}" alt="${escapeHtml(p.fileName)}"/><span class="photo-caption">${escapeHtml(p.caption || p.fileName)}</span></div>`;
      }
      return `<div class="photo-slot">${escapeHtml(p.fileName)}</div>`;
    })
    .join("");
  if (!slots) return "";
  return `<h3 class="photo-section-title">参考写真</h3><div class="photos">${slots}</div>`;
}

export function renderBankBlock(bankInfo: string): string {
  const info = bankInfo?.trim() || "—";
  return `<div class="bank-block">
  <strong>振込先</strong><br/>${escapeHtmlMultiline(info)}
</div>`;
}

export function renderBankQrPlaceholder(bankInfo?: string): string {
  return `${renderBankBlock(bankInfo || "—")}
  <div class="qr-placeholder" title="振込QR placeholder">QR</div>`;
}

export function renderSealPlaceholder(): string {
  return `<div class="seal-placeholder" title="印影 placeholder">印</div>`;
}
