import { escapeHtml } from "../business/pdf/shared-blocks.js";
import { getTomsCompanyInfo } from "../business/pdf/company.js";
const PHOTOS_PER_PAGE = 6;
const COLS = 2;
const ROWS = 3;
function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) {
        out.push(arr.slice(i, i + size));
    }
    return out;
}
function renderCompanyBlock() {
    const co = getTomsCompanyInfo();
    const emailLine = co.email ? `<div>${escapeHtml(co.email)}</div>` : "";
    return `<div class="sp-company-block">
    <div class="sp-company-name">${escapeHtml(co.name)}</div>
    <div>〒${escapeHtml(co.postalCode)} ${escapeHtml(co.address)}</div>
    <div>TEL ${escapeHtml(co.phone)}</div>
    <div>担当 ${escapeHtml(co.representativeName)}</div>
    ${emailLine}
  </div>`;
}
function renderInfoPage(ctx) {
    const rows = [
        ["宛名", ctx.addressee],
        ["件名", ctx.subject],
        ["現場名", ctx.siteName],
        ["工事場所", ctx.workLocation],
        ["作成日", ctx.issueDate],
        ["担当者", ctx.staffName],
    ]
        .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value || "—")}</td></tr>`)
        .join("");
    return `<div class="sp-page sp-info-page">
  <h1 class="sp-title">仕様書</h1>
  <table class="sp-info-table">${rows}</table>
  ${renderCompanyBlock()}
</div>`;
}
function renderPhotoCell(photo) {
    if (!photo) {
        return `<div class="sp-photo-cell sp-photo-empty"></div>`;
    }
    return `<div class="sp-photo-cell">
    <div class="sp-photo-img-wrap"><img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.title)}" /></div>
    <p class="sp-photo-title">${escapeHtml(photo.title)}</p>
  </div>`;
}
function renderPhotoPage(cells) {
    const grid = cells.map(renderPhotoCell).join("");
    return `<div class="sp-page sp-photo-page"><div class="sp-photo-grid">${grid}</div></div>`;
}
function renderNoPhotosPage() {
    return `<div class="sp-page sp-photo-page">
  <div class="sp-no-photos">写真未登録</div>
</div>`;
}
function renderPhotoPages(photos) {
    if (!photos.length) {
        return renderNoPhotosPage();
    }
    const pages = chunk(photos, PHOTOS_PER_PAGE);
    return pages
        .map((pagePhotos) => {
        const cells = [...pagePhotos];
        while (cells.length < PHOTOS_PER_PAGE)
            cells.push(null);
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
export function renderSpecificationHtml(ctx) {
    return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"/>
<title>仕様書 ${escapeHtml(ctx.subject)}</title>
<style>${SP_STYLES}</style></head><body>
${renderInfoPage(ctx)}
${renderPhotoPages(ctx.photos)}
</body></html>`;
}
