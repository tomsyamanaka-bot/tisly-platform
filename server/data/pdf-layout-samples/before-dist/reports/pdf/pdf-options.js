export function isPdfPuppeteerEnabled() {
    return process.env.TISLY_PDF_PUPPETEER === "true";
}
export const DEFAULT_PDF_OPTIONS = {
    format: "A4",
    printBackground: true,
    margin: { top: "12mm", right: "10mm", bottom: "12mm", left: "10mm" },
    preferPuppeteer: isPdfPuppeteerEnabled(),
};
