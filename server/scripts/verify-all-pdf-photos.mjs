/**
 * 全帳票 PDF 写真レイアウト実PDF検証
 * 4帳票 × 4枚/6枚/7枚 — ページ数・1/2ページ目写真数・base64・Content-Type
 * Usage: npx tsx scripts/verify-all-pdf-photos.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, "../src");
const outDir = path.join(__dirname, "../data/toms-document-samples");

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

function businessPhotos(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    fileName: `photo${i + 1}.jpg`,
    urlPath: portraitSample,
    caption: `写真${i + 1}`,
  }));
}

const baseSpec = {
  projectNo: "PRJ-2026-0012",
  addressee: "上田様",
  subject: "カメラ工事",
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
  materialsUsed: "・防犯カメラ × 4",
  notes: "顧客立会いのもと完了確認済み",
};

const baseProject = {
  id: "p-verify",
  projectNo: "PRJ-2026-0012",
  customerId: "c1",
  customerName: "上田",
  title: "カメラ工事",
  address: "兵庫県神戸市",
  phone: "",
  status: "estimate_created",
  surveySchedule: null,
  surveyMemo: "",
  surveyPhotos: [],
  estimateId: "e1",
  constructionSchedule: null,
  requiredMaterials: "",
  constructionMemo: "",
  constructionPhotos: [],
  completionReportId: null,
  invoiceId: "i1",
  paymentDueDate: null,
  paidDate: null,
  qnapBasePath: "",
  surveyProjectId: null,
  createdAt: "2026-06-13T00:00:00.000Z",
  updatedAt: "2026-06-13T17:00:00.000Z",
};

const baseEstimate = {
  id: "e1",
  projectId: "p-verify",
  estimateNo: "260613-001",
  title: "カメラ工事",
  customerName: "上田様",
  items: [
    { id: "1", category: "other", name: "カメラ設置", unit: "式", quantity: 1, unitPrice: 50000, amount: 50000 },
  ],
  lineSubtotal: 50000,
  shuseiDiscount: 0,
  shuseiDiscountMemo: "",
  subtotal: 50000,
  tax: 5000,
  total: 55000,
  header: {
    addressee: "上田様",
    subject: "カメラ工事",
    issueDate: "2026/06/13",
    estimateNo: "260613-001",
    staffName: "山中 智紀",
    workLocation: "兵庫県神戸市",
  },
  createdAt: "2026-06-13T00:00:00.000Z",
  updatedAt: "2026-06-13T17:00:00.000Z",
};

const baseInvoice = {
  id: "i1",
  projectId: "p-verify",
  invoiceNo: "260613-002",
  title: "カメラ工事",
  customerName: "上田様",
  items: baseEstimate.items,
  subtotal: 50000,
  tax: 5000,
  total: 55000,
  bankInfo: "常陽銀行 越谷支店\n普通 1370414\nトムズ",
  createdAt: "2026-06-13T00:00:00.000Z",
  updatedAt: "2026-06-13T17:00:00.000Z",
};

const { renderSpecificationHtml } = await import(
  pathToFileURL(path.join(srcRoot, "estimate/specification-template.ts")).href
);
const { renderPracticalCompletionReportHtml } = await import(
  pathToFileURL(path.join(srcRoot, "estimate/practical-completion-report-template.ts")).href
);
const { renderEstimateHtml } = await import(
  pathToFileURL(path.join(srcRoot, "business/pdf/estimate-template.ts")).href
);
const { renderInvoiceHtml } = await import(
  pathToFileURL(path.join(srcRoot, "business/pdf/invoice-template.ts")).href
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
const { buildProjectPdfFileName } = await import(
  pathToFileURL(path.join(srcRoot, "projects/project-pdf-store.ts")).href
);

function renderHtml(docType, photoCount) {
  switch (docType) {
    case "estimate": {
      const project = { ...baseProject, surveyPhotos: businessPhotos(photoCount) };
      return renderEstimateHtml(project, baseEstimate);
    }
    case "invoice": {
      const project = { ...baseProject, surveyPhotos: businessPhotos(photoCount) };
      return renderInvoiceHtml(project, baseInvoice, baseEstimate);
    }
    case "specification":
      return renderSpecificationHtml({ ...baseSpec, photos: mixedPhotos(photoCount) });
    case "completion-report":
      return renderPracticalCompletionReportHtml({ ...baseCr, photos: mixedPhotos(photoCount) });
    default:
      throw new Error(`unknown docType: ${docType}`);
  }
}

function prefixFor(docType) {
  if (docType === "estimate") return "est";
  if (docType === "invoice") return "inv";
  if (docType === "specification") return "sp";
  return "cr";
}

function docLabel(docType) {
  const labels = {
    estimate: "見積書",
    invoice: "請求書",
    specification: "仕様書",
    "completion-report": "完了報告書",
  };
  return labels[docType] ?? docType;
}

function fileKind(docType) {
  const kinds = {
    estimate: "estimate",
    invoice: "invoice",
    specification: "specification",
    "completion-report": "report",
  };
  return kinds[docType] ?? docType;
}

async function analyzeHtmlLayout(page, html, prefix) {
  await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.evaluateHandle("document.fonts.ready");
  return page.evaluate((pfx) => {
    const countOnPage = (pageEl) => {
      if (!pageEl) return { cells: 0, visible: 0, allBase64: true };
      const cells = [...pageEl.querySelectorAll(`.${pfx}-photo-cell`)];
      const pageRect = pageEl.getBoundingClientRect();
      let visible = 0;
      let allBase64 = cells.length > 0;
      for (const c of cells) {
        const img = c.querySelector("img");
        const wrap = c.querySelector(`.${pfx}-photo-img-wrap`);
        const r = wrap?.getBoundingClientRect();
        const hasBase64 = !!img?.src?.startsWith("data:");
        if (!hasBase64) allBase64 = false;
        if (
          hasBase64 &&
          r &&
          r.width > 10 &&
          r.height > 10 &&
          r.bottom <= pageRect.bottom + 2
        ) {
          visible += 1;
        }
      }
      return { cells: cells.length, visible, allBase64: cells.length ? allBase64 : true };
    };

    const cover = document.querySelector(`.${pfx}-cover-page`);
    const photoPages = [...document.querySelectorAll(`.${pfx}-photo-page`)];
    const page1 = cover ?? photoPages[0] ?? null;
    const page2 = cover ? (photoPages[0] ?? null) : (photoPages[1] ?? null);

    const p1 = countOnPage(page1);
    const p2 = countOnPage(page2);

    return {
      page1Photos: p1.cells,
      page1Visible: p1.visible,
      page2Photos: p2.cells,
      allBase64: p1.allBase64 && p2.allBase64,
    };
  }, prefix);
}

async function verifyCase(page, docType, photoCount) {
  const prefix = prefixFor(docType);
  const html = renderHtml(docType, photoCount);
  const embedded = embedPdfImagesInHtml(html);
  const pdfBuf = await htmlToPdfBuffer(embedded);
  if (!pdfBuf) throw new Error(`PDF generation failed: ${docType} ${photoCount}枚`);

  const analysis = analyzePdfBuffer(pdfBuf);
  const layout = await analyzeHtmlLayout(page, embedded, prefix);

  const isBusinessDoc = docType === "estimate" || docType === "invoice";
  const expectedPage1 = isBusinessDoc ? 0 : Math.min(photoCount, 6);
  const expectedPage2 = isBusinessDoc ? 0 : Math.max(0, photoCount - 6);
  const expectedPdfPages = isBusinessDoc ? 1 : expectedPage2 > 0 ? 2 : 1;

  const pdfFileName = buildProjectPdfFileName(fileKind(docType), "上田", "カメラ工事");
  fs.mkdirSync(outDir, { recursive: true });
  const outName = `${docType}-${photoCount}photos.pdf`;
  fs.writeFileSync(path.join(outDir, outName), pdfBuf);

  const missingImages = isBusinessDoc
    ? false
    : !layout.allBase64 || layout.page1Visible < expectedPage1;
  const pass = isBusinessDoc
    ? layout.page1Photos === 0 &&
      layout.page2Photos === 0 &&
      analysis.valid &&
      analysis.pageCount === expectedPdfPages
    : layout.page1Photos === expectedPage1 &&
      layout.page1Visible === expectedPage1 &&
      layout.page2Photos === expectedPage2 &&
      analysis.valid &&
      analysis.pageCount === expectedPdfPages &&
      !missingImages;

  return {
    docType: docLabel(docType),
    photoCount,
    pdfFileName,
    pdfSizeBytes: pdfBuf.length,
    pdfPages: analysis.pageCount,
    page1Photos: layout.page1Photos,
    page2Photos: layout.page2Photos,
    contentType: "application/pdf",
    missingImages,
    pass,
    outName,
  };
}

const docTypes = ["estimate", "invoice", "specification", "completion-report"];
const counts = [4, 6, 7];

const puppeteer = (await import("puppeteer")).default;
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();

const results = [];
for (const docType of docTypes) {
  for (const count of counts) {
    results.push(await verifyCase(page, docType, count));
  }
}
await browser.close();

console.log("\n| 帳票 | 枚数 | PDFサイズ | 総ページ | 1ページ目 | 2ページ目 | 画像欠け | Content-Type | PASS |");
console.log("|------|------|-----------|----------|-----------|-----------|----------|--------------|------|");
for (const r of results) {
  console.log(
    `| ${r.docType} | ${r.photoCount} | ${r.pdfSizeBytes} | ${r.pdfPages} | ${r.page1Photos} | ${r.page2Photos} | ${r.missingImages ? "あり" : "なし"} | ${r.contentType} | ${r.pass ? "OK" : "NG"} |`
  );
}

const allPass = results.every((r) => r.pass);
console.log(`\nAll pass: ${allPass}`);
process.exit(allPass ? 0 : 1);
