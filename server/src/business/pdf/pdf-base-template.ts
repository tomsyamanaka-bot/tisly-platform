/**
 * PDF Base Template — 全帳票共通のレイアウト部品・ユーティリティ
 * 見積・請求・仕様書・完了報告書で同一のデザイン思想（TOMS 表記・フッター・印鑑・ページ番号）を適用
 */
import { getTomsCompanyInfo } from "./company.js";
import {
  PDF_A4_HEIGHT_MM,
  PDF_A4_WIDTH_MM,
  PDF_PHOTO_COLS,
  PDF_PHOTO_ROWS,
  PDF_PHOTOS_PER_PAGE,
  PDF_PRACTICAL_PAGE_MARGIN_MM,
} from "./pdf-constants.js";
import {
  TOMS_PDF_FONT_LINKS,
  TOMS_PDF_CHARSET_META,
  TOMS_PDF_VIEWPORT_META,
} from "./styles.js";

export {
  PDF_A4_WIDTH_MM,
  PDF_A4_HEIGHT_MM,
  PDF_PHOTO_COLS,
  PDF_PHOTO_ROWS,
  PDF_PHOTOS_PER_PAGE,
  PDF_PRACTICAL_PAGE_MARGIN_MM,
  PDF_TOMS_V2_PAGE_MARGIN_MM,
} from "./pdf-constants.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtmlMultiline(s: string): string {
  return escapeHtml(s).replace(/\n/g, "<br/>");
}

export function chunkPdfArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export function slicePdfPhotosForPages<T>(
  photos: T[],
  firstPageMax: number = PDF_PHOTOS_PER_PAGE,
  perPage: number = PDF_PHOTOS_PER_PAGE
): { coverPhotos: T[]; continuationPages: T[][] } {
  const safeFirst = Math.max(0, firstPageMax);
  const coverPhotos = photos.slice(0, safeFirst);
  const remaining = photos.slice(safeFirst);
  return {
    coverPhotos,
    continuationPages: remaining.length ? chunkPdfArray(remaining, perPage) : [],
  };
}

export function countPdfPhotoLayoutPages(
  photoCount: number,
  firstPageMax: number = PDF_PHOTOS_PER_PAGE
): number {
  if (photoCount <= 0) return 0;
  const { continuationPages } = slicePdfPhotosForPages(
    Array.from({ length: photoCount }, () => null),
    firstPageMax
  );
  const coverSlots = Math.min(photoCount, firstPageMax);
  return (coverSlots > 0 || photoCount === 0 ? 1 : 0) + continuationPages.length;
}

/** 表紙のテキスト量・図面有無から表紙に載せる写真上限を決定（型崩れ・白紙ページ防止） */
export function resolveCoverPhotoCapacity(input: {
  sectionCount?: number;
  hasDrawings?: boolean;
  defaultMax?: number;
}): number {
  const max = input.defaultMax ?? PDF_PHOTOS_PER_PAGE;
  const sections = input.sectionCount ?? 0;
  const hasDrawings = input.hasDrawings ?? false;
  if (hasDrawings && sections >= 2) return 0;
  if (hasDrawings) return 3;
  if (sections >= 3) return 3;
  return max;
}

