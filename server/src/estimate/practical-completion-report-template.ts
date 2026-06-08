import { escapeHtml } from "../business/pdf/shared-blocks.js";

export interface PracticalCompletionReportPhoto {
  url: string;
  title: string;
}

export interface PracticalCompletionReportContext {
  projectNo: string;
  addressee: string;
  siteName: string;
  workLocation: string;
  workDate: string;
  staffName: string;
  photos: PracticalCompletionReportPhoto[];
}

const PHOTOS_PER_PAGE = 6;
const COLS = 2;
const ROWS = 3;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function renderInfoPage(ctx: PracticalCompletionReportContext): string {
  const rows = [
    ["案件番号", ctx.projectNo],
    ["宛名", ctx.addressee],
    ["現場名", ctx.siteName],
    ["工事場所", ctx.workLocation],
    ["作業日", ctx.workDate],
    ["担当者", ctx.staffName],
  ]
    .map(
      ([label, value]) =>
        `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value || "—")}</td></tr>`
    )
    .join("");
  return `<div class="cr-page cr-info-page">
  <h1 class="cr-title">完了報告書</h1>
  <table class="cr-info-table">${rows}</table>
  <hr class="cr-divider" />
</div>`;
}

function renderPhotoCell(photo: PracticalCompletionReportPhoto | null): string {
  if (!photo) {
    return `<div class="cr-photo-cell cr-photo-empty"></div>`;
  }
  return `<div class="cr-photo-cell">
    <div class="cr-photo-img-wrap"><img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.title)}" /></div>
    <p class="cr-photo-title">${escapeHtml(photo.title || "（タイトルなし）")}</p>
  </div>`;
}

function renderPhotoPage(cells: (PracticalCompletionReportPhoto | null)[]): string {
  const grid = cells.map(renderPhotoCell).join("");
  return `<div class="cr-page cr-photo-page"><div class="cr-photo-grid">${grid}</div></div>`;
}

function renderPhotoPages(photos: PracticalCompletionReportPhoto[]): string {
  if (!photos.length) {
    const empty = Array.from({ length: PHOTOS_PER_PAGE }, () => null);
    return renderPhotoPage(empty);
  }
  const pages = chunk(photos, PHOTOS_PER_PAGE);
  return pages
    .map((pagePhotos) => {
      const cells: (PracticalCompletionReportPhoto | null)[] = [...pagePhotos];
      while (cells.length < PHOTOS_PER_PAGE) cells.push(null);
      return renderPhotoPage(cells);
    })
    .join("");
}

const CR_STYLES = `
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif; color: #1a1a1a; margin: 0; padding: 0; font-size: 11pt; }
  .cr-page { width: 186mm; min-height: 273mm; page-break-after: always; padding: 4mm 0; }
  .cr-page:last-child { page-break-after: auto; }
  .cr-title { text-align: center; font-size: 18pt; margin: 8mm 0 12mm; letter-spacing: 0.15em; }
  .cr-info-table { width: 100%; border-collapse: collapse; margin: 0 auto 8mm; }
  .cr-info-table th { text-align: left; width: 28%; padding: 3mm 4mm; border-bottom: 1px solid #cbd5e1; font-weight: 600; color: #334155; }
  .cr-info-table td { padding: 3mm 4mm; border-bottom: 1px solid #e2e8f0; }
  .cr-divider { border: none; border-top: 2px solid #94a3b8; margin: 10mm 0; }
  .cr-photo-grid {
    display: grid;
    grid-template-columns: repeat(${COLS}, 1fr);
    grid-template-rows: repeat(${ROWS}, 1fr);
    gap: 5mm;
    height: 265mm;
  }
  .cr-photo-cell { display: flex; flex-direction: column; min-height: 0; }
  .cr-photo-img-wrap { flex: 1; min-height: 0; overflow: hidden; border: 1px solid #cbd5e1; border-radius: 2px; background: #f8fafc; }
  .cr-photo-img-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cr-photo-title { margin: 2mm 0 0; text-align: center; font-size: 9pt; color: #334155; line-height: 1.3; }
  .cr-photo-empty { visibility: hidden; }
`;

export function renderPracticalCompletionReportHtml(ctx: PracticalCompletionReportContext): string {
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"/>
<title>完了報告書 ${escapeHtml(ctx.projectNo)}</title>
<style>${CR_STYLES}</style></head><body>
${renderInfoPage(ctx)}
${renderPhotoPages(ctx.photos)}
</body></html>`;
}
