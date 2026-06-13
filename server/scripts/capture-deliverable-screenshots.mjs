/**
 * 提出用スクショ: 見積入力UI + 見積/請求/完了報告 HTML(PDF)
 * Usage: npm run build && node scripts/capture-deliverable-screenshots.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "data/pdf-verify");
const publicDir = path.join(root, "public");
fs.mkdirSync(outDir, { recursive: true });

const iphone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const sampleLines = [
  { name: "防犯カメラ", memo: "LAN配線工事", qty: 2, price: 45000 },
  { name: "工事", memo: "作業内容", qty: 1, price: 88000 },
];

function extractInlineStyles(htmlPath) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const m = html.match(/<style>([\s\S]*?)<\/style>/);
  return m ? m[1] : "";
}

function buildEstimateInputHtml() {
  const inlineCss = extractInlineStyles(path.join(publicDir, "estimate-v1.html"));
  const cards = sampleLines
    .map(
      (l) => `<div class="line-item-card line-card" data-idx="0">
      <label class="friendly-label line-field-label">項目名</label>
      <textarea class="desc-input line-field-input" rows="3">${l.name}\n${l.memo}</textarea>
      <div class="line-metrics-grid">
        <div class="line-metric col-qty">
          <label class="friendly-label line-metric-label">数量</label>
          <input type="number" class="qty-input line-field-input" value="${l.qty}" />
        </div>
        <div class="line-metric col-price">
          <label class="friendly-label line-metric-label">単価</label>
          <input type="number" class="price-input line-field-input" value="${l.price}" />
        </div>
        <div class="line-metric col-amount">
          <span class="line-metric-label">金額</span>
          <div class="line-amount-display">¥${(l.qty * l.price).toLocaleString()}</div>
        </div>
      </div>
    </div>`
    )
    .join("");
  return `<!DOCTYPE html><html lang="ja"><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=390, initial-scale=1"/>
<link rel="stylesheet" href="${pathToFileURL(path.join(publicDir, "css/tisly-friendly-ui.css")).href}"/>
<link rel="stylesheet" href="${pathToFileURL(path.join(publicDir, "css/field-ops-mobile.css")).href}"/>
<style>${inlineCss}</style></head>
<body class="tisly-friendly field-ops-touch" style="padding:0.75rem;background:#f6f8fa">
<p class="section-label">🧾 お見積りの内訳</p>
<div class="friendly-card"><div id="line-list">${cards}</div></div>
</body></html>`;
}

async function generatePdfHtmlFiles() {
  const { renderEstimateHtml } = await import("../dist/business/pdf/estimate-template.js");
  const { renderInvoiceHtml } = await import("../dist/business/pdf/invoice-template.js");
  const { renderPracticalCompletionReportHtml } = await import(
    "../dist/estimate/practical-completion-report-template.js"
  );

  const project = {
    id: "BIZ-SCREEN",
    projectNo: "PRJ-2026-SCR",
    customerId: "c1",
    customerName: "見積テスト顧客",
    title: "防犯カメラ工事",
    address: "茨城県つくば市",
    phone: "029-000-0000",
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
    invoiceId: null,
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
  };

  const estimate = {
    id: "e1",
    projectId: project.id,
    estimateNo: "260613-001",
    customerName: project.customerName,
    title: project.title,
    header: {
      addressee: "見積テスト顧客 御中",
      subject: "防犯カメラ設置工事",
      issueDate: "2026-06-13",
      estimateNo: "260613-001",
      validUntil: "2026-07-13",
      staffName: "山中 智紀",
      workLocation: "つくば市",
      address: "",
      phone: "",
      email: "",
    },
    items: [
      {
        id: "l1",
        category: "material",
        name: "防犯カメラ",
        memo: "LAN配線工事",
        unit: "台",
        quantity: 2,
        unitPrice: 45000,
        amount: 90000,
        orderTarget: false,
      },
      {
        id: "l2",
        category: "labor",
        name: "工事",
        memo: "作業内容",
        unit: "式",
        quantity: 1,
        unitPrice: 88000,
        amount: 88000,
        orderTarget: false,
      },
    ],
    lineSubtotal: 178000,
    shuseiDiscount: 0,
    shuseiDiscountMemo: "",
    subtotal: 178000,
    tax: 17800,
    total: 195800,
    internalCost: 0,
    grossProfit: 178000,
    grossProfitRate: 100,
    pdfPath: null,
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
  };

  const invoice = {
    id: "i1",
    projectId: project.id,
    invoiceNo: "260613-001",
    estimateRefNo: estimate.estimateNo,
    customerName: project.customerName,
    title: project.title,
    items: estimate.items,
    subtotal: estimate.subtotal,
    tax: estimate.tax,
    total: estimate.total,
    invoiceDate: "2026-06-13",
    paymentDueDate: "2026-07-13",
    pdfPath: null,
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
  };

  const completionHtml = renderPracticalCompletionReportHtml({
    projectNo: "PRJ-2026-SCR",
    addressee: "見積テスト顧客 御中",
    subject: "防犯カメラ設置工事",
    siteName: "つくば市",
    workLocation: "つくば市",
    issueDate: "2026-06-13",
    staffName: "山中 智紀",
    startTime: "09:00",
    endTime: "17:00",
    workContent: "防犯カメラ設置・配線工事",
    checklistSummary: "電源確認: OK\n配線確認: OK",
    notes: "",
    photos: [],
  });

  const files = {
    "estimate-live.html": renderEstimateHtml(project, estimate),
    "invoice-live.html": renderInvoiceHtml(project, invoice, estimate),
    "completion-report-live.html": completionHtml,
  };

  for (const [name, html] of Object.entries(files)) {
    fs.writeFileSync(path.join(outDir, name), html, "utf8");
  }
}

const inputHtmlPath = path.join(outDir, "estimate-input-live.html");
fs.writeFileSync(inputHtmlPath, buildEstimateInputHtml(), "utf8");

await generatePdfHtmlFiles();

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();

async function shotHtml(htmlName, pngName, viewport, clipHeight) {
  const htmlPath = path.join(outDir, htmlName);
  await page.setViewport(viewport);
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle0" });
  await page.evaluate(() => document.fonts?.ready);
  const opts = { path: path.join(outDir, pngName), fullPage: !clipHeight };
  if (clipHeight) {
    opts.clip = { x: 0, y: 0, width: viewport.width, height: clipHeight };
  }
  await page.screenshot(opts);
}

await shotHtml("estimate-input-live.html", "deliverable-estimate-input-iphone.png", iphone, 520);
await shotHtml("estimate-live.html", "deliverable-estimate-pdf-iphone.png", iphone);
await shotHtml("invoice-live.html", "deliverable-invoice-pdf-iphone.png", iphone);
await shotHtml("completion-report-live.html", "deliverable-completion-pdf-iphone.png", iphone);

await browser.close();
console.log("Deliverable screenshots written to", outDir);