export function formatPdfFooterDateTime(isoOrDate: string): string {
  const trimmed = (isoOrDate ?? "").trim();
  if (!trimmed) return "—";
  const d = new Date(trimmed);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${y}/${m}/${day} ${h}:${min}`;
  }
  return trimmed.replace(/^(\d{4})-(\d{2})-(\d{2})/, "$1/$2/$3");
}

export interface PdfStandardFooterInput {
  prefix: string;
  projectNo: string;
  generatedAt: string;
  pageNum: number;
  totalPages: number;
}

/** 仕様書・完了報告書 — 案件番号 / 生成日時 / ページ番号 */
export function renderPdfStandardPageFooter(input: PdfStandardFooterInput): string {
  const { prefix, projectNo, generatedAt, pageNum, totalPages } = input;
  const dt = formatPdfFooterDateTime(generatedAt);
  return `<div class="${prefix}-page-footer">
    <span class="${prefix}-footer-project">${escapeHtml(projectNo || "—")}</span>
    <span class="${prefix}-footer-datetime">${escapeHtml(dt)}</span>
    <span class="${prefix}-footer-pagenum">Page ${pageNum} / ${totalPages}</span>
  </div>`;
}

/** 見積・請求 v2 — ページ番号のみ */
export function renderPdfPageNumberFooter(
  pageNum: number,
  totalPages: number,
  cssClass = "toms-v2-page-num"
): string {
  return `<div class="${cssClass}">Page ${pageNum} / ${totalPages}</div>`;
}

/** 仕様書・完了報告書 — 表紙ヘッダー（会社名・帳票タイトル・区切り線） */
export function renderPdfCoverHeader(prefix: string, documentTitle: string): string {
  const co = getTomsCompanyInfo();
  return `<div class="${prefix}-cover-header">
  <div class="${prefix}-cover-rule"></div>
  <div class="${prefix}-cover-company">${escapeHtml(co.name)}</div>
  <h1 class="${prefix}-cover-title">${escapeHtml(documentTitle)}</h1>
  <div class="${prefix}-cover-rule"></div>
</div>`;
}

export function resolvePdfSealUrl(): string {
  return process.env.TOMS_SEAL_URL ?? "/assets/toms-seal.svg";
}

/** 印鑑スペース（見積・請求 v2） */
export function renderPdfSealImg(cssClass = "toms-v2-seal"): string {
  return `<img class="${cssClass}" src="${escapeHtml(resolvePdfSealUrl())}" alt="印"/>`;
}

export interface PdfCompanyDetailInput {
  staffName?: string;
  bankInfo?: string;
  bandCssClass?: string;
  bodyCssClass?: string;
}

/** 会社情報ブロック（株式会社TOMS 帯 + 住所・TEL・担当） */
export function renderPdfCompanyDetailBlock(input: PdfCompanyDetailInput = {}): string {
  const co = getTomsCompanyInfo();
  const staff = input.staffName?.trim() || co.representativeName;
  const bandClass = input.bandCssClass ?? "pdf-company-band";
  const bodyClass = input.bodyCssClass ?? "pdf-company-body";
  const bankText = formatPdfBankBlock(input.bankInfo);
  const bank = bankText
    ? `<div class="pdf-company-bank">${escapeHtmlMultiline(bankText)}</div>`
    : "";
  return `<div class="${bandClass}">${escapeHtml(co.name)}</div>
<div class="${bodyClass}">
  <div>〒${escapeHtml(co.postalCode)}</div>
  <div>${escapeHtml(co.address)}</div>
  <div>TEL: ${escapeHtml(co.phone)}</div>
  <div>担当: ${escapeHtml(staff)}</div>
  ${bank}
</div>`;
}

function formatPdfBankBlock(bankInfo?: string): string | undefined {
  if (!bankInfo?.trim()) return undefined;
  const lines = bankInfo.trim().split(/\n/).filter(Boolean);
  if (!lines.length) return undefined;
  return `振込口座\n${lines.join("\n")}`;
}

/** 全帳票共通 HTML ラッパー */
export function wrapPdfHtmlDocument(title: string, styles: string, body: string): string {
  const safeTitle = escapeHtml(title);
  return `<!DOCTYPE html><html lang="ja"><head>
${TOMS_PDF_CHARSET_META}
${TOMS_PDF_FONT_LINKS}
${TOMS_PDF_VIEWPORT_META}
<title>${safeTitle}</title>
<style>${styles}</style>
</head><body>
${body}
</body></html>`;
}

/** 写真台帳 — 2列×3段グリッド用 CSS（prefix: sp / cr / est / inv） */
export function buildPdfPhotoGridStyles(
  prefix: string,
  pageMarginMm: number = PDF_PRACTICAL_PAGE_MARGIN_MM
): string {
  const m = pageMarginMm;
  const contentH = PDF_A4_HEIGHT_MM - m * 2;
  const contentW = PDF_A4_WIDTH_MM - m * 2;
  return `
  @page { size: A4 portrait; margin: ${m}mm; }
  * { box-sizing: border-box; }
  body { font-family: "Noto Sans JP", "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif; color: #1a1a1a; margin: 0; padding: 0; font-size: 9pt; word-break: keep-all; }
  .${prefix}-page {
    width: ${contentW}mm;
    height: ${contentH}mm;
    page-break-after: always;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .${prefix}-page:last-child { page-break-after: auto; }
  .${prefix}-cover-page { padding: 0.3mm 0 0; }
  .${prefix}-cover-header { text-align: center; margin-bottom: 0.6mm; flex: 0 0 auto; }
  .${prefix}-cover-rule { height: 0; border-top: 1px solid #94a3b8; margin: 0.5mm 0; }
  .${prefix}-cover-company { font-size: 9pt; font-weight: 700; letter-spacing: 0.08em; margin: 0.3mm 0; line-height: 1.15; }
  .${prefix}-cover-title { font-size: 12.5pt; font-weight: 700; margin: 0.5mm 0; letter-spacing: 0.12em; line-height: 1.15; }
  .${prefix}-cover-fields { width: 100%; border-collapse: collapse; margin: 0.3mm 0 0.6mm; font-size: 7.5pt; flex: 0 0 auto; }
  .${prefix}-cover-fields th { text-align: left; width: 20%; padding: 0.25mm 0.8mm; color: #475569; font-weight: 600; vertical-align: top; border-bottom: 1px solid #e2e8f0; line-height: 1.15; }
  .${prefix}-cover-fields td { padding: 0.25mm 0.8mm; color: #0f172a; vertical-align: top; border-bottom: 1px solid #f1f5f9; line-height: 1.15; }
  .${prefix}-cover-section { margin: 0.4mm 0; flex: 0 0 auto; }
  .${prefix}-cover-section h3 { margin: 0 0 0.25mm; font-size: 7.5pt; font-weight: 700; color: #334155; line-height: 1.15; }
  .${prefix}-cover-section-body { font-size: 7pt; line-height: 1.25; color: #0f172a; white-space: pre-wrap; max-height: 14mm; overflow: hidden; }
  .${prefix}-drawing-block { margin: 0.5mm 0; flex: 0 0 auto; page-break-inside: avoid; }
  .${prefix}-drawing-title { margin: 0 0 0.3mm; font-size: 7.5pt; font-weight: 700; color: #334155; }
  .${prefix}-drawing-img-wrap { width: 100%; max-height: 42mm; overflow: hidden; border: 1px solid #e2e8f0; border-radius: 1mm; }
  .${prefix}-drawing-img-wrap img { width: 100%; height: auto; max-height: 42mm; object-fit: contain; display: block; }
  .${prefix}-no-photos-cover { margin-top: 1.5mm; text-align: center; font-size: 8.5pt; color: #64748b; flex: 0 0 auto; }
  .${prefix}-photo-page { padding: 0; }
  .${prefix}-photo-grid {
    display: grid;
    grid-template-columns: repeat(${PDF_PHOTO_COLS}, 1fr);
    grid-auto-flow: row;
    gap: 1.5mm;
    align-content: start;
  }
  .${prefix}-cover-photo-grid {
    flex: 1 1 0;
    min-height: 0;
    margin: 0.4mm 0 0;
    grid-template-rows: repeat(${PDF_PHOTO_ROWS}, 1fr);
    align-content: start;
  }
  .${prefix}-cover-photo-grid .${prefix}-photo-cell {
    min-height: 0;
    overflow: hidden;
  }
  .${prefix}-cover-photo-grid .${prefix}-photo-img-wrap {
    flex: 1 1 0;
    min-height: 0;
    aspect-ratio: unset;
  }
  .${prefix}-photo-page .${prefix}-photo-grid {
    flex: 1;
    min-height: 0;
    grid-template-rows: repeat(${PDF_PHOTO_ROWS}, 1fr);
    margin-bottom: 1mm;
  }
  .${prefix}-photo-page .${prefix}-photo-img-wrap { aspect-ratio: unset; flex: 1; min-height: 0; }
  .${prefix}-photo-cell { display: flex; flex-direction: column; width: 100%; min-height: 0; }
  .${prefix}-photo-title { margin: 0.3mm 0 0; text-align: center; font-size: 6pt; color: #334155; line-height: 1.1; flex: 0 0 auto; }
  .${prefix}-photo-num { font-weight: 700; margin-right: 0.4mm; }
  .${prefix}-photo-img-wrap { width: 100%; aspect-ratio: 4 / 3; overflow: hidden; border: 1px solid #cbd5e1; border-radius: 1px; background: #f8fafc; flex: 0 0 auto; }
  .${prefix}-photo-img-wrap img { width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; }
  .${prefix}-photo-cell-empty .${prefix}-photo-img-wrap { background: #d1d5db; }
  .${prefix}-no-photos { flex: 1; display: flex; align-items: center; justify-content: center; font-size: 10pt; color: #64748b; letter-spacing: 0.05em; }
  .${prefix}-page-footer {
    flex: 0 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 6.5pt;
    color: #64748b;
    border-top: 1px solid #e2e8f0;
    padding-top: 1mm;
    margin-top: auto;
    gap: 2mm;
  }
  .${prefix}-footer-project { font-weight: 600; color: #334155; }
  .${prefix}-footer-datetime { flex: 1; text-align: center; }
  .${prefix}-footer-pagenum { font-weight: 600; white-space: nowrap; }
`;
}
