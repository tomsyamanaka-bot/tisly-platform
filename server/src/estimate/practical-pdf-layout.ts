import { escapeHtml, escapeHtmlMultiline, formatPhotoCircledNumber } from "../business/pdf/shared-blocks.js";
import {
  buildPdfPhotoGridStyles,
  countPdfPhotoLayoutPages,
  renderPdfCoverHeader,
  renderPdfStandardPageFooter,
  resolveCoverPhotoCapacity,
  slicePdfPhotosForPages,
  wrapPdfHtmlDocument,
} from "../business/pdf/pdf-base-template.js";
import {
  PDF_PHOTO_COLS as COLS,
  PDF_PHOTO_ROWS as ROWS,
  PDF_PHOTOS_PER_PAGE as PHOTOS_PER_PAGE,
  PDF_PRACTICAL_PAGE_MARGIN_MM as PAGE_MARGIN_MM,
} from "../business/pdf/pdf-constants.js";

export { COLS, ROWS, PHOTOS_PER_PAGE, PAGE_MARGIN_MM };

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

export interface PracticalPdfDrawingImage {
  url: string;
  title: string;
}

export interface PracticalPdfLayoutOptions {
  prefix: "sp" | "cr";
  pageTitle: string;
  /** 例: 仕様書 / 工事完了報告書 */
  documentTitle: string;
  projectNo: string;
  generatedAt: string;
  coverFields: PracticalPdfCoverField[];
  coverSections?: PracticalPdfCoverSection[];
  photos: PracticalPdfPhoto[];
  drawings?: PracticalPdfDrawingImage[];
  noPhotosMessage?: string;
}

/** 1ページ目（表紙）に載せる写真の上限。7枚目以降は2ページ目へ */
export const FIRST_PAGE_PHOTOS_MAX = PHOTOS_PER_PAGE;

export function slicePhotosForPages(photos: PracticalPdfPhoto[]): {
  coverPhotos: PracticalPdfPhoto[];
  continuationPages: PracticalPdfPhoto[][];
} {
  return slicePdfPhotosForPages(photos, FIRST_PAGE_PHOTOS_MAX, PHOTOS_PER_PAGE);
}

export function slicePhotosForPagesWithCapacity(
  photos: PracticalPdfPhoto[],
  firstPageMax: number
): {
  coverPhotos: PracticalPdfPhoto[];
  continuationPages: PracticalPdfPhoto[][];
} {
  return slicePdfPhotosForPages(photos, firstPageMax, PHOTOS_PER_PAGE);
}

export function countPhotoLayoutPages(photoCount: number, firstPageMax?: number): number {
  return countPdfPhotoLayoutPages(photoCount, firstPageMax ?? FIRST_PAGE_PHOTOS_MAX);
}

/** 写真番号 ① ② … （PDF 2列×3段レイアウト用） */
export { formatPhotoCircledNumber } from "../business/pdf/shared-blocks.js";

function renderDrawingBlocks(prefix: string, drawings: PracticalPdfDrawingImage[]): string {
  if (!drawings.length) return "";
  return drawings
    .map(
      (d) =>
        `<div class="${prefix}-drawing-block">
      <h3 class="${prefix}-drawing-title">${escapeHtml(d.title?.trim() || "図面")}</h3>
      <div class="${prefix}-drawing-img-wrap"><img src="${escapeHtml(d.url)}" alt="${escapeHtml(d.title || "図面")}" /></div>
    </div>`
    )
    .join("");
}

function renderCoverPage(
  prefix: string,
  documentTitle: string,
  fields: PracticalPdfCoverField[],
  sections: PracticalPdfCoverSection[] | undefined,
  coverPhotos: PracticalPdfPhoto[],
  footerHtml: string,
  drawings: PracticalPdfDrawingImage[] | undefined,
  noPhotosMessage?: string,
  showNoPhotosOnCover?: boolean,
  coverPhotoSlotCount: number = PHOTOS_PER_PAGE
): string {
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
  const coverPhotoGrid =
    coverPhotoSlotCount > 0
      ? renderPhotoGrid(
          prefix,
          coverPhotos,
          1,
          `${prefix}-cover-photo-grid`,
          coverPhotoSlotCount
        )
      : "";
  return `<div class="${prefix}-page ${prefix}-cover-page">
  ${renderPdfCoverHeader(prefix, documentTitle)}
  <table class="${prefix}-cover-fields">${fieldRows}</table>
  ${sectionBlocks ? `<div class="${prefix}-cover-rule"></div>${sectionBlocks}` : ""}
  ${renderDrawingBlocks(prefix, drawings ?? [])}
  ${coverPhotoGrid}
  ${noPhotos}
  ${footerHtml}
</div>`;
}

export function renderPhotoCellHtml(prefix: string, photo: PracticalPdfPhoto, globalIndex: number): string {
  const num = formatPhotoCircledNumber(globalIndex);
  const title = photo.title?.trim() || `写真${globalIndex}`;
  return `<div class="${prefix}-photo-cell">
    <div class="${prefix}-photo-img-wrap"><img src="${escapeHtml(photo.url)}" alt="${escapeHtml(title)}" /></div>
    <p class="${prefix}-photo-title"><span class="${prefix}-photo-num">${num}</span> ${escapeHtml(title)}</p>
  </div>`;
}

