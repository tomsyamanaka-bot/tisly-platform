import type { BusinessPhoto } from "../business-types.js";
import { escapeHtml } from "./shared-blocks.js";
import {
  buildPracticalPdfStyles,
  countPhotoLayoutPages,
  renderPhotoContinuationPagesHtml,
  renderPhotoGridHtml,
  slicePhotosForPages,
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

function renderPageFooter(
  prefix: string,
  projectNo: string,
  generatedAt: string,
  pageNum: number,
  totalPages: number
): string {
  const trimmed = (generatedAt ?? "").trim();
  let dt = trimmed;
  const d = new Date(trimmed);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    dt = `${y}/${m}/${day} ${h}:${min}`;
  } else {
    dt = trimmed.replace(/^(\d{4})-(\d{2})-(\d{2})/, "$1/$2/$3");
  }
  return `<div class="${prefix}-page-footer">
    <span class="${prefix}-footer-project">${escapeHtml(projectNo || "—")}</span>
    <span class="${prefix}-footer-datetime">${escapeHtml(dt)}</span>
    <span class="${prefix}-footer-pagenum">Page ${pageNum} / ${totalPages}</span>
  </div>`;
}

/** 見積・請求 — 写真あり版（1ページ目最大6枚・2列×3段） */
export function renderTomsDocWithPhotoLayout(input: TomsDocPhotoLayoutInput): {
  photoPageStyles: string;
  bodyHtml: string;
} {
  const { prefix, photos, projectNo, generatedAt, coverHeaderHtml, documentBodyHtml } = input;
  const pdfPhotos = businessPhotosToPdfPhotos(photos);
  const { coverPhotos, continuationPages } = slicePhotosForPages(pdfPhotos);
  const photoPageCount = countPhotoLayoutPages(pdfPhotos.length);
  const totalPages = photoPageCount + 1;

  const coverPhotoGrid = coverPhotos.length
    ? renderPhotoGridHtml(prefix, coverPhotos, 1, `${prefix}-cover-photo-grid`)
    : "";

  const page1 = `<div class="${prefix}-page ${prefix}-cover-page">
  <div class="${prefix}-doc-header-compact">${coverHeaderHtml}</div>
  ${coverPhotoGrid}
  ${renderPageFooter(prefix, projectNo, generatedAt, 1, totalPages)}
</div>`;

  const photoContinuation =
    continuationPages.length > 0
      ? renderPhotoContinuationPagesHtml(
          prefix,
          continuationPages,
          projectNo,
          generatedAt,
          2,
          totalPages
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
