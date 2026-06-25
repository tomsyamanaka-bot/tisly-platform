import type { BusinessPhoto } from "../business-types.js";
import {
  renderPdfStandardPageFooter,
  slicePdfPhotosForPages,
  PDF_PHOTOS_PER_PAGE,
} from "./pdf-base-template.js";
import {
  buildPracticalPdfStyles,
  countPhotoLayoutPages,
  renderPhotoContinuationPagesHtml,
  renderPhotoGridHtml,
  type PracticalPdfPhoto,
} from "../../estimate/practical-pdf-layout.js";

export type TomsDocPhotoPrefix = "est" | "inv";

export function businessPhotosToPdfPhotos(photos: BusinessPhoto[]): PracticalPdfPhoto[] {
  return photos.slice(0, 60).map((p, i) => ({
    url: p.urlPath,
    title: (p.caption || p.fileName || `写真${i + 1}`).trim(),
  }));
}

export interface TomsDocPhotoLayoutInput {
  prefix: TomsDocPhotoPrefix;
  photos: BusinessPhoto[];
  projectNo: string;
  generatedAt: string;
  /** 1ページ目：帳票ヘッダー（御見積金額/ご請求金額バナーまで） */
  coverHeaderHtml: string;
  /** 写真ページの次：明細・合計・備考など */
  documentBodyHtml: string;
}

/** @deprecated 見積・請求では使用禁止。仕様書・完了報告書は practical-pdf-layout を直接使用 */
export function renderTomsDocWithPhotoLayout(input: TomsDocPhotoLayoutInput): {
  photoPageStyles: string;
  bodyHtml: string;
} {
  const { prefix, photos, projectNo, generatedAt, coverHeaderHtml, documentBodyHtml } = input;
  const pdfPhotos = businessPhotosToPdfPhotos(photos);
  const { coverPhotos, continuationPages } = slicePdfPhotosForPages(
    pdfPhotos,
    PDF_PHOTOS_PER_PAGE,
    PDF_PHOTOS_PER_PAGE
  );
  const photoPageCount = countPhotoLayoutPages(pdfPhotos.length);
  const totalPages = photoPageCount + 1;

  const coverPhotoGrid = coverPhotos.length
    ? renderPhotoGridHtml(prefix, coverPhotos, 1, `${prefix}-cover-photo-grid`, PDF_PHOTOS_PER_PAGE)
    : "";

  const page1 = `<div class="${prefix}-page ${prefix}-cover-page">
  <div class="${prefix}-doc-header-compact">${coverHeaderHtml}</div>
  ${coverPhotoGrid}
  ${renderPdfStandardPageFooter({ prefix, projectNo, generatedAt, pageNum: 1, totalPages })}
</div>`;

  const photoContinuation =
    continuationPages.length > 0
      ? renderPhotoContinuationPagesHtml(
          prefix,
          continuationPages,
          projectNo,
          generatedAt,
          2,
          totalPages,
          coverPhotos.length + 1
        )
      : "";

  const docPage = `<div class="doc ${prefix}-doc-body-page">
${documentBodyHtml}
</div>`;

  return {
    photoPageStyles: buildPracticalPdfStyles(prefix),
    bodyHtml: page1 + photoContinuation + docPage,
  };
}
