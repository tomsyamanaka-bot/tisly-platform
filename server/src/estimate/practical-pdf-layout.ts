import { escapeHtml, escapeHtmlMultiline, formatPhotoCircledNumber } from "../business/pdf/shared-blocks.js";
import { getTomsCompanyInfo } from "../business/pdf/company.js";
import { TOMS_PDF_VIEWPORT_META } from "../business/pdf/styles.js";

export const PAGE_MARGIN_MM = 2.5;
export const COLS = 2;
export const ROWS = 3;
export const PHOTOS_PER_PAGE = COLS * ROWS;
/** 1ページ目（表紙）に載せる写真の上限。7枚目以降は2ページ目へ */
export const FIRST_PAGE_PHOTOS_MAX = PHOTOS_PER_PAGE;

export interface PracticalPdfPhoto {
  url: string;
  title: string;
}

export interface PracticalPdfCoverField {
  label: string;
  value: string;
}

export interface PracticalPdfCoverSection {
  title: string;
  body: string;
}

export interface PracticalPdfLayoutOptions {
  prefix: "sp" | "cr";
  pageTitle: string;
  /** 例: システム仕様書 / 工事完了報告書 */
  documentTitle: string;
  projectNo: string;
  generatedAt: string;
  coverFields: PracticalPdfCoverField[];
  coverSections?: PracticalPdfCoverSection[];
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

/** 写真番号 ① ② … （PDF 2列×3段レイアウト用） */
export { formatPhotoCircledNumber } from "../business/pdf/shared-blocks.js";

function formatFooterDateTime(isoOrDate: string): string {
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

function renderPageFooter(
  prefix: string,
  projectNo: string,
  generatedAt: string,
  pageNum: number,
  totalPages: number
): string {
  const dt = formatFooterDateTime(generatedAt);
  return `<div class="${prefix}-page-footer">
    <span class="${prefix}-footer-project">${escapeHtml(projectNo || "—")}</span>
    <span class="${prefix}-footer-datetime">${escapeHtml(dt)}</span>
    <span class="${prefix}-footer-pagenum">Page ${pageNum} / ${totalPages}</span>
  </div>`;
}

function renderCoverPage(
  prefix: string,
  documentTitle: string,
  fields: PracticalPdfCoverField[],
  sections: PracticalPdfCoverSection[] | undefined,
  coverPhotos: PracticalPdfPhoto[],
  footerHtml: string,
  noPhotosMessage?: string,
  showNoPhotosOnCover?: boolean
): string {
  const co = getTomsCompanyInfo();
  const fieldRows = fields
    .filter((f) => f.value?.trim())
    .map(
      (f) =>
        `<tr><th>${escapeHtml(f.label)}</th><td>${escapeHtmlMultiline(f.value.trim())}</td></tr>`
    )
    .join("");
  const sectionBlocks = (sections ?? [])
    .filter((s) => s.body?.trim())
    .map(
      (s) =>
        `<div class="${prefix}-cover-section">
      <h3>${escapeHtml(s.title)}</h3>
      <div class="${prefix}-cover-section-body">${escapeHtmlMultiline(s.body.trim())}</div>
    </div>`
    )
    .join("");
  const noPhotos =
    showNoPhotosOnCover && noPhotosMessage
      ? `<div class="${prefix}-no-photos-cover">${escapeHtml(noPhotosMessage)}</div>`
      : "";
  const coverPhotoGrid = coverPhotos.length
    ? renderPhotoGrid(prefix, coverPhotos, 1, `${prefix}-cover-photo-grid`)
    : "";
  return `<div class="${prefix}-page ${prefix}-cover-page">
  <div class="${prefix}-cover-header">
    <div class="${prefix}-cover-rule"></div>
    <div class="${prefix}-cover-company">${escapeHtml(co.name)}</div>
    <h1 class="${prefix}-cover-title">${escapeHtml(documentTitle)}</h1>
    <div class="${prefix}-cover-rule"></div>
  </div>
  <table class="${prefix}-cover-fields">${fieldRows}</table>
  ${sectionBlocks ? `<div class="${prefix}-cover-rule"></div>${sectionBlocks}` : ""}
  ${coverPhotoGrid}
  ${noPhotos}
  ${footerHtml}
</div>`;
}

function renderPhotoCell(prefix: string, photo: PracticalPdfPhoto, globalIndex: number): string {
  const num = formatPhotoCircledNumber(globalIndex);
  const title = photo.title?.trim() || `写真${globalIndex}`;
  return `<div class="${prefix}-photo-cell">
    <div class="${prefix}-photo-img-wrap"><img src="${escapeHtml(photo.url)}" alt="${escapeHtml(title)}" /></div>
    <p class="${prefix}-photo-title"><span class="${prefix}-photo-num">${num}</span> ${escapeHtml(title)}</p>
  </div>`;
}

function renderPhotoGrid(
  prefix: string,
  photos: PracticalPdfPhoto[],
  startIndex: number,
  extraClass = ""
): string {
  const gridClass = extraClass
    ? `${prefix}-photo-grid ${extraClass}`
    : `${prefix}-photo-grid`;
  return `<div class="${gridClass}">${photos
    .map((p, i) => renderPhotoCell(prefix, p, startIndex + i))
    .join("")}</div>`;
}

function renderPhotoPage(
  prefix: string,
  photos: PracticalPdfPhoto[],
  footerHtml: string,
  startIndex: number
): string {
  return `<div class="${prefix}-page ${prefix}-photo-page">
  ${renderPhotoGrid(prefix, photos, startIndex)}
  ${footerHtml}
</div>`;
}

function renderNoPhotosPage(prefix: string, message: string, footerHtml: string): string {
  return `<div class="${prefix}-page ${prefix}-photo-page">
  <div class="${prefix}-no-photos">${escapeHtml(message)}</div>
  ${footerHtml}
</div>`;
}

function renderAllPages(opts: PracticalPdfLayoutOptions): string {
  const {
    prefix,
    documentTitle,
    projectNo,
    generatedAt,
    coverFields,
    coverSections,
    photos,
    noPhotosMessage = "写真未登録",
  } = opts;

  const coverPhotos = photos.slice(0, FIRST_PAGE_PHOTOS_MAX);
  const remainingPhotos = photos.slice(FIRST_PAGE_PHOTOS_MAX);
  const continuationPages = remainingPhotos.length ? chunk(remainingPhotos, PHOTOS_PER_PAGE) : [];
  const totalPages = photos.length ? 1 + continuationPages.length : 2;

  const pages: string[] = [];
  pages.push(
    renderCoverPage(
      prefix,
      documentTitle,
      coverFields,
      coverSections,
      coverPhotos,
      renderPageFooter(prefix, projectNo, generatedAt, 1, totalPages),
      noPhotosMessage,
      !photos.length
    )
  );

  if (!photos.length) {
    pages.push(
      renderNoPhotosPage(
        prefix,
        noPhotosMessage,
        renderPageFooter(prefix, projectNo, generatedAt, 2, totalPages)
      )
    );
  } else {
    continuationPages.forEach((batch, idx) => {
      pages.push(
        renderPhotoPage(
          prefix,
          batch,
          renderPageFooter(prefix, projectNo, generatedAt, idx + 2, totalPages),
          FIRST_PAGE_PHOTOS_MAX + idx * PHOTOS_PER_PAGE + 1
        )
      );
    });
  }

  return pages.join("");
}

export function buildPracticalPdfStyles(prefix: string): string {
  const m = PAGE_MARGIN_MM;
  const contentH = 297 - m * 2;
  const contentW = 210 - m * 2;
  return `
  @page { size: A4 portrait; margin: ${m}mm; }
  * { box-sizing: border-box; }
  body { font-family: "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif; color: #1a1a1a; margin: 0; padding: 0; font-size: 9pt; word-break: keep-all; }
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
  .${prefix}-cover-page { padding: 0.5mm 0 0; }
  .${prefix}-cover-header { text-align: center; margin-bottom: 1mm; flex: 0 0 auto; }
  .${prefix}-cover-rule { height: 0; border-top: 1px solid #94a3b8; margin: 0.8mm 0; }
  .${prefix}-cover-company { font-size: 9.5pt; font-weight: 700; letter-spacing: 0.08em; margin: 0.5mm 0; }
  .${prefix}-cover-title { font-size: 13pt; font-weight: 700; margin: 0.8mm 0; letter-spacing: 0.12em; }
  .${prefix}-cover-fields { width: 100%; border-collapse: collapse; margin: 0.5mm 0 1mm; font-size: 8pt; flex: 0 0 auto; }
  .${prefix}-cover-fields th { text-align: left; width: 20%; padding: 0.35mm 1mm; color: #475569; font-weight: 600; vertical-align: top; border-bottom: 1px solid #e2e8f0; line-height: 1.2; }
  .${prefix}-cover-fields td { padding: 0.35mm 1mm; color: #0f172a; vertical-align: top; border-bottom: 1px solid #f1f5f9; line-height: 1.2; }
  .${prefix}-cover-section { margin: 0.8mm 0; flex: 0 0 auto; }
  .${prefix}-cover-section h3 { margin: 0 0 0.4mm; font-size: 8pt; font-weight: 700; color: #334155; }
  .${prefix}-cover-section-body { font-size: 7.5pt; line-height: 1.35; color: #0f172a; white-space: pre-wrap; }
  .${prefix}-no-photos-cover { margin-top: 2mm; text-align: center; font-size: 9pt; color: #64748b; flex: 0 0 auto; }
  .${prefix}-photo-page { padding: 0; }
  .${prefix}-photo-grid {
    display: grid;
    grid-template-columns: repeat(${COLS}, 1fr);
    grid-auto-flow: row;
    gap: 1.8mm;
    align-content: start;
  }
  .${prefix}-cover-photo-grid {
    flex: 0 0 auto;
    margin: 0.8mm 0 0.5mm;
    grid-template-rows: repeat(${ROWS}, auto);
  }
  .${prefix}-photo-page .${prefix}-photo-grid {
    flex: 1;
    min-height: 0;
    grid-template-rows: repeat(${ROWS}, 1fr);
    margin-bottom: 1mm;
  }
  .${prefix}-photo-page .${prefix}-photo-img-wrap { aspect-ratio: auto; flex: 1; min-height: 0; }
  .${prefix}-photo-cell { display: flex; flex-direction: column; width: 100%; min-height: 0; }
  .${prefix}-photo-title { margin: 0.4mm 0 0; text-align: center; font-size: 6.5pt; color: #334155; line-height: 1.15; flex: 0 0 auto; }
  .${prefix}-photo-num { font-weight: 700; margin-right: 0.5mm; }
  .${prefix}-photo-img-wrap { width: 100%; aspect-ratio: 4 / 3; overflow: hidden; border: 1px solid #cbd5e1; border-radius: 1px; background: #f8fafc; }
  .${prefix}-photo-img-wrap img { width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; }
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

export function renderPracticalPdfHtml(opts: PracticalPdfLayoutOptions): string {
  const { prefix, pageTitle } = opts;
  const styles = buildPracticalPdfStyles(prefix);
  const body = renderAllPages(opts);
  const safeTitle = escapeHtml(pageTitle);
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"/>
${TOMS_PDF_VIEWPORT_META}
<title>${safeTitle}</title>
<style>${styles}</style></head><body>
${body}
</body></html>`;
}
