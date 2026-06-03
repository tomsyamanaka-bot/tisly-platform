export interface PdfRenderOptions {
  format?: "A4" | "Letter";
  printBackground?: boolean;
  margin?: { top?: string; right?: string; bottom?: string; left?: string };
  preferPuppeteer?: boolean;
}

export function isPdfPuppeteerEnabled(): boolean {
  return process.env.TISLY_PDF_PUPPETEER === "true";
}

export const DEFAULT_PDF_OPTIONS: PdfRenderOptions = {
  format: "A4",
  printBackground: true,
  margin: { top: "12mm", right: "10mm", bottom: "12mm", left: "10mm" },
  preferPuppeteer: isPdfPuppeteerEnabled(),
};
