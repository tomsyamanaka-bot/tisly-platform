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
    documentTitle: "システム仕様書",
    projectNo: "PRJ-TEST",
    generatedAt: "2026-06-13T12:00:00+09:00",
    coverFields: [{ label: "件名", value: "テスト" }],
    photos: photos(count),
  });
}

function countPhotoCells(html: string, prefix: "sp" | "cr") {
  return (html.match(new RegExp(`class="${prefix}-photo-cell"`, "g")) || []).length;
}

function countCoverPhotoCells(html: string, prefix: "sp" | "cr") {
  const coverRe = new RegExp(
    `class="${prefix}-page ${prefix}-cover-page"[\\s\\S]*?(?=class="${prefix}-page |$)`
  );
  const cover = html.match(coverRe)?.[0] ?? "";
  return (cover.match(new RegExp(`class="${prefix}-photo-cell"`, "g")) || []).length;
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
  it("grid-auto-flow: row と aspect-ratio 4/3 を CSS に含む", () => {
    const html = renderSpec(1);
    assert.match(html, /grid-auto-flow:\s*row/);
    assert.match(html, /aspect-ratio:\s*4\s*\/\s*3/);
    assert.match(html, /object-fit:\s*cover/);
    assert.doesNotMatch(html, /photo-empty/);
  });

  it("1・3・5・6枚で空き枠を出さず枚数分のセルのみ", () => {
    for (const n of [1, 3, 5, 6]) {
      const html = renderSpec(n);
      assert.equal(countPhotoCells(html, "sp"), n, `${n}枚: セル数`);
      assert.doesNotMatch(html, /photo-empty/, `${n}枚: 空き枠なし`);
    }
  });

  it("写真4枚は1ページ目（表紙）に4枚のみ", () => {
    const html = renderSpec(4);
    assert.equal(countCoverPhotoCells(html, "sp"), 4);
    assert.equal(countContinuationPhotoPages(html, "sp"), 0);
    assert.match(html, /Page 1 \/ 1/);
  });

  it("写真6枚は1ページ目（表紙）に6枚・続きページなし", () => {
    const html = renderSpec(6);
    assert.equal(countCoverPhotoCells(html, "sp"), 6);
    assert.equal(countContinuationPhotoPages(html, "sp"), 0);
    assert.match(html, /Page 1 \/ 1/);
    assert.match(coverPageHtml(html, "sp"), /sp-cover-photo-grid/);
  });

  it("7枚目以降だけ2ページ目（写真専用ページ）へ", () => {
    const html = renderSpec(7);
    assert.equal(FIRST_PAGE_PHOTOS_MAX, 6);
    assert.equal(countCoverPhotoCells(html, "sp"), 6);
    assert.equal(countContinuationPhotoPages(html, "sp"), 1);
    assert.equal(countPhotoCells(html, "sp"), 7);
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

  it("5枚は ①② / ③④ / ⑤ の並び（3行目左1枚のみ）", () => {
    const html = renderSpec(5);
    assert.deepEqual(titleOrder(html), ["写真1", "写真2", "写真3", "写真4", "写真5"]);
  });

  it("表紙の写真グリッドは基本情報の直後に配置される", () => {
    const html = renderSpec(2);
    const cover = coverPageHtml(html, "sp");
    const fieldsPos = cover.indexOf("sp-cover-fields");
    const gridPos = cover.indexOf("sp-cover-photo-grid");
    assert.ok(fieldsPos >= 0 && gridPos > fieldsPos, "写真は基本情報テーブルの下");
  });
});
