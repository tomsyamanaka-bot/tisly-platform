import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import {
  analyzePdfBuffer,
  assertValidPdfBuffer,
  isValidPdfBuffer,
  isValidPdfFile,
  PDF_GENERATION_FAILED_MSG,
  PDF_MIN_BYTES,
} from "../src/business/pdf/pdf-validation.js";
import { htmlToPdfBuffer } from "../src/business/pdf/render.js";

describe("PDF実体検証", () => {
  it("0byte・ヘッダ不正は invalid", () => {
    assert.equal(isValidPdfBuffer(Buffer.alloc(0)), false);
    assert.equal(isValidPdfBuffer(Buffer.from("not-a-pdf")), false);
    assert.equal(analyzePdfBuffer(Buffer.alloc(500)).valid, false);
  });

  it("minimal ダミーPDF（旧フォールバック相当）は invalid", () => {
    const stream = "BT /F1 12 Tf 50 750 Td (test) Tj ET";
    const tiny = `%PDF-1.4
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>endobj
4 0 obj<< /Length ${stream.length} >>stream
${stream}
endstream endobj
%%EOF`;
    const buf = Buffer.from(tiny, "utf8");
    assert.ok(buf.length < PDF_MIN_BYTES);
    assert.equal(isValidPdfBuffer(buf), false);
  });

  it("Puppeteer 生成PDFは 1000byte以上・ページ・内容あり", async () => {
    if (process.env.TISLY_PDF_PUPPETEER === "false") {
      return;
    }
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:sans-serif;padding:2rem}</style></head><body><h1>見積テスト</h1><p>税込 ¥11,000</p></body></html>`;
    const buf = await htmlToPdfBuffer(html);
    assert.ok(buf, "puppeteer should produce buffer in test env");
    assert.ok(buf!.length >= PDF_MIN_BYTES, `size=${buf!.length}`);
    const analysis = analyzePdfBuffer(buf);
    assert.equal(analysis.valid, true, JSON.stringify(analysis));
    assert.ok(analysis.pageCount >= 1);
    assert.equal(analysis.hasContent, true);
  });

  it("assertValidPdfBuffer は失敗メッセージを返す", () => {
    assert.throws(
      () => assertValidPdfBuffer(Buffer.from("%PDF-1.4 tiny")),
      (e: Error) => e.message === PDF_GENERATION_FAILED_MSG
    );
  });

  it("isValidPdfFile は実ファイルを検証する", async () => {
    if (process.env.TISLY_PDF_PUPPETEER === "false") return;
    const html = `<!DOCTYPE html><html><body><p>file test</p></body></html>`;
    const buf = await htmlToPdfBuffer(html);
    assert.ok(buf);
    const dir = path.join(process.cwd(), "data", "test-pdf-validation");
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, "sample.pdf");
    fs.writeFileSync(filePath, buf!);
    assert.equal(isValidPdfFile(filePath), true);
    fs.unlinkSync(filePath);
  });
});

describe("Safari想定 PDF GET", () => {
  it("Content-Type application/pdf とサイズ要件", async () => {
    if (process.env.TISLY_PDF_PUPPETEER === "false") return;
    const html = `<!DOCTYPE html><html><body><h1>請求書</h1></body></html>`;
    const buf = await htmlToPdfBuffer(html);
    assert.ok(buf);
    assert.equal(buf!.subarray(0, 5).toString("ascii"), "%PDF-");
    assert.ok(buf!.length >= PDF_MIN_BYTES);
  });
});
