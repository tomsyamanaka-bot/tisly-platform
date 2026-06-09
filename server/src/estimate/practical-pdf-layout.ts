import { escapeHtml } from "../business/pdf/shared-blocks.js";
import { getTomsCompanyInfo } from "../business/pdf/company.js";

export const PAGE_MARGIN_MM = 6;
export const COLS = 2;
export const ROWS_FULL = 4;
export const PHOTOS_PER_PAGE = COLS * ROWS_FULL;

export interface PracticalPdfPhoto {
  url: string;
  title: string;
}

export interface PracticalPdfInfoField {
  label: string;
  value: string;
}

export interface PracticalPdfLayoutOptions {
  prefix: "sp" | "cr";
  docTitle: string;
  pageTitle: string;
  infoFields: PracticalPdfInfoField[];
  photos: PracticalPdfPhoto[];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function renderCompanyBlock(prefix: string): string {
  const co = getTomsCompanyInfo();
  const emailLine = co.email ? `<div>${escapeHtml(co.email)}</div>` : "";
  return `<div class="${prefix}-company-block">
    <div class="${prefix}-company-name">${escapeHtml(co.name)}</div>
    <div>〒${escapeHtml(co.postalCode)} ${escapeHtml(co.address)}</div>
    <div>TEL ${escapeHtml(co.phone)}</div>
    <div>担当 ${escapeHtml(co.representativeName)}</div>
    ${emailLine}
  </div>`;
}

function renderCompactHeader(prefix: string, docTitle: string, fields: PracticalPdfInfoField[]): string {
  const rowHtml = fields
    .map(
      (f) =>
        `<tr><th>${escapeHtml(f.label)}</th><td>${escapeHtml(f.value || "—")}</td></tr>`
    )
    .join("");
  return `<div class="${prefix}-header">
  <h1 class="${prefix}-title">${escapeHtml(docTitle)}</h1>
  <table class="${prefix}-info-table">${rowHtml}</table>
</div>`;
}

function renderPhotoCell(prefix: string, photo: PracticalPdfPhoto | null): string {
  if (!photo) {
    return `<div class="${prefix}-photo-cell ${prefix}-photo-empty"></div>`;
  }
  return `<div class="${prefix}-photo-cell">
    <p class="${prefix}-photo-title">${escapeHtml(photo.title)}</p>
    <div class="${prefix}-photo-img-wrap"><img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.title)}" /></div>
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

function renderFirstPage(prefix: string, docTitle: string, fields: PracticalPdfInfoField[], photos: PracticalPdfPhoto[]): string {
  const cells = padCells(photos, PHOTOS_PER_PAGE);
  return `<div class="${prefix}-page ${prefix}-photo-page ${prefix}-first-page">
  ${renderCompactHeader(prefix, docTitle, fields)}
  ${renderPhotoGrid(prefix, cells)}
</div>`;
}

function renderPhotoOnlyPage(prefix: string, photos: PracticalPdfPhoto[]): string {
  const cells = padCells(photos, PHOTOS_PER_PAGE);
  return `<div class="${prefix}-page ${prefix}-photo-page">
  ${renderPhotoGrid(prefix, cells)}
</div>`;
}

function renderNoPhotosPage(prefix: string, docTitle: string, fields: PracticalPdfInfoField[]): string {
  return `<div class="${prefix}-page ${prefix}-photo-page ${prefix}-first-page">
  ${renderCompactHeader(prefix, docTitle, fields)}
  <div class="${prefix}-no-photos">写真未登録</div>
  ${renderCompanyBlock(prefix)}
</div>`;
}

function renderPhotoPages(prefix: string, docTitle: string, fields: PracticalPdfInfoField[], photos: PracticalPdfPhoto[]): string {
  if (!photos.length) {
    return renderNoPhotosPage(prefix, docTitle, fields);
  }
  const pages = chunk(photos, PHOTOS_PER_PAGE);
  const first = renderFirstPage(prefix, docTitle, fields, pages[0]!);
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
  .${prefix}-header { flex: 0 0 auto; max-height: 15%; overflow: hidden; padding-bottom: 1.5mm; }
  .${prefix}-title { text-align: center; font-size: 11pt; margin: 0 0 1.5mm; letter-spacing: 0.12em; font-weight: 700; line-height: 1.2; }
  .${prefix}-info-table { width: 100%; border-collapse: collapse; margin: 0; font-size: 7.5pt; }
  .${prefix}-info-table th { text-align: left; width: 18%; padding: 0.6mm 1.5mm; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #334155; white-space: nowrap; }
  .${prefix}-info-table td { padding: 0.6mm 1.5mm; border-bottom: 1px solid #f1f5f9; line-height: 1.25; }
  .${prefix}-company-block { margin-top: auto; padding-top: 3mm; border-top: 1px solid #94a3b8; font-size: 8pt; line-height: 1.45; color: #334155; }
  .${prefix}-company-name { font-weight: 700; font-size: 8.5pt; margin-bottom: 0.5mm; }
  .${prefix}-no-photos { flex: 1; display: flex; align-items: center; justify-content: center; font-size: 12pt; color: #64748b; letter-spacing: 0.1em; }
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
  .${prefix}-photo-title { margin: 0 0 1mm; text-align: center; font-size: 7.5pt; color: #334155; line-height: 1.2; flex: 0 0 auto; }
  .${prefix}-photo-img-wrap { flex: 1; min-height: 0; overflow: hidden; border: 1px solid #cbd5e1; border-radius: 1px; background: #f8fafc; }
  .${prefix}-photo-img-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .${prefix}-photo-empty { visibility: hidden; }
`;
}

export function renderPracticalPdfHtml(opts: PracticalPdfLayoutOptions): string {
  const { prefix, docTitle, pageTitle, infoFields, photos } = opts;
  const styles = buildPracticalPdfStyles(prefix);
  const body = renderPhotoPages(prefix, docTitle, infoFields, photos);
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"/>
<title>${escapeHtml(pageTitle)}</title>
<style>${styles}</style></head><body>
${body}
</body></html>`;
}
