import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderPracticalPdfHtml } from "../src/estimate/practical-pdf-layout.js";

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

function titleOrder(html: string) {
  const titles: string[] = [];
  const re = /<p class="sp-photo-title"><span class="sp-photo-num">[^<]*<\/span>\s*([^<]*)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) titles.push(m[1].trim());
  return titles;
}

describe("practical-pdf-layout 写真グリッド", () => {
  it("grid-auto-flow: row と aspect-ratio 4/3 を CSS に含む", () => {
    const html = renderSpec(1);
    assert.match(html, /grid-auto-flow:\s*row/);
    assert.match(html, /aspect-ratio:\s*4\s*\/\s*3/);
    assert.doesNotMatch(html, /grid-template-rows/);
    assert.doesNotMatch(html, /photo-empty/);
  });

  it("1・3・5・6枚で空き枠を出さず枚数分のセルのみ", () => {
    for (const n of [1, 3, 5, 6]) {
      const html = renderSpec(n);
      assert.equal(countPhotoCells(html, "sp"), n, `${n}枚: セル数`);
      assert.doesNotMatch(html, /photo-empty/, `${n}枚: 空き枠なし`);
    }
  });

  it("写真は左上から右→次行左の順（①② / ③④ / ⑤⑥）", () => {
    const html = renderSpec(6);
    assert.deepEqual(titleOrder(html), ["写真1", "写真2", "写真3", "写真4", "写真5", "写真6"]);
  });

  it("5枚は ①② / ③④ / ⑤ の並び（3行目左1枚のみ）", () => {
    const html = renderSpec(5);
    assert.deepEqual(titleOrder(html), ["写真1", "写真2", "写真3", "写真4", "写真5"]);
  });
});
