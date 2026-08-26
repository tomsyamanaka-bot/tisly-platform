/**
 * TOMS Excel-style document layout v2 — 見積書・請求書共通
 * 添付マスタ画像（Excel帳票風）に合わせた HTML/CSS
 */
import {
  PDF_TOMS_V2_CONTINUATION_PAGE_ROWS,
  PDF_TOMS_V2_FIRST_PAGE_ROWS,
  PDF_TOMS_V2_FRAME_HEIGHT_MM,
  PDF_TOMS_V2_FRAME_WIDTH_MM,
  PDF_TOMS_V2_GRAY,
  PDF_TOMS_V2_LINE_ROW_HEIGHT_MM,
  PDF_TOMS_V2_PAGE_MARGIN_MM,
  PDF_TOMS_V2_ROW_BLUE,
} from "./pdf-constants.js";
import {
  escapeHtml,
  escapeHtmlMultiline,
  formatPdfYenAmountV1,
  renderPdfCompanyDetailBlock,
  renderPdfPageNumberFooter,
  renderPdfSealImg,
  renderPdfV2MetaTableRows,
  splitPdfAddressee,
  wrapPdfHtmlDocument,
} from "./pdf-base-template.js";

export const TOMS_V2_PAGE_MARGIN_MM = PDF_TOMS_V2_PAGE_MARGIN_MM;
export const TOMS_V2_FRAME_WIDTH_MM = PDF_TOMS_V2_FRAME_WIDTH_MM;
export const TOMS_V2_FRAME_HEIGHT_MM = PDF_TOMS_V2_FRAME_HEIGHT_MM;
export const TOMS_V2_FIRST_PAGE_ROWS = PDF_TOMS_V2_FIRST_PAGE_ROWS;
export const TOMS_V2_CONTINUATION_PAGE_ROWS = PDF_TOMS_V2_CONTINUATION_PAGE_ROWS;
export const TOMS_V2_GRAY = PDF_TOMS_V2_GRAY;
export const TOMS_V2_ROW_BLUE = PDF_TOMS_V2_ROW_BLUE;
export const TOMS_V2_LINE_ROW_HEIGHT_MM = PDF_TOMS_V2_LINE_ROW_HEIGHT_MM;

/** estimate / invoice に加え領収書モードを追記 */
export type TomsV2DocKind = "estimate" | "invoice" | "receipt";

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
  /** 領収書の但し書き（例: 但 …として） */
  provisoText?: string;
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

/** 宛名を名前部分と敬称に分割 — pdf-base-template へ委譲 */
export { splitPdfAddressee as splitTomsV2Addressee } from "./pdf-base-template.js";

