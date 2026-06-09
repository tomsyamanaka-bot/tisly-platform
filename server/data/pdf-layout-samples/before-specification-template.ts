import { escapeHtml } from "../business/pdf/shared-blocks.js";
import { getTomsCompanyInfo } from "../business/pdf/company.js";

export interface SpecificationPhoto {
  url: string;
  title: string;
}

export interface SpecificationContext {
  addressee: string;
  subject: string;
  siteName: string;
  workLocation: string;
  issueDate: string;
  staffName: string;
  photos: SpecificationPhoto[];
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

function renderCompanyBlock(): string {
  const co = getTomsCompanyInfo();
  const emailLine = co.email ? `<div>${escapeHtml(co.email)}</div>` : "";
  return `<div class="sp-company-block">
    <div class="sp-company-name">${escapeHtml(co.name)}</div>
    <div>縲・{escapeHtml(co.postalCode)} ${escapeHtml(co.address)}</div>
    <div>TEL ${escapeHtml(co.phone)}</div>
    <div>諡・ｽ・${escapeHtml(co.representativeName)}</div>
    ${emailLine}
  </div>`;
}

function renderInfoPage(ctx: SpecificationContext): string {
  const rows = [
    ["螳帛錐", ctx.addressee],
    ["莉ｶ蜷・, ctx.subject],
    ["迴ｾ蝣ｴ蜷・, ctx.siteName],
    ["蟾･莠句ｴ謇", ctx.workLocation],
    ["菴懈・譌･", ctx.issueDate],
    ["諡・ｽ楢・, ctx.staffName],
  ]
    .map(
      ([label, value]) =>
        `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value || "窶・)}</td></tr>`
    )
    .join("");
  return `<div class="sp-page sp-info-page">
  <h1 class="sp-title">莉墓ｧ俶嶌</h1>
  <table class="sp-info-table">${rows}</table>
  ${renderCompanyBlock()}
</div>`;
}

function renderPhotoCell(photo: SpecificationPhoto | null): string {
  if (!photo) {
    return `<div class="sp-photo-cell sp-photo-empty"></div>`;
  }
  return `<div class="sp-photo-cell">
    <div class="sp-photo-img-wrap"><img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.title)}" /></div>
    <p class="sp-photo-title">${escapeHtml(photo.title)}</p>
  </div>`;
}

function renderPhotoPage(cells: (SpecificationPhoto | null)[]): string {
  const grid = cells.map(renderPhotoCell).join("");
  return `<div class="sp-page sp-photo-page"><div class="sp-photo-grid">${grid}</div></div>`;
}

function renderNoPhotosPage(): string {
  return `<div class="sp-page sp-photo-page">
  <div class="sp-no-photos">蜀咏悄譛ｪ逋ｻ骭ｲ</div>
</div>`;
}

function renderPhotoPages(photos: SpecificationPhoto[]): string {
  if (!photos.length) {
    return renderNoPhotosPage();
  }
  const pages = chunk(photos, PHOTOS_PER_PAGE);
  return pages
    .map((pagePhotos) => {
      const cells: (SpecificationPhoto | null)[] = [...pagePhotos];
      while (cells.length < PHOTOS_PER_PAGE) cells.push(null);
      return renderPhotoPage(cells);
    })
    .join("");
}

const SP_STYLES = `
  @page { size: A4 portrait; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif; color: #1a1a1a; margin: 0; padding: 0; font-size: 11pt; }
  .sp-page { width: 186mm; min-height: 269mm; page-break-after: always; padding: 6mm 4mm; }
  .sp-page:last-child { page-break-after: auto; }
  .sp-title { text-align: center; font-size: 18pt; margin: 6mm 0 10mm; letter-spacing: 0.15em; }
  .sp-info-table { width: 100%; border-collapse: collapse; margin: 0 auto 10mm; }
  .sp-info-table th { text-align: left; width: 28%; padding: 3mm 4mm; border-bottom: 1px solid #cbd5e1; font-weight: 600; color: #334155; }
  .sp-info-table td { padding: 3mm 4mm; border-bottom: 1px solid #e2e8f0; }
  .sp-company-block { margin-top: 14mm; padding-top: 6mm; border-top: 2px solid #94a3b8; font-size: 10pt; line-height: 1.6; color: #334155; }
  .sp-company-name { font-weight: 700; font-size: 11pt; margin-bottom: 2mm; }
  .sp-no-photos { display: flex; align-items: center; justify-content: center; min-height: 200mm; font-size: 14pt; color: #64748b; letter-spacing: 0.1em; }
  .sp-photo-grid {
    display: grid;
    grid-template-columns: repeat(${COLS}, 1fr);
    grid-template-rows: repeat(${ROWS}, 1fr);
    gap: 5mm;
    height: 265mm;
  }
  .sp-photo-cell { display: flex; flex-direction: column; min-height: 0; }
  .sp-photo-img-wrap { flex: 1; min-height: 0; overflow: hidden; border: 1px solid #cbd5e1; border-radius: 2px; background: #f8fafc; }
  .sp-photo-img-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .sp-photo-title { margin: 2mm 0 0; text-align: center; font-size: 9pt; color: #334155; line-height: 1.3; }
  .sp-photo-empty { visibility: hidden; }
`;

export function renderSpecificationHtml(ctx: SpecificationContext): string {
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"/>
<title>莉墓ｧ俶嶌 ${escapeHtml(ctx.subject)}</title>
<style>${SP_STYLES}</style></head><body>
${renderInfoPage(ctx)}
${renderPhotoPages(ctx.photos)}
</body></html>`;
}
