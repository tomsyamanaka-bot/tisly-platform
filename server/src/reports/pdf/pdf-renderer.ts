import type { PdfRenderOptions } from "./pdf-options.js";
import { DEFAULT_PDF_OPTIONS } from "./pdf-options.js";
import { wrapReportHtml } from "./html-template.js";

export interface PdfRenderResult {
  format: "pdf" | "html";
  buffer: Buffer;
  engine: "puppeteer" | "html-placeholder";
  pdfTodo?: string;
}

async function tryPuppeteer(html: string, options: PdfRenderOptions): Promise<Buffer | null> {
  if (!options.preferPuppeteer) return null;
  try {
    // Optional dependency — install puppeteer for real PDF output
    const mod = await import("puppeteer" as string);
    const browser = await mod.default.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      const pdf = await page.pdf({
        format: options.format ?? "A4",
        printBackground: options.printBackground ?? true,
        margin: options.margin,
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  } catch {
    return null;
  }
}

export async function renderReportPdf(
  html: string,
  title: string,
  options: PdfRenderOptions = {}
): Promise<PdfRenderResult> {
  const opts = { ...DEFAULT_PDF_OPTIONS, ...options };
  const wrapped = wrapReportHtml(html, title);

  const pdfBuf = await tryPuppeteer(wrapped, opts);
  if (pdfBuf) {
    return { format: "pdf", buffer: pdfBuf, engine: "puppeteer" };
  }

  return {
    format: "html",
    buffer: Buffer.from(wrapped, "utf-8"),
    engine: "html-placeholder",
    pdfTodo: "Install puppeteer and set TISLY_PDF_PUPPETEER=true for PDF output",
  };
}