function renderMetaRows(ctx: TomsV2PageContext): string {
  return renderPdfV2MetaTableRows({
    issueDateLabel: ctx.issueDateLabel,
    issueDate: ctx.issueDate,
    docNoLabel: ctx.docNoLabel,
    docNo: ctx.docNo,
    projectNo: ctx.projectNo,
    includeRegistrationNo: ctx.includeRegistrationNo,
    staffName: ctx.staffName,
    extraRows: ctx.extraMetaRows,
  });
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

/** 社印は請求書・領収書（見積書では DOM を出さない） */
function renderSeal(kind: TomsV2DocKind): string {
  if (kind !== "invoice" && kind !== "receipt") return "";
  return renderPdfSealImg();
}

function renderHeaderLeft(ctx: TomsV2PageContext): string {
  const { name, honorific } = splitPdfAddressee(ctx.addressee);
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
    ${renderSeal(ctx.kind)}
  </div>
</div>`;
}

function renderAmountRow(total: number, provisoText?: string): string {
  const proviso = provisoText?.trim()
    ? `<div class="toms-v2-proviso">${escapeHtml(provisoText.trim())}</div>`
    : "";
  return `<div class="toms-v2-amount-wrap">
  <div class="toms-v2-amount-row">
  <span class="toms-v2-amount-label">金額</span>
  <span class="toms-v2-amount-value">${formatPdfYenAmountV1(total)}</span>
  <span class="toms-v2-amount-tax">（税込）</span>
  </div>
</div>
${proviso}`;
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
  const trimmed = notes?.trim() ?? "";
  const body = trimmed
    ? `<div class="toms-v2-notes-body">${escapeHtmlMultiline(trimmed)}</div>`
    : `<div class="toms-v2-notes-body toms-v2-notes-empty"></div>`;
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
  // 請求書・領収書は税率内訳を左下に表示
  const showTax = ctx.kind === "invoice" || ctx.kind === "receipt";
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
${renderAmountRow(ctx.total, ctx.provisoText)}
${renderLineItemsTable(firstChunk, isSingle ? fillerFirst : 0)}`;

  if (isSingle) {
    body += renderLastPageFooter(ctx, linePages, 0, 1);
  } else {
    // ページ番号は枠内に置き、max-height で切れないようにする
    body += renderPageFooter(1, totalPages);
  }

  body += `</div></div>`;

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
      } else {
        body += renderPageFooter(p + 1, totalPages);
      }
      body += `</div></div>`;
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
html, body { height: auto; }
body {
  font-family: "Noto Sans JP", "Hiragino Sans", "Yu Gothic", "Meiryo", system-ui, sans-serif;
  margin: 0;
  padding: 0;
  color: #111;
  background: #fff;
  font-size: 8.5pt;
  line-height: 1.25;
  word-break: keep-all;
  overflow-wrap: break-word;
  -webkit-text-size-adjust: 100%;
}
.num { text-align: right; font-variant-numeric: tabular-nums; }
.toms-v2-page {
  width: ${TOMS_V2_FRAME_WIDTH_MM}mm;
  min-height: ${TOMS_V2_FRAME_HEIGHT_MM}mm;
  max-height: ${TOMS_V2_FRAME_HEIGHT_MM}mm;
  margin: 0 auto;
  page-break-after: always;
  page-break-inside: avoid;
  break-inside: avoid;
  position: relative;
  padding-bottom: 0;
  overflow: hidden;
}
.toms-v2-page:last-child { page-break-after: auto; }
.toms-v2-frame {
  border: 2px solid #000;
  height: ${TOMS_V2_FRAME_HEIGHT_MM - 2}mm;
  max-height: ${TOMS_V2_FRAME_HEIGHT_MM - 2}mm;
  display: flex;
  flex-direction: column;
  padding: 1.8mm 2.5mm 1.2mm;
  overflow: hidden;
  page-break-inside: avoid;
  break-inside: avoid;
}
.toms-v2-frame-continuation { padding-top: 2mm; }
.toms-v2-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 2.5mm;
  margin-bottom: 1mm;
  flex: 0 0 auto;
}
.toms-v2-header-left { flex: 1 1 58%; min-width: 0; }
.toms-v2-header-right { flex: 0 0 40%; min-width: 0; text-align: right; position: relative; }
.toms-v2-title-band {
  display: inline-block;
  background: ${TOMS_V2_GRAY};
  border: 1px solid #000;
  padding: 0.8mm 4mm;
  margin-bottom: 1.2mm;
  min-width: 26mm;
  text-align: center;
  font-size: 12pt;
  font-weight: 700;
  letter-spacing: 0.12em;
}
.toms-v2-addressee-row {
  display: flex;
  align-items: baseline;
  justify-content: flex-start;
  gap: 2mm;
  margin: 0.6mm 0 1.2mm;
  padding-bottom: 1px;
  border-bottom: 1px solid #000;
  width: 100%;
  max-width: 72mm;
}
.toms-v2-addressee-name {
  font-size: 13pt;
  font-weight: 700;
  white-space: nowrap;
}
.toms-v2-addressee-honorific {
  font-size: 11pt;
  font-weight: 700;
  white-space: nowrap;
  margin-left: auto;
}
.toms-v2-subject-row {
  display: flex;
  align-items: baseline;
  gap: 1mm;
  font-size: 9pt;
  margin-top: 0.3mm;
}
.toms-v2-subject-label { font-weight: 700; white-space: nowrap; }
.toms-v2-subject-value { font-weight: 700; flex: 1; min-width: 0; }
.toms-v2-subject-underline { border-bottom: 1px solid #000; margin: 0.3mm 0 0.6mm; }
.toms-v2-intro { margin: 0.6mm 0 0; font-size: 7.5pt; }
.toms-v2-meta {
  border-collapse: collapse;
  margin: 0 0 0.6mm auto;
  font-size: 7pt;
}
.toms-v2-meta th, .toms-v2-meta td { padding: 0.1mm 0 0.5mm 1.2mm; text-align: left; vertical-align: top; }
.toms-v2-meta th { font-weight: 700; white-space: nowrap; }
.toms-v2-meta-label, .toms-v2-meta-value { display: block; min-height: 2.5mm; }
.toms-v2-meta-underline { display: block; border-bottom: 1px solid #000; margin-top: 0.2mm; min-width: 16mm; min-height: 2.2mm; }
.toms-v2-meta td .toms-v2-meta-underline { min-width: 22mm; }
.toms-v2-company-wrap { position: relative; text-align: left; display: inline-block; max-width: 100%; z-index: 1; }
.toms-v2-company-band {
  background: ${TOMS_V2_GRAY};
  border: 1px solid #000;
  padding: 0.4mm 1.8mm;
  font-weight: 700;
  font-size: 8pt;
  margin-bottom: 0.4mm;
}
.toms-v2-company-body { font-size: 7pt; line-height: 1.3; padding-right: 16mm; }
.toms-v2-bank { margin-top: 0.5mm; white-space: pre-line; }
/* 会社情報帯の下〜住所行に重ねる社判スロット（レイアウト高さは増やさない） */
.toms-v2-seal-slot {
  position: absolute;
  right: -1.5mm;
  top: 4.5mm;
  width: 15mm;
  height: 15mm;
  z-index: 30;
  pointer-events: none;
  overflow: visible;
}
.toms-v2-seal {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: 0.95;
  mix-blend-mode: multiply;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.toms-v2-amount-wrap {
  display: flex;
  justify-content: center;
  width: 100%;
  margin: 0.5mm 0 0.8mm;
  flex: 0 0 auto;
}
.toms-v2-amount-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 2px solid #000;
  padding: 1.2mm 2mm;
  margin: 0;
  width: 50%;
  max-width: 50%;
  gap: 2mm;
  background: #fff;
}
.toms-v2-amount-label { font-size: 9.5pt; font-weight: 700; flex: 0 0 auto; }
.toms-v2-amount-value { font-size: 16pt; font-weight: 800; flex: 1 1 auto; text-align: center; font-variant-numeric: tabular-nums; }
.toms-v2-amount-tax { font-size: 8.5pt; font-weight: 600; flex: 0 0 auto; }
.toms-v2-items-area {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  margin-bottom: 0.6mm;
  overflow: hidden;
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
  padding: 0.3mm 0.8mm;
  font-size: 7.5pt;
  vertical-align: middle;
  line-height: 1.1;
}
.toms-v2-items thead th {
  background: #b4c7e7;
  font-weight: 700;
  text-align: center;
  height: 5mm;
  padding: 0.4mm 0.8mm;
}
.toms-v2-items tbody tr {
  background: ${TOMS_V2_ROW_BLUE};
  height: ${TOMS_V2_LINE_ROW_HEIGHT_MM}mm;
  max-height: ${TOMS_V2_LINE_ROW_HEIGHT_MM}mm;
  page-break-inside: avoid;
  break-inside: avoid;
}
.toms-v2-items tbody tr td {
  height: ${TOMS_V2_LINE_ROW_HEIGHT_MM}mm;
  max-height: ${TOMS_V2_LINE_ROW_HEIGHT_MM}mm;
  overflow: hidden;
  box-sizing: border-box;
}
.toms-v2-items .col-no { width: 6%; text-align: center; }
.toms-v2-items .col-desc {
  width: 52%;
  text-align: center;
  white-space: pre-line;
  word-break: keep-all;
  overflow: hidden;
  line-height: 1.1;
  max-height: ${TOMS_V2_LINE_ROW_HEIGHT_MM}mm;
}
.toms-v2-items .col-qty { width: 10%; }
.toms-v2-items .col-price { width: 16%; }
.toms-v2-items .col-amount { width: 16%; }
.toms-v2-bottom {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 2mm;
  margin-top: 0.3mm;
  flex: 0 0 auto;
  page-break-inside: avoid;
  break-inside: avoid;
}
.toms-v2-bottom-left { flex: 1 1 55%; min-width: 0; }
.toms-v2-bottom-right { flex: 0 0 38%; min-width: 0; }
.toms-v2-tax-table {
  border-collapse: collapse;
  font-size: 7pt;
  width: 100%;
  max-width: 72mm;
  border: 1px solid #000;
}
.toms-v2-tax-table th, .toms-v2-tax-table td {
  border: 1px solid #000;
  padding: 0.4mm 0.8mm;
  text-align: center;
}
.toms-v2-tax-table th { background: ${TOMS_V2_GRAY}; font-weight: 700; }
.toms-v2-totals {
  border-collapse: collapse;
  width: 100%;
  font-size: 7.5pt;
  margin-left: auto;
}
.toms-v2-totals th, .toms-v2-totals td {
  border: 1px solid #000;
  padding: 0.5mm 1.2mm;
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
  padding-top: 0.8mm;
  flex: 0 0 auto;
  min-height: 12mm;
  max-height: 18mm;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  page-break-inside: avoid;
  break-inside: avoid;
}
.toms-v2-notes-label { font-size: 7.5pt; font-weight: 700; margin-bottom: 0.4mm; }
.toms-v2-notes-body { font-size: 7.5pt; line-height: 1.25; white-space: pre-wrap; flex: 1; min-height: 8mm; overflow: hidden; }
.toms-v2-notes-empty { min-height: 8mm; }
.toms-v2-page-num {
  text-align: center;
  font-size: 7pt;
  color: #333;
  margin-top: 1mm;
  font-weight: 600;
  flex: 0 0 auto;
  page-break-inside: avoid;
  break-inside: avoid;
}
.toms-v2-cover-header .toms-v2-header { margin-bottom: 0.4mm; }
.toms-v2-cover-header .toms-v2-amount-wrap { margin-bottom: 0; }
.toms-v2-cover-header .toms-v2-amount-row { margin-bottom: 0; }
.toms-v2-footer-extras { font-size: 7pt; margin-top: 0.5mm; line-height: 1.25; }
.toms-v2-proviso {
  text-align: center;
  font-size: 8pt;
  font-weight: 700;
  margin: 0.4mm 0 0.8mm;
  letter-spacing: 0.02em;
}
.toms-v2-stamp-note {
  display: inline-block;
  border: 1px solid #000;
  padding: 1mm 1.6mm;
  font-size: 7pt;
  font-weight: 700;
  line-height: 1.3;
  margin-top: 0.8mm;
  background: #fff;
}
@media print {
  body { padding: 0; margin: 0; }
  .toms-v2-page {
    width: ${TOMS_V2_FRAME_WIDTH_MM}mm;
    max-height: ${TOMS_V2_FRAME_HEIGHT_MM}mm;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .toms-v2-frame { page-break-inside: avoid; break-inside: avoid; }
  .toms-v2-items thead { display: table-header-group; }
  .toms-v2-items tbody tr { page-break-inside: avoid; break-inside: avoid; }
  .toms-v2-bottom, .toms-v2-notes, .toms-v2-page-num {
    page-break-inside: avoid;
    break-inside: avoid;
    page-break-before: avoid;
  }
}
`;

export function wrapTomsV2Html(title: string, body: string, extraStyles = ""): string {
  return wrapPdfHtmlDocument(title, `${TOMS_V2_STYLES}${extraStyles}`, body);
}
