import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PDF_PHOTOS_PER_PAGE,
  countPdfPhotoLayoutPages,
  formatPdfFooterDateTime,
  renderPdfCoverHeader,
  renderPdfPageNumberFooter,
  renderPdfStandardPageFooter,
  resolveCoverPhotoCapacity,
  slicePdfPhotosForPages,
  wrapPdfHtmlDocument,
} from "../src/business/pdf/pdf-base-template.js";

describe("pdf-base-template 共通部品", () => {
  it("写真グリッド定数は 2列×3段=6枚", () => {
    assert.equal(PDF_PHOTOS_PER_PAGE, 6);
  });

  it("formatPdfFooterDateTime は ISO を YYYY/MM/DD HH:mm に整形", () => {
    assert.equal(
      formatPdfFooterDateTime("2026-06-13T12:00:00+09:00"),
      "2026/06/13 12:00"
    );
  });

  it("renderPdfStandardPageFooter は案件番号・日時・ページ番号を含む", () => {
    const html = renderPdfStandardPageFooter({
      prefix: "sp",
      projectNo: "PRJ-001",
      generatedAt: "2026-06-13T12:00:00+09:00",
      pageNum: 2,
      totalPages: 3,
    });
    assert.match(html, /PRJ-001/);
    assert.match(html, /2026\/06\/13 12:00/);
    assert.match(html, /Page 2 \/ 3/);
    assert.match(html, /sp-page-footer/);
  });

  it("renderPdfPageNumberFooter は見積・請求 v2 用ページ番号", () => {
    const html = renderPdfPageNumberFooter(1, 2);
    assert.match(html, /Page 1 \/ 2/);
    assert.match(html, /toms-v2-page-num/);
  });

  it("renderPdfCoverHeader は株式会社TOMS と帳票タイトルを含む", () => {
    const html = renderPdfCoverHeader("sp", "仕様書");
    assert.match(html, /株式会社TOMS/);
    assert.match(html, /仕様書/);
    assert.match(html, /sp-cover-header/);
  });

  it("wrapPdfHtmlDocument は Noto Sans JP と charset を含む", () => {
    const html = wrapPdfHtmlDocument("テスト", "body{}", "<p>ok</p>");
    assert.match(html, /Noto\+Sans\+JP/);
    assert.match(html, /charset/);
    assert.match(html, /<p>ok<\/p>/);
  });

  it("slicePdfPhotosForPages は表紙上限と継続ページを分割", () => {
    const photos = Array.from({ length: 7 }, (_, i) => `p${i + 1}`);
    const { coverPhotos, continuationPages } = slicePdfPhotosForPages(photos);
    assert.equal(coverPhotos.length, 6);
    assert.equal(continuationPages.length, 1);
    assert.equal(continuationPages[0].length, 1);
  });

  it("resolveCoverPhotoCapacity は図面+複数セクション時に表紙写真0", () => {
    assert.equal(
      resolveCoverPhotoCapacity({ sectionCount: 2, hasDrawings: true }),
      0
    );
    assert.equal(
      resolveCoverPhotoCapacity({ sectionCount: 1, hasDrawings: true }),
      3
    );
    assert.equal(resolveCoverPhotoCapacity({ sectionCount: 0 }), 6);
  });

  it("countPdfPhotoLayoutPages は枚数からページ数を算出", () => {
    assert.equal(countPdfPhotoLayoutPages(6), 1);
    assert.equal(countPdfPhotoLayoutPages(7), 2);
    assert.equal(countPdfPhotoLayoutPages(0), 0);
  });
});
