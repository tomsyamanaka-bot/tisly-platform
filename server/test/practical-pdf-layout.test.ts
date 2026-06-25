import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FIRST_PAGE_PHOTOS_MAX,
  renderPracticalPdfHtml,
} from "../src/estimate/practical-pdf-layout.js";

function photos(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    url: `/photo-${i + 1}.jpg`,
    title: `写真${i + 1}`,
  }));
}

function renderSpec(count: number) {
  return renderPracticalPdfHtml({
    prefix: "sp",
    pageTitle: "仕様書テスト",
    documentTitle: "仕様書",
    projectNo: "PRJ-TEST",
    generatedAt: "2026-06-13T12:00:00+09:00",
    coverFields: [{ label: "件名", value: "テスト" }],
    photos: photos(count),
  });
}

function countPhotoCells(html: string, prefix: "sp" | "cr") {
  return (html.match(new RegExp(`class="${prefix}-photo-cell(?:\\s|")`, "g")) || []).length;
}

function countCoverPhotoCells(html: string, prefix: "sp" | "cr") {
  const coverRe = new RegExp(
    `class="${prefix}-page ${prefix}-cover-page"[\\s\\S]*?(?=class="${prefix}-page |$)`
  );
  const cover = html.match(coverRe)?.[0] ?? "";
  return (cover.match(new RegExp(`class="${prefix}-photo-cell(?:\\s|")`, "g")) || []).length;
}

function countContinuationPhotoPages(html: string, prefix: "sp" | "cr") {
  return (html.match(new RegExp(`class="${prefix}-page ${prefix}-photo-page"`, "g")) || []).length;
}

function titleOrder(html: string) {
  const titles: string[] = [];
  const re = /<p class="sp-photo-title"><span class="sp-photo-num">[^<]*<\/span>\s*([^<]*)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) titles.push(m[1].trim());
  return titles;
}

function coverPageHtml(html: string, prefix: "sp" | "cr") {
  const coverRe = new RegExp(
    `class="${prefix}-page ${prefix}-cover-page"[\\s\\S]*?(?=class="${prefix}-page |$)`
  );
  return html.match(coverRe)?.[0] ?? "";
}

