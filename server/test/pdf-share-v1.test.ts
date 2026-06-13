import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { htmlToPdfBuffer } from "../src/business/pdf/render.js";
import { PDF_MIN_BYTES } from "../src/business/pdf/pdf-validation.js";

describe("Web Share API 用 PDF File 生成", () => {
  it("fetchPdfBlob 相当: Blob→File が application/pdf になる", async () => {
    if (process.env.TISLY_PDF_PUPPETEER === "false") return;
    const js = fs.readFileSync("public/js/pdf-share-v1.js", "utf8");
    assert.ok(js.includes("navigator.share({ files: [file]"));
    assert.ok(js.includes("blob.size >= 1000"));

    const html = `<!DOCTYPE html><html><body><p>share test</p></body></html>`;
    const buf = await htmlToPdfBuffer(html);
    assert.ok(buf && buf.length >= PDF_MIN_BYTES);
    const blob = new Blob([buf!], { type: "application/pdf" });
    assert.equal(blob.type, "application/pdf");
    assert.ok(blob.size >= PDF_MIN_BYTES);
  });
});