export function renderEmptyPhotoCellHtml(prefix: string): string {
  return `<div class="${prefix}-photo-cell ${prefix}-photo-cell-empty">
    <div class="${prefix}-photo-img-wrap"></div>
    <p class="${prefix}-photo-title">&nbsp;</p>
  </div>`;
}

export function renderPhotoGridHtml(
  prefix: string,
  photos: PracticalPdfPhoto[],
  startIndex: number,
  extraClass = "",
  fixedCellCount?: number
): string {
  const gridClass = extraClass
    ? `${prefix}-photo-grid ${extraClass}`
    : `${prefix}-photo-grid`;
  const cells = photos.map((p, i) => renderPhotoCellHtml(prefix, p, startIndex + i));
  const targetCount = fixedCellCount ?? photos.length;
  for (let i = photos.length; i < targetCount; i++) {
    cells.push(renderEmptyPhotoCellHtml(prefix));
  }
  return `<div class="${gridClass}">${cells.join("")}</div>`;
}

function renderPhotoGrid(
  prefix: string,
  photos: PracticalPdfPhoto[],
  startIndex: number,
  extraClass = "",
  fixedCellCount?: number
): string {
  return renderPhotoGridHtml(prefix, photos, startIndex, extraClass, fixedCellCount);
}

export function renderPhotoContinuationPagesHtml(
  prefix: string,
  continuationPages: PracticalPdfPhoto[][],
  projectNo: string,
  generatedAt: string,
  startPageNum: number,
  totalPages: number,
  photoStartIndex: number
): string {
  return continuationPages
    .map((batch, idx) =>
      renderPhotoPage(
        prefix,
        batch,
        renderPdfStandardPageFooter({
          prefix,
          projectNo,
          generatedAt,
          pageNum: startPageNum + idx,
          totalPages,
        }),
        photoStartIndex + idx * PHOTOS_PER_PAGE
      )
    )
    .join("");
}

function renderPhotoPage(
  prefix: string,
  photos: PracticalPdfPhoto[],
  footerHtml: string,
  startIndex: number
): string {
  return `<div class="${prefix}-page ${prefix}-photo-page">
  ${renderPhotoGrid(prefix, photos, startIndex, "", PHOTOS_PER_PAGE)}
  ${footerHtml}
</div>`;
}

function renderNoPhotosPage(prefix: string, message: string, footerHtml: string): string {
  return `<div class="${prefix}-page ${prefix}-photo-page">
  <div class="${prefix}-no-photos">${escapeHtml(message)}</div>
  ${footerHtml}
</div>`;
}

function resolveLayoutSlices(opts: PracticalPdfLayoutOptions): {
  coverPhotos: PracticalPdfPhoto[];
  continuationPages: PracticalPdfPhoto[][];
  firstPageMax: number;
  coverPhotoSlotCount: number;
} {
  const sections = (opts.coverSections ?? []).filter((s) => s.body?.trim());
  const firstPageMax = resolveCoverPhotoCapacity({
    sectionCount: sections.length,
    hasDrawings: (opts.drawings ?? []).length > 0,
    defaultMax: FIRST_PAGE_PHOTOS_MAX,
  });
  const { coverPhotos, continuationPages } = slicePhotosForPagesWithCapacity(
    opts.photos,
    firstPageMax
  );
  const coverPhotoSlotCount =
    firstPageMax > 0 ? PHOTOS_PER_PAGE : 0;
  return { coverPhotos, continuationPages, firstPageMax, coverPhotoSlotCount };
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
    drawings,
    noPhotosMessage = "写真未登録",
  } = opts;

  const { coverPhotos, continuationPages, coverPhotoSlotCount } = resolveLayoutSlices(opts);
  const totalPages = photos.length ? 1 + continuationPages.length : 2;
  const continuationStartIndex =
    coverPhotoSlotCount > 0 ? coverPhotos.length + 1 : 1;

  const pages: string[] = [];
  pages.push(
    renderCoverPage(
      prefix,
      documentTitle,
      coverFields,
      coverSections,
      coverPhotos,
      renderPdfStandardPageFooter({
        prefix,
        projectNo,
        generatedAt,
        pageNum: 1,
        totalPages,
      }),
      drawings,
      noPhotosMessage,
      false,
      coverPhotoSlotCount
    )
  );

  if (!photos.length) {
    pages.push(
      renderNoPhotosPage(
        prefix,
        noPhotosMessage,
        renderPdfStandardPageFooter({
          prefix,
          projectNo,
          generatedAt,
          pageNum: 2,
          totalPages,
        })
      )
    );
  } else if (continuationPages.length > 0) {
    pages.push(
      renderPhotoContinuationPagesHtml(
        prefix,
        continuationPages,
        projectNo,
        generatedAt,
        2,
        totalPages,
        continuationStartIndex
      )
    );
  }

  return pages.join("");
}

export function buildPracticalPdfStyles(prefix: string): string {
  return buildPdfPhotoGridStyles(prefix, PAGE_MARGIN_MM);
}

export function renderPracticalPdfHtml(opts: PracticalPdfLayoutOptions): string {
  const { pageTitle } = opts;
  const styles = buildPracticalPdfStyles(opts.prefix);
  const body = renderAllPages(opts);
  return wrapPdfHtmlDocument(pageTitle, styles, body);
}
