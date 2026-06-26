/**
 * TOMS Excel-style document layout v2 — 見積書・請求書共通
 * 添付マスタ画像（Excel帳票風）に合わせた HTML/CSS
 */
import { getTomsCompanyInfo } from "./company.js";
import {
  PDF_TOMS_V2_PAGE_MARGIN_MM,
  escapeHtml,
  escapeHtmlMultiline,
  renderPdfCompanyDetailBlock,
  renderPdfPageNumberFooter,
  renderPdfSealImg,
  wrapPdfHtmlDocument,
} from "./pdf-base-template.js";

export const TOMS_V2_PAGE_MARGIN_MM = PDF_TOMS_V2_PAGE_MARGIN_MM;
export const TOMS_V2_FRAME_WIDTH_MM = 194;
export const TOMS_V2_FRAME_HEIGHT_MM = 281;

/** 1ページ目の明細行上限（ヘッダー・合計欄の余白込み・空行で表を下まで伸ばす） */
export const TOMS_V2_FIRST_PAGE_ROWS = 18;
/** 2ページ目以降の明細行上限 */
export const TOMS_V2_CONTINUATION_PAGE_ROWS = 22;

export const TOMS_V2_GRAY = "#d3d3d3";
export const TOMS_V2_ROW_BLUE = "#e6f2ff";
/** 明細 tbody 行の固定高さ（データ行・空行共通） */
export const TOMS_V2_LINE_ROW_HEIGHT_MM = 6.2;

export type TomsV2DocKind = "estimate" | "invoice";

