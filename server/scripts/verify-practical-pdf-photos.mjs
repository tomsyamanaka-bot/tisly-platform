/**
 * 実PDFで表紙（1ページ目）の写真枚数を検証
 * Usage: npx tsx scripts/verify-practical-pdf-photos.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, "../src");

const portraitSample =
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1600"><rect fill="#4ade80" width="100%" height="100%"/><text x="50%" y="50%" text-anchor="middle" font-size="72" fill="#166534">PHOTO</text></svg>`
  ).toString("base64");

function mixedPhotos(count) {
  return Array.from({ length: count }, (_, i) => ({
    url: portraitSample,
    title: `写真${i + 1}`,
  }));
}

const baseSpec = {
  projectNo: "PRJ-2026-0012",
  addressee: "株式会社サンプル 御中",
  subject: "防犯カメラ・LAN配線工事",
  siteName: "本社ビル1F",
  workLocation: "兵庫県神戸市中央区〇〇町1-2-3",
  issueDate: "2026/06/13",
  staffName: "山中 智紀",
  generatedAt: "2026-06-13T17:00:00+09:00",
};

const baseCr = {
  ...baseSpec,
  workDate: "2026/06/13",
  workContent: "防犯カメラ / LAN 設置・配線・動作確認",
  materialsUsed: "・防犯カメラ × 4\n・LANケーブル × 120m",
  notes: "顧客立会いのもと完了確認済み",
};

const { renderSpecificationHtml } = await import(
  pathToFileURL(path.join(srcRoot, "estimate/specification-template.ts")).href
);
const { renderPracticalCompletionReportHtml } = await import(
  pathToFileURL(path.join(srcRoot, "estimate/practical-completion-report-template.ts")).href
);
const { embedPdfImagesInHtml } = await import(
  pathToFileURL(path.join(srcRoot, "business/pdf/pdf-image-embed.ts")).href
);
const { htmlToPdfBuffer } = await import(
  pathToFileURL(path.join(srcRoot, "business/pdf/render.ts")).href
);
const { analyzePdfBuffer } = await import(
  pathToFileURL(path.join(srcRoot, "business/pdf/pdf-validation.ts")).href
);

async function analyzeHtmlLayout(page, html, prefix) {
  await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.evaluateHandle("document.fonts.ready");
  return page.evaluate((pfx) => {
    const cover = document.querySelector(`.${pfx}-cover-page`);
    if (!cover) return { error: "cover not found" };
    const coverRect = cover.getBoundingClientRect();
    const cells = [...cover.querySelectorAll(`.${pfx}-photo-cell`)];
    const footer = cover.querySelector(`.${pfx}-page-footer`);
    const footerRect = footer?.getBoundingClientRect();
    const cellInfo = cells.map((c, i) => {
      const wrap = c.querySelector(`.${pfx}-photo-img-wrap`);
      const img = c.querySelector("img");
      const r = wrap?.getBoundingClientRect();
      const imgVisible =
        !!img?.src &&
        img.src.startsWith("data:") &&
        r &&
        r.width > 10 &&
        r.height > 10 &&
        r.bottom <= coverRect.bottom + 2;
      return {
        index: i + 1,
        imgW: r ? Math.round(r.width) : 0,
        imgH: r ? Math.round(r.height) : 0,
        hasBase64: !!img?.src?.startsWith("data:"),
        visibleOnCover: imgVisible,
      };
    });
    const visibleCount = cellInfo.filter((c) => c.visibleOnCover).length;
    const grid = cover.querySelector(`.${pfx}-cover-photo-grid`);
    const gridRect = grid?.getBoundingClientRect();
    const fields = cover.querySelector(`.${pfx}-cover-fields`);
    const fieldsRect = fields?.getBoundingClientRect();
    return {
      coverHeightPx: Math.round(coverRect.height),
      fieldsBottomPx: fieldsRect ? Math.round(fieldsRect.bottom - coverRect.top) : null,
      gridTopPx: gridRect ? Math.round(gridRect.top - coverRect.top) : null,
      gridBottomPx: gridRect ? Math.round(gridRect.bottom - coverRect.top) : null,
      footerTopPx: footerRect ? Math.round(footerRect.top - coverRect.top) : null,
      totalCells: cells.length,
      visibleOnCover: visibleCount,
      cells: cellInfo,
      overflow: gridRect && footerRect ? gridRect.bottom > footerRect.top + 1 : false,
    };
  }, prefix);
}

async function verifyCase(page, docType, photoCount) {
  const isSpec = docType === "specification";
  const prefix = isSpec ? "sp" : "cr";
  const html = isSpec
    ? renderSpecificationHtml({ ...baseSpec, photos: mixedPhotos(photoCount) })
    : renderPracticalCompletionReportHtml({ ...baseCr, photos: mixedPhotos(photoCount) });
  const embedded = embedPdfImagesInHtml(html);
  const pdfBuf = await htmlToPdfBuffer(embedded);
  if (!pdfBuf) throw new Error("PDF generation failed");
  const analysis = analyzePdfBuffer(pdfBuf);
  const layout = await analyzeHtmlLayout(page, embedded, prefix);

  const expectedCover = Math.min(photoCount, 6);
  const expectedPage2 = Math.max(0, photoCount - 6);
  const expectedPages = photoCount === 0 ? 2 : expectedPage2 > 0 ? 2 : 1;

  const outDir = path.join(__dirname, "../data/toms-document-samples");
  fs.mkdirSync(outDir, { recursive: true });
  const fileName = `${isSpec ? "specification" : "completion-report"}-${photoCount}photos.pdf`;
  fs.writeFileSync(path.join(outDir, fileName), pdfBuf);

  return {
    docType: isSpec ? "仕様書" : "完了報告書",
    photoCount,
    coverPhotosInHtml: layout.totalCells,
    coverPhotosVisible: layout.visibleOnCover,
    page2Photos: expectedPage2,
    pdfPages: analysis.pageCount,
    pdfSizeBytes: pdfBuf.length,
    fieldsToGridGapPx: layout.gridTopPx != null && layout.fieldsBottomPx != null
      ? layout.gridTopPx - layout.fieldsBottomPx
      : null,
    gridOverflowsFooter: layout.overflow,
    allBase64: layout.cells?.every((c) => c.hasBase64) ?? false,
    pass:
      layout.totalCells === expectedCover &&
      layout.visibleOnCover === expectedCover &&
      analysis.pageCount === expectedPages &&
      !layout.overflow &&
      (layout.cells?.every((c) => c.hasBase64 && c.visibleOnCover) ?? false),
    fileName,
  };
}

const cases = [
  ["specification", 4],
  ["specification", 5],
  ["specification", 6],
  ["specification", 7],
  ["completion-report", 4],
  ["completion-report", 5],
  ["completion-report", 6],
  ["completion-report", 7],
];

const puppeteer = (await import("puppeteer")).default;
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();

const results = [];
for (const [type, count] of cases) {
  const r = await verifyCase(page, type, count);
  results.push(r);
  console.log(JSON.stringify(r));
}

await browser.close();

const allPass = results.every((r) => r.pass);
console.log("\n=== SUMMARY ===");
console.log(`All pass: ${allPass}`);
process.exit(allPass ? 0 : 1);
