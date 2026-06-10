import { escapeHtml, renderTomsOfficialReportHeader } from "../business/pdf/shared-blocks.js";
import { TOMS_OFFICIAL_CORE_STYLES, TOMS_PDF_VIEWPORT_META } from "../business/pdf/styles.js";

export const PAGE_MARGIN_MM = 2.5;
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

function renderReportHeader(input: PracticalPdfHeaderInput): string {
  return renderTomsOfficialReportHeader({
    docTitle: input.docTitle,
    addressee: input.addressee,
    subject: input.subject,
    workLocation: input.workLocation,
    workLocationLabel: "工事場所",
    notes: input.notes,
    issueDateLabel: input.issueDateLabel,
    issueDate: input.issueDate,
    docNoLabel: input.docNoLabel,
    docNo: input.docNo,
    compact: true,
  });
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
  ${renderReportHeader(header)}
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
  const msg = escapeHtml(noPhotosMessage);
  return `<div class="${prefix}-page ${prefix}-photo-page ${prefix}-first-page">
  ${renderReportHeader(header)}
  <div class="${prefix}-no-photos">${msg}</div>
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
  body { font-family: "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif; color: #1a1a1a; margin: 0; padding: 0; font-size: 9pt; word-break: keep-all; }
  ${TOMS_OFFICIAL_CORE_STYLES}
  .${prefix}-page { width: ${contentW}mm; height: ${contentH}mm; page-break-after: always; overflow: hidden; }
  .${prefix}-page:last-child { page-break-after: auto; }
  .${prefix}-first-page { display: flex; flex-direction: column; }
  .${prefix}-first-page .toms-official { flex: 0 0 auto; }
  .${prefix}-no-photos { flex: 1; display: flex; align-items: center; justify-content: center; font-size: 10pt; color: #64748b; letter-spacing: 0.05em; }
  .${prefix}-photo-grid {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(${COLS}, 1fr);
    grid-template-rows: repeat(${ROWS_FULL}, 1fr);
    gap: 1.8mm;
    margin-top: 0.5mm;
  }
  .${prefix}-page:not(.${prefix}-first-page) .${prefix}-photo-grid { height: 100%; margin-top: 0; }
  .${prefix}-photo-cell { display: flex; flex-direction: column; min-height: 0; }
  .${prefix}-photo-title { margin: 0.4mm 0 0; text-align: center; font-size: 6.5pt; color: #334155; line-height: 1.15; flex: 0 0 auto; }
  .${prefix}-photo-img-wrap { flex: 1; min-height: 0; overflow: hidden; border: 1px solid #cbd5e1; border-radius: 1px; background: #f8fafc; }
  .${prefix}-photo-img-wrap img { width: 100%; height: 100%; object-fit: contain; object-position: center; display: block; }
  .${prefix}-photo-empty { visibility: hidden; }
`;
}

export function renderPracticalPdfHtml(opts: PracticalPdfLayoutOptions): string {
  const { prefix, pageTitle, header, photos, noPhotosMessage = "写真未登録" } = opts;
  const styles = buildPracticalPdfStyles(prefix);
  const body = renderPhotoPages(prefix, header, photos, noPhotosMessage);
  const safeTitle = escapeHtml(pageTitle);
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"/>
${TOMS_PDF_VIEWPORT_META}
<title>${safeTitle}</title>
<style>${styles}</style></head><body>
${body}
</body></html>`;
}