export interface TomsV2LineItem {
  lineNo?: number;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface TomsV2TotalsInput {
  lineSubtotal?: number;
  shuseiDiscount?: number;
  shuseiDiscountMemo?: string;
  subtotal: number;
  tax: number;
  total: number;
}

export interface TomsV2PageContext {
  kind: TomsV2DocKind;
  docTitle: string;
  introText: string;
  addressee: string;
  subject: string;
  workLocation?: string;
  projectNo?: string;
  issueDateLabel: string;
  issueDate: string;
  docNoLabel: string;
  docNo: string;
  includeRegistrationNo: boolean;
  staffName: string;
  total: number;
  lines: TomsV2LineItem[];
  totals: TomsV2TotalsInput;
  notes: string;
  bankInfo?: string;
  extraMetaRows?: Array<{ label: string; value: string }>;
  footerExtras?: string;
}

function chunkLines(lines: TomsV2LineItem[], firstMax: number, contMax: number): TomsV2LineItem[][] {
  if (lines.length <= firstMax) return [lines];
  const pages: TomsV2LineItem[][] = [lines.slice(0, firstMax)];
  let i = firstMax;
  while (i < lines.length) {
    pages.push(lines.slice(i, i + contMax));
    i += contMax;
  }
  return pages;
}

/** 宛名を名前部分と敬称に分割（Excel帳票風下線レイアウト用） */
export function splitTomsV2Addressee(raw: string): { name: string; honorific: string } {
  const trimmed = (raw || "").trim();
  if (!trimmed || trimmed === "未設定") return { name: "未設定", honorific: "様" };
  const sama = trimmed.match(/^(.+?)\s*様\s*$/);
  if (sama) return { name: sama[1].trim(), honorific: "様" };
  const onchu = trimmed.match(/^(.+?)\s*御中\s*$/);
  if (onchu) return { name: onchu[1].trim(), honorific: "御中" };
  if (/株式会社|有限会社|合同会社|一般社団|学校法人|医療法人/.test(trimmed)) {
    return { name: trimmed, honorific: "御中" };
  }
  return { name: trimmed, honorific: "様" };
}

export { resolvePdfSealUrl as resolveTomsSealUrl } from "./pdf-base-template.js";

function formatDocNoDisplay(docNo: string): string {
  const trimmed = (docNo || "").trim();
  if (!trimmed) return "—";
  if (/^no\s*/i.test(trimmed)) return trimmed;
  const m = trimmed.match(/-(\d+)$/);
  if (m) return `No ${Number(m[1])}`;
  return trimmed;
}

function renderMetaRows(ctx: TomsV2PageContext): string {
  const co = getTomsCompanyInfo();
  const metaCell = (label: string, value: string) =>
    `<tr class="toms-v2-meta-row"><th><span class="toms-v2-meta-label">${escapeHtml(label)}</span><span class="toms-v2-meta-underline" aria-hidden="true"></span></th><td><span class="toms-v2-meta-value">${escapeHtml(value || "—")}</span><span class="toms-v2-meta-underline" aria-hidden="true"></span></td></tr>`;
  const rows: string[] = [
    metaCell(ctx.issueDateLabel, ctx.issueDate || "—"),
    metaCell(ctx.docNoLabel, formatDocNoDisplay(ctx.docNo)),
  ];
  if (ctx.projectNo?.trim()) {
    rows.push(metaCell("案件番号", ctx.projectNo.trim()));
  }
  if (ctx.includeRegistrationNo) {
    rows.push(metaCell("登録番号", co.registrationNo));
  }
  for (const row of ctx.extraMetaRows ?? []) {
    if (row.value.trim()) {
      rows.push(metaCell(row.label, row.value));
    }
  }
  const staff = ctx.staffName?.trim() || co.representativeName;
  rows.push(metaCell("担当", staff));
  return rows.join("");
}

function renderCompanyBlock(staffName: string, bankInfo?: string): string {
  return renderPdfCompanyDetailBlock({
    staffName,
    bankInfo,
    bandCssClass: "toms-v2-company-band",
    bodyCssClass: "toms-v2-company-body",
    bankCssClass: "toms-v2-bank",
  });
}

function renderSeal(): string {
  return renderPdfSealImg();
}

function renderHeaderLeft(ctx: TomsV2PageContext): string {
  const { name, honorific } = splitTomsV2Addressee(ctx.addressee);
  const subject = ctx.subject?.trim() || "未設定";
  const workLoc = ctx.workLocation?.trim()
    ? `<div class="toms-v2-subject-row">
      <span class="toms-v2-subject-label">施工場所：</span>
      <span class="toms-v2-subject-value">${escapeHtml(ctx.workLocation.trim())}</span>
    </div>
    <div class="toms-v2-subject-underline"></div>`
    : "";
  return `<div class="toms-v2-header-left">
  <div class="toms-v2-title-band">${escapeHtml(ctx.docTitle)}</div>
  <div class="toms-v2-addressee-row">
    <span class="toms-v2-addressee-name">${escapeHtml(name)}</span>
    <span class="toms-v2-addressee-honorific">${escapeHtml(honorific)}</span>
  </div>
  <div class="toms-v2-subject-row">
    <span class="toms-v2-subject-label">件名：</span>
    <span class="toms-v2-subject-value">${escapeHtml(subject)}</span>
  </div>
  <div class="toms-v2-subject-underline"></div>
  ${workLoc}
  <p class="toms-v2-intro">${escapeHtml(ctx.introText)}</p>
</div>`;
}

function renderHeaderRight(ctx: TomsV2PageContext): string {
  return `<div class="toms-v2-header-right">
  <table class="toms-v2-meta">${renderMetaRows(ctx)}</table>
  <div class="toms-v2-company-wrap">
    ${renderCompanyBlock(ctx.staffName, ctx.bankInfo)}
    ${renderSeal()}
  </div>
</div>`;
}

function renderAmountRow(total: number): string {
  return `<div class="toms-v2-amount-row">
  <span class="toms-v2-amount-label">金額</span>
  <span class="toms-v2-amount-value">¥${total.toLocaleString("ja-JP")}</span>
  <span class="toms-v2-amount-tax">（税込）</span>
</div>`;
}

function renderLineItemsTable(lines: TomsV2LineItem[], fillerCount: number): string {
  const rows = lines
    .map(
      (line, idx) =>
        `<tr class="toms-v2-row-data"><td class="col-no">${line.lineNo ?? idx + 1}</td><td class="col-desc">${escapeHtmlMultiline(line.description)}</td><td class="col-qty num">${line.quantity}</td><td class="col-price num">${line.unitPrice.toLocaleString("ja-JP")}</td><td class="col-amount num">${line.amount.toLocaleString("ja-JP")}</td></tr>`
    )
    .join("");
  const fillers = Array.from({ length: fillerCount }, () =>
    `<tr class="toms-v2-row-filler"><td class="col-no">&nbsp;</td><td class="col-desc">&nbsp;</td><td class="col-qty">&nbsp;</td><td class="col-price">&nbsp;</td><td class="col-amount">&nbsp;</td></tr>`
  ).join("");
  return `<div class="toms-v2-items-area"><table class="toms-v2-items">
<colgroup>
  <col class="col-no"/><col class="col-desc"/><col class="col-qty"/><col class="col-price"/><col class="col-amount"/>
</colgroup>
<thead><tr><th>No</th><th>摘要</th><th>数量</th><th>単価</th><th>金額</th></tr></thead>
<tbody>${rows}${fillers}</tbody>
</table></div>`;
}

function renderTotalsGrid(input: TomsV2TotalsInput): string {
  const discount = input.shuseiDiscount ?? 0;
  const discountRow =
    discount > 0
      ? `<tr><th>出精値引${input.shuseiDiscountMemo?.trim() ? `（${escapeHtml(input.shuseiDiscountMemo.trim())}）` : ""}</th><td class="num">-${discount.toLocaleString("ja-JP")}</td></tr>`
      : "";
  return `<table class="toms-v2-totals">
${discountRow}
<tr><th>小計</th><td class="num">${input.subtotal.toLocaleString("ja-JP")}</td></tr>
<tr><th>消費税</th><td class="num">${input.tax.toLocaleString("ja-JP")}</td></tr>
<tr class="grand"><th>税込合計</th><td class="num">¥${input.total.toLocaleString("ja-JP")}</td></tr>
</table>`;
}

function renderTaxBreakdown(subtotal: number, tax: number): string {
  return `<table class="toms-v2-tax-table">
<tr><th>税率内訳</th><th>税別金額</th><th>消費税額</th></tr>
<tr><td>10%対象</td><td class="num">¥${subtotal.toLocaleString("ja-JP")}</td><td class="num">¥${tax.toLocaleString("ja-JP")}</td></tr>
</table>`;
}

function renderNotesBlock(notes: string): string {
  const body = notes?.trim()
    ? `<div class="toms-v2-notes-body">${escapeHtmlMultiline(notes.trim())}</div>`
    : `<div class="toms-v2-notes-body toms-v2-notes-empty">&nbsp;</div>`;
  return `<div class="toms-v2-notes"><div class="toms-v2-notes-label">＜備考＞</div>${body}</div>`;
}

function renderPageFooter(pageNum: number, totalPages: number): string {
  return renderPdfPageNumberFooter(pageNum, totalPages);
}

function renderLastPageFooter(
  ctx: TomsV2PageContext,
  linePages: TomsV2LineItem[][],
  pageIndex: number,
  totalPages: number
): string {
  const lastChunk = linePages[linePages.length - 1] ?? [];
  const fillerCount = Math.max(0, TOMS_V2_FIRST_PAGE_ROWS - lastChunk.length);
  void fillerCount;
  const showTax = ctx.kind === "invoice";
  return `<div class="toms-v2-bottom">
  <div class="toms-v2-bottom-left">${showTax ? renderTaxBreakdown(ctx.totals.subtotal, ctx.totals.tax) : ""}${ctx.footerExtras ?? ""}</div>
  <div class="toms-v2-bottom-right">${renderTotalsGrid(ctx.totals)}</div>
</div>
${renderNotesBlock(ctx.notes)}
${renderPageFooter(pageIndex + 1, totalPages)}`;
}

function renderSinglePage(ctx: TomsV2PageContext): string {
  const linePages = chunkLines(ctx.lines, TOMS_V2_FIRST_PAGE_ROWS, TOMS_V2_CONTINUATION_PAGE_ROWS);
  const totalPages = linePages.length;
  const firstChunk = linePages[0] ?? [];
  const fillerFirst = Math.max(0, TOMS_V2_FIRST_PAGE_ROWS - firstChunk.length);
  const isSingle = totalPages === 1;

  let body = `<div class="toms-v2-page">
<div class="toms-v2-frame">
<div class="toms-v2-header">${renderHeaderLeft(ctx)}${renderHeaderRight(ctx)}</div>
${renderAmountRow(ctx.total)}
${renderLineItemsTable(firstChunk, isSingle ? fillerFirst : 0)}`;

  if (isSingle) {
    body += renderLastPageFooter(ctx, linePages, 0, 1);
  }

  body += `</div>`;
  if (!isSingle) {
    body += renderPageFooter(1, totalPages);
  }
  body += `</div>`;

  if (!isSingle) {
    for (let p = 1; p < totalPages; p++) {
      const chunk = linePages[p] ?? [];
      const isLast = p === totalPages - 1;
      const filler = isLast ? Math.max(0, TOMS_V2_FIRST_PAGE_ROWS - chunk.length) : 0;
      body += `<div class="toms-v2-page">
<div class="toms-v2-frame toms-v2-frame-continuation">
${renderLineItemsTable(chunk, filler)}`;
      if (isLast) {
        body += renderLastPageFooter(ctx, linePages, p, totalPages);
      }
      body += `</div>`;
      if (!isLast) {
        body += renderPageFooter(p + 1, totalPages);
      }
      body += `</div>`;
    }
  }

  return body;
}

export function renderTomsV2DocumentBody(ctx: TomsV2PageContext): string {
  return renderSinglePage(ctx);
}

export const TOMS_V2_STYLES = `
@page { size: A4 portrait; margin: ${TOMS_V2_PAGE_MARGIN_MM}mm; }
* { box-sizing: border-box; }
body {
  font-family: "Noto Sans JP", "Hiragino Sans", "Yu Gothic", "Meiryo", system-ui, sans-serif;
  margin: 0;
  padding: 0;
  color: #111;
  background: #fff;
  font-size: 9pt;
  line-height: 1.3;
  word-break: keep-all;
  overflow-wrap: break-word;
  -webkit-text-size-adjust: 100%;
}
.num { text-align: right; font-variant-numeric: tabular-nums; }
.toms-v2-page {
  width: ${TOMS_V2_FRAME_WIDTH_MM}mm;
  min-height: ${TOMS_V2_FRAME_HEIGHT_MM}mm;
  margin: 0 auto;
  page-break-after: always;
  position: relative;
  padding-bottom: 5mm;
}
.toms-v2-page:last-child { page-break-after: auto; }
.toms-v2-frame {
  border: 2px solid #000;
  min-height: ${TOMS_V2_FRAME_HEIGHT_MM - 6}mm;
  display: flex;
  flex-direction: column;
  padding: 2.5mm 3mm 2mm;
}
.toms-v2-frame-continuation { padding-top: 3mm; }
.toms-v2-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 3mm;
  margin-bottom: 1.5mm;
}
.toms-v2-header-left { flex: 1 1 58%; min-width: 0; }
.toms-v2-header-right { flex: 0 0 40%; min-width: 0; text-align: right; position: relative; }
.toms-v2-title-band {
  display: inline-block;
  background: ${TOMS_V2_GRAY};
  border: 1px solid #000;
  padding: 1.2mm 5mm;
  margin-bottom: 2mm;
  min-width: 28mm;
  text-align: center;
  font-size: 13pt;
  font-weight: 700;
  letter-spacing: 0.12em;
}
.toms-v2-addressee-row {
  display: flex;
  align-items: baseline;
  justify-content: flex-start;
  gap: 2mm;
  margin: 1mm 0 2mm;
  padding-bottom: 1px;
  border-bottom: 1px solid #000;
  width: 100%;
  max-width: 72mm;
}
.toms-v2-addressee-name {
  font-size: 14pt;
  font-weight: 700;
  white-space: nowrap;
}
.toms-v2-addressee-honorific {
  font-size: 12pt;
  font-weight: 700;
  white-space: nowrap;
  margin-left: auto;
}
.toms-v2-subject-row {
  display: flex;
  align-items: baseline;
  gap: 1mm;
  font-size: 9.5pt;
  margin-top: 0.5mm;
}
.toms-v2-subject-label { font-weight: 700; white-space: nowrap; }
.toms-v2-subject-value { font-weight: 700; flex: 1; min-width: 0; }
.toms-v2-subject-underline { border-bottom: 1px solid #000; margin: 0.5mm 0 1mm; }
.toms-v2-intro { margin: 1mm 0 0; font-size: 8pt; }
.toms-v2-meta {
  border-collapse: collapse;
  margin: 0 0 1mm auto;
  font-size: 7.5pt;
}
.toms-v2-meta th, .toms-v2-meta td { padding: 0.2mm 0 0.8mm 1.5mm; text-align: left; vertical-align: top; }
.toms-v2-meta th { font-weight: 700; white-space: nowrap; }
.toms-v2-meta-label, .toms-v2-meta-value { display: block; min-height: 3mm; }
.toms-v2-meta-underline { display: block; border-bottom: 1px solid #000; margin-top: 0.3mm; min-width: 16mm; min-height: 2.5mm; }
.toms-v2-meta td .toms-v2-meta-underline { min-width: 22mm; }
.toms-v2-company-wrap { position: relative; text-align: left; display: inline-block; max-width: 100%; }
.toms-v2-company-band {
  background: ${TOMS_V2_GRAY};
  border: 1px solid #000;
  padding: 0.6mm 2mm;
  font-weight: 700;
  font-size: 8.5pt;
  margin-bottom: 0.5mm;
}
.toms-v2-company-body { font-size: 7.5pt; line-height: 1.35; padding-right: 14mm; }
.toms-v2-bank { margin-top: 0.8mm; white-space: pre-line; }
.toms-v2-seal {
  position: absolute;
  right: -2mm;
  top: 0;
  width: 14mm;
  height: 14mm;
  object-fit: contain;
  opacity: 0.92;
  mix-blend-mode: multiply;
}
.toms-v2-amount-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 2px solid #000;
  padding: 1.8mm 2.5mm;
  margin: 0.8mm 0 1.2mm;
  gap: 2mm;
  background: #fff;
}
.toms-v2-amount-label { font-size: 10pt; font-weight: 700; flex: 0 0 auto; }
.toms-v2-amount-value { font-size: 18pt; font-weight: 800; flex: 1 1 auto; text-align: center; font-variant-numeric: tabular-nums; }
.toms-v2-amount-tax { font-size: 9pt; font-weight: 600; flex: 0 0 auto; }
.toms-v2-items-area {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 132mm;
  margin-bottom: 1mm;
}
.toms-v2-items {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #000;
  table-layout: fixed;
  flex: 1 1 auto;
  height: 100%;
}
.toms-v2-items th, .toms-v2-items td {
  border: 1px solid #000;
  padding: 0.8mm 1mm;
  font-size: 8pt;
  vertical-align: middle;
  line-height: 1.25;
}
.toms-v2-items thead th {
  background: #b4c7e7;
  font-weight: 700;
  text-align: center;
}
.toms-v2-items tbody tr { background: ${TOMS_V2_ROW_BLUE}; }
.toms-v2-items tbody tr td {
  height: ${TOMS_V2_LINE_ROW_HEIGHT_MM}mm;
  max-height: ${TOMS_V2_LINE_ROW_HEIGHT_MM}mm;
  overflow: hidden;
  box-sizing: border-box;
}
.toms-v2-items .col-no { width: 6%; text-align: center; }
.toms-v2-items .col-desc { width: 52%; text-align: center; white-space: pre-line; word-break: keep-all; }
.toms-v2-items .col-qty { width: 10%; }
.toms-v2-items .col-price { width: 16%; }
.toms-v2-items .col-amount { width: 16%; }
.toms-v2-bottom {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 2mm;
  margin-top: 0.5mm;
}
.toms-v2-bottom-left { flex: 1 1 55%; min-width: 0; }
.toms-v2-bottom-right { flex: 0 0 38%; min-width: 0; }
.toms-v2-tax-table {
  border-collapse: collapse;
  font-size: 7.5pt;
  width: 100%;
  max-width: 72mm;
  border: 1px solid #000;
}
.toms-v2-tax-table th, .toms-v2-tax-table td {
  border: 1px solid #000;
  padding: 0.6mm 1mm;
  text-align: center;
}
.toms-v2-tax-table th { background: ${TOMS_V2_GRAY}; font-weight: 700; }
.toms-v2-totals {
  border-collapse: collapse;
  width: 100%;
  font-size: 8pt;
  margin-left: auto;
}
.toms-v2-totals th, .toms-v2-totals td {
  border: 1px solid #000;
  padding: 0.7mm 1.5mm;
}
.toms-v2-totals th {
  background: ${TOMS_V2_GRAY};
  font-weight: 700;
  text-align: center;
  width: 42%;
}
.toms-v2-totals tr.grand th, .toms-v2-totals tr.grand td { font-weight: 800; }
.toms-v2-notes {
  border-top: 1px solid #000;
  margin-top: auto;
  padding-top: 1.2mm;
  flex: 0 0 auto;
  min-height: 24mm;
  display: flex;
  flex-direction: column;
}
.toms-v2-notes-label { font-size: 8pt; font-weight: 700; margin-bottom: 1mm; }
.toms-v2-notes-body { font-size: 8pt; line-height: 1.4; white-space: pre-wrap; flex: 1; min-height: 18mm; }
.toms-v2-notes-empty { min-height: 18mm; }
.toms-v2-page-num {
  text-align: center;
  font-size: 7.5pt;
  color: #333;
  margin-top: 2mm;
  font-weight: 600;
}
.toms-v2-cover-header .toms-v2-header { margin-bottom: 0.5mm; }
.toms-v2-cover-header .toms-v2-amount-row { margin-bottom: 0; }
.toms-v2-footer-extras { font-size: 7.5pt; margin-top: 1mm; line-height: 1.35; }
@media print {
  body { padding: 0; }
  .toms-v2-page { width: ${TOMS_V2_FRAME_WIDTH_MM}mm; }
  .toms-v2-items thead { display: table-header-group; }
  .toms-v2-items tbody tr { page-break-inside: avoid; }
}
`;

export function wrapTomsV2Html(title: string, body: string, extraStyles = ""): string {
  return wrapPdfHtmlDocument(title, `${TOMS_V2_STYLES}${extraStyles}`, body);
}
