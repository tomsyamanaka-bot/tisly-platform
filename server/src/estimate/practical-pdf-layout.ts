import { escapeHtml, escapeHtmlMultiline } from "../business/pdf/shared-blocks.js";
import { getTomsCompanyInfo } from "../business/pdf/company.js";

export const PAGE_MARGIN_MM = 4;
export const COLS = 2;
export const ROWS_FULL = 4;
export const PHOTOS_PER_PAGE = COLS * ROWS_FULL;

export interface PracticalPdfPhoto {
  url: string;
  title: string;
}

export interface PracticalPdfHeaderInput {
  docTitle: string;
  addressee: string;
  subject: string;
  workLocation?: string;
  issueDateLabel: string;
  issueDate: string;
  docNoLabel?: string;
  docNo?: string;
  notes?: string;
}

export interface PracticalPdfLayoutOptions {
  prefix: "sp" | "cr";
  pageTitle: string;
  header: PracticalPdfHeaderInput;
  photos: PracticalPdfPhoto[];
  noPhotosMessage?: string;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function renderSplitHeader(prefix: string, input: PracticalPdfHeaderInput): string {
  const co = getTomsCompanyInfo();
  const docNoRow =
    input.docNoLabel?.trim() && input.docNo?.trim()
      ? `<tr><th>${escapeHtml(input.docNoLabel)}</th><td>${escapeHtml(input.docNo)}</td></tr>`
      : "";
  const workLocation = input.workLocation?.trim()
    ? `<p class="${prefix}-subject"><span class="${prefix}-subject-label">工事場所</span> ${escapeHtml(input.workLocation)}</p>`
    : "";
  const notes = input.notes?.trim()
    ? `<p class="${prefix}-notes"><span class="${prefix}-subject-label">現調メモ</span> ${escapeHtmlMultiline(input.notes.trim())}</p>`
    : "";
  return `<div class="${prefix}-doc-header">
  <div class="${prefix}-doc-left">
    <h1 class="${prefix}-doc-title">${escapeHtml(input.docTitle)}</h1>
    <p class="${prefix}-addressee">${escapeHtml(input.addressee)}</p>
    <p class="${prefix}-subject"><span class="${prefix}-subject-label">件名</span> ${escapeHtml(input.subject)}</p>
    ${workLocation}
    ${notes}
  </div>
  <div class="${prefix}-doc-right">
    <table class="${prefix}-meta-table">
      <tr><th>${escapeHtml(input.issueDateLabel)}</th><td>${escapeHtml(input.issueDate || "—")}</td></tr>
      ${docNoRow}
    </table>
    <div class="${prefix}-company-block">
      <div class="${prefix}-company-name">${escapeHtml(co.name)}</div>
      <div>〒${escapeHtml(co.postalCode)} ${escapeHtml(co.address)}</div>
      <div>TEL ${escapeHtml(co.phone)}</div>
      <div>担当 ${escapeHtml(co.representativeName)}</div>
    </div>
  </div>
</div>`;
}

function renderPhotoCell(prefix: string, photo: PracticalPdfPhoto | null): string {
  if (!photo) {
    return `<div class="${prefix}-photo-cell ${prefix}-photo-empty"></div>`;
  }
  return `<div class="${prefix}-photo-cell">
    <div class="${prefix}-photo-img-wrap"><img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.title)}" /></div>
    <p class="${prefix}-photo-title">${escapeHtml(photo.title)}</p>
  </div>`;
}

function renderPhotoGrid(prefix: string, cells: (PracticalPdfPhoto | null)[]): string {
  return `<div class="${prefix}-photo-grid">${cells.map((c) => renderPhotoCell(prefix, c)).join("")}</div>`;
}

function padCells(photos: PracticalPdfPhoto[], size: number): (PracticalPdfPhoto | null)[] {
  const cells: (PracticalPdfPhoto | null)[] = [...photos];
  while (cells.length < size) cells.push(null);
  return cells;
}

function renderFirstPage(
  prefix: string,
  header: PracticalPdfHeaderInput,
  photos: PracticalPdfPhoto[]
): string {
  const cells = padCells(photos, PHOTOS_PER_PAGE);
  return `<div class="${prefix}-page ${prefix}-photo-page ${prefix}-first-page">
  ${renderSplitHeader(prefix, header)}
  ${renderPhotoGrid(prefix, cells)}
</div>`;
}

function renderPhotoOnlyPage(prefix: string, photos: PracticalPdfPhoto[]): string {
  const cells = padCells(photos, PHOTOS_PER_PAGE);
  return `<div class="${prefix}-page ${prefix}-photo-page">
  ${renderPhotoGrid(prefix, cells)}
</div>`;
}

function renderNoPhotosPage(
  prefix: string,
  header: PracticalPdfHeaderInput,
  noPhotosMessage: string
): string {
  return `<div class="${prefix}-page ${prefix}-photo-page ${prefix}-first-page">
  ${renderSplitHeader(prefix, header)}
  <div class="${prefix}-no-photos">${escapeHtml(noPhotosMessage)}</div>
</div>`;
}

function renderPhotoPages(
  prefix: string,
  header: PracticalPdfHeaderInput,
  photos: PracticalPdfPhoto[],
  noPhotosMessage: string
): string {
  if (!photos.length) {
    return renderNoPhotosPage(prefix, header, noPhotosMessage);
  }
  const pages = chunk(photos, PHOTOS_PER_PAGE);
  const first = renderFirstPage(prefix, header, pages[0]!);
  const rest = pages.slice(1).map((batch) => renderPhotoOnlyPage(prefix, batch)).join("");
  return first + rest;
}

export function buildPracticalPdfStyles(prefix: string): string {
  const m = PAGE_MARGIN_MM;
  const contentH = 297 - m * 2;
  const contentW = 210 - m * 2;
  return `
  @page { size: A4 portrait; margin: ${m}mm; }
  * { box-sizing: border-box; }
  body { font-family: "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif; color: #1a1a1a; margin: 0; padding: 0; font-size: 9pt; }
  .${prefix}-page { width: ${contentW}mm; height: ${contentH}mm; page-break-after: always; overflow: hidden; }
  .${prefix}-page:last-child { page-break-after: auto; }
  .${prefix}-first-page { display: flex; flex-direction: column; }
  .${prefix}-doc-header { flex: 0 0 auto; display: flex; justify-content: space-between; align-items: flex-start; gap: 3mm; max-height: 18%; overflow: hidden; padding-bottom: 1mm; border-bottom: 1px solid #0d9488; margin-bottom: 1mm; }
  .${prefix}-doc-left { flex: 1; min-width: 0; }
  .${prefix}-doc-right { flex: 0 0 42%; text-align: right; font-size: 6.5pt; line-height: 1.35; color: #334155; }
  .${prefix}-doc-title { font-size: 9pt; margin: 0 0 1mm; letter-spacing: 0.08em; font-weight: 700; line-height: 1.15; }
  .${prefix}-addressee { font-size: 7.5pt; margin: 0 0 0.5mm; font-weight: 600; }
  .${prefix}-subject { margin: 0 0 0.3mm; font-size: 6.5pt; line-height: 1.3; }
  .${prefix}-notes { margin: 0; font-size: 6pt; line-height: 1.3; color: #475569; }
  .${prefix}-subject-label { font-weight: 600; margin-right: 0.5mm; }
  .${prefix}-meta-table { border-collapse: collapse; margin: 0 0 0.5mm auto; font-size: 6.5pt; }
  .${prefix}-meta-table th, .${prefix}-meta-table td { padding: 0.1mm 0 0.1mm 1mm; text-align: left; vertical-align: top; }
  .${prefix}-meta-table th { font-weight: 600; color: #475569; white-space: nowrap; }
  .${prefix}-company-block { margin-top: 0.3mm; }
  .${prefix}-company-name { font-weight: 700; font-size: 6.8pt; margin-bottom: 0.2mm; }
  .${prefix}-no-photos { flex: 1; display: flex; align-items: center; justify-content: center; font-size: 10pt; color: #64748b; letter-spacing: 0.05em; }
  .${prefix}-photo-grid {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(${COLS}, 1fr);
    grid-template-rows: repeat(${ROWS_FULL}, 1fr);
    gap: 3mm;
  }
  .${prefix}-page:not(.${prefix}-first-page) .${prefix}-photo-grid { height: 100%; }
  .${prefix}-photo-cell { display: flex; flex-direction: column; min-height: 0; }
  .${prefix}-photo-title { margin: 1mm 0 0; text-align: center; font-size: 7.5pt; color: #334155; line-height: 1.2; flex: 0 0 auto; }
  .${prefix}-photo-img-wrap { flex: 1; min-height: 0; overflow: hidden; border: 1px solid #cbd5e1; border-radius: 1px; background: #f8fafc; }
  .${prefix}-photo-img-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .${prefix}-photo-empty { visibility: hidden; }
`;
}

export function renderPracticalPdfHtml(opts: PracticalPdfLayoutOptions): string {
  const { prefix, pageTitle, header, photos, noPhotosMessage = "写真未登録" } = opts;
  const styles = buildPracticalPdfStyles(prefix);
  const body = renderPhotoPages(prefix, header, photos, noPhotosMessage);
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"/>
<title>${escapeHtml(pageTitle)}</title>
<style>${styles}</style></head><body>
${body}
</body></html>`;
}
