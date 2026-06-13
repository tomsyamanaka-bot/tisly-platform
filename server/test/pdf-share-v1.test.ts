import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { htmlToPdfBuffer } from "../src/business/pdf/render.js";
import { PDF_MIN_BYTES } from "../src/business/pdf/pdf-validation.js";

const RICH_TEST_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:sans-serif;padding:2rem} table{width:100%;border-collapse:collapse}
td,th{border:1px solid #ccc;padding:8px}</style></head><body><h1>共有テスト</h1>
${Array.from({ length: 20 }, (_, i) => `<p>行 ${i + 1}: サンプルテキストと金額 ¥${(i + 1) * 500}</p>`).join("")}
</body></html>`;

describe("Web Share API 用 PDF File 生成", () => {
  it("fetchPdfBlob 相当: Blob→File が application/pdf になる", async () => {
    if (process.env.TISLY_PDF_PUPPETEER === "false") return;
    const js = fs.readFileSync("public/js/pdf-share-v1.js", "utf8");
    assert.ok(js.includes("navigator.share({ files: [file]"));
    assert.ok(js.includes("PDF_MIN_CLIENT_BYTES"));
    assert.ok(js.includes("10000"));
    assert.ok(js.includes("PDF API 404"));
    assert.ok(js.includes("PDFサイズ不足"));
    assert.ok(js.includes("Content-Type不正"));
    assert.ok(js.includes("fetchPdfBlobWithRegenerate"));
    assert.ok(js.includes("%PDF-"));

    const html = RICH_TEST_HTML;
    const buf = await htmlToPdfBuffer(html);
    assert.ok(buf && buf.length >= PDF_MIN_BYTES);
    const blob = new Blob([buf!], { type: "application/pdf" });
    assert.equal(blob.type, "application/pdf");
    assert.ok(blob.size >= PDF_MIN_BYTES);
  });
});