describe("practical-pdf-layout 写真グリッド", () => {
  it("grid-auto-flow: row と object-fit: cover を CSS に含む", () => {
    const html = renderSpec(1);
    assert.match(html, /grid-auto-flow:\s*row/);
    assert.match(html, /object-fit:\s*cover/);
    assert.match(html, /sp-cover-photo-grid[\s\S]*grid-template-rows:\s*repeat\(3,\s*1fr\)/);
    assert.match(html, /sp-photo-cell-empty/);
  });

  it("1〜5枚でも表紙は常に6枠（空き枠あり）", () => {
    for (const n of [1, 3, 5]) {
      const html = renderSpec(n);
      assert.equal(countCoverPhotoCells(html, "sp"), 6, `${n}枚: 表紙セル数`);
      assert.equal(countPhotoCells(html, "sp"), 6, `${n}枚: 総セル数`);
      const emptyCount = (coverPageHtml(html, "sp").match(/sp-photo-cell-empty/g) || []).length;
      assert.equal(emptyCount, 6 - n, `${n}枚: 空枠数`);
    }
  });

  it("写真4枚は1ページ目（表紙）に6枠固定・2枚空き", () => {
    const html = renderSpec(4);
    assert.equal(countCoverPhotoCells(html, "sp"), 6);
    assert.equal(countContinuationPhotoPages(html, "sp"), 0);
    assert.match(html, /Page 1 \/ 1/);
    assert.match(html, /sp-cover-photo-grid/);
  });

  it("写真5枚は1ページ目（表紙）に6枠固定・1枚空き", () => {
    const html = renderSpec(5);
    assert.equal(countCoverPhotoCells(html, "sp"), 6);
    assert.equal(countContinuationPhotoPages(html, "sp"), 0);
    assert.match(html, /Page 1 \/ 1/);
  });

  it("写真6枚は1ページ目（表紙）に6枠・空枠なし", () => {
    const html = renderSpec(6);
    assert.equal(countCoverPhotoCells(html, "sp"), 6);
    assert.equal(countContinuationPhotoPages(html, "sp"), 0);
    assert.match(html, /Page 1 \/ 1/);
    assert.doesNotMatch(coverPageHtml(html, "sp"), /sp-photo-cell-empty/);
  });

  it("7枚目以降だけ2ページ目（写真専用ページ）へ", () => {
    const html = renderSpec(7);
    assert.equal(FIRST_PAGE_PHOTOS_MAX, 6);
    assert.equal(countCoverPhotoCells(html, "sp"), 6);
    assert.equal(countContinuationPhotoPages(html, "sp"), 1);
    assert.equal(countPhotoCells(html, "sp"), 12);
    assert.match(html, /Page 1 \/ 2/);
    assert.match(html, /Page 2 \/ 2/);
    assert.deepEqual(titleOrder(html), [
      "写真1",
      "写真2",
      "写真3",
      "写真4",
      "写真5",
      "写真6",
      "写真7",
    ]);
  });

  it("写真は左上から右→次行左の順（①② / ③④ / ⑤⑥）", () => {
    const html = renderSpec(6);
    assert.deepEqual(titleOrder(html), ["写真1", "写真2", "写真3", "写真4", "写真5", "写真6"]);
  });

  it("5枚は ①② / ③④ / ⑤ の並び（3行目右は空枠）", () => {
    const html = renderSpec(5);
    assert.deepEqual(titleOrder(html), ["写真1", "写真2", "写真3", "写真4", "写真5"]);
    const cover = coverPageHtml(html, "sp");
    assert.equal((cover.match(/sp-photo-cell-empty/g) || []).length, 1);
  });

  it("表紙の写真グリッドは基本情報の直後に配置される", () => {
    const html = renderSpec(2);
    const cover = coverPageHtml(html, "sp");
    const fieldsPos = cover.indexOf("sp-cover-fields");
    const gridPos = cover.indexOf("sp-cover-photo-grid");
    assert.ok(fieldsPos >= 0 && gridPos > fieldsPos, "写真は基本情報テーブルの下");
  });

  it("完了報告書も仕様書と同じ6枠固定（cr prefix）", () => {
    for (const n of [1, 3, 5, 6]) {
      const html = renderPracticalPdfHtml({
        prefix: "cr",
        pageTitle: "完了報告書テスト",
        documentTitle: "工事完了報告書",
        projectNo: "PRJ-TEST",
        generatedAt: "2026-06-13T12:00:00+09:00",
        coverFields: [{ label: "件名", value: "テスト" }],
        photos: photos(n),
      });
      assert.equal(countCoverPhotoCells(html, "cr"), 6, `${n}枚: 表紙セル数`);
      assert.match(html, /cr-cover-photo-grid/);
      assert.match(html, /grid-template-rows:\s*repeat\(3,\s*1fr\)/);
    }
  });

  it("図面+複数セクション時は表紙写真を0にし継続ページへ（型崩れ防止）", () => {
    const html = renderPracticalPdfHtml({
      prefix: "sp",
      pageTitle: "仕様書テスト",
      documentTitle: "仕様書",
      projectNo: "PRJ-TEST",
      generatedAt: "2026-06-13T12:00:00+09:00",
      coverFields: [{ label: "件名", value: "テスト" }],
      coverSections: [
        { title: "工事内容", body: "防犯カメラ設置" },
        { title: "設備一覧", body: "カメラ4台" },
      ],
      drawings: [{ url: "/drawing.jpg", title: "現調図面" }],
      photos: photos(4),
    });
    const cover = coverPageHtml(html, "sp");
    assert.doesNotMatch(cover, /sp-cover-photo-grid/);
    assert.equal(countContinuationPhotoPages(html, "sp"), 1);
    assert.equal(countPhotoCells(html, "sp"), 6);
    assert.match(html, /Page 1 \/ 2/);
    assert.match(html, /Page 2 \/ 2/);
  });
});
