/**
 * TOMS PDF v2 — 見積・請求 v2 スクショ + iPhone Safari/PWA 検証
 * Usage: npm run build && node scripts/capture-toms-pdf-v2-screenshots.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../data/toms-pdf-v2-screenshots");
fs.mkdirSync(outDir, { recursive: true });

const { renderEstimateHtmlV2 } = await import("../dist/business/pdf/estimate-template-v2.js");
const { renderInvoiceHtmlV2 } = await import("../dist/business/pdf/invoice-template-v2.js");

const project = {
  id: "pdf-v2-sample",
  projectNo: "TOMS-V2-001",
  customerId: "c1",
  customerName: "富塚",
  title: "龍ヶ崎市 防犯カメラ工事",
  address: "茨城県龍ヶ崎市",
  phone: "",
  status: "estimate_created",
  surveySchedule: null,
  surveyMemo: "・納期2週間程度\n・現地確認済み",
  surveyPhotos: [],
  estimateId: "e1",
  constructionSchedule: null,
  requiredMaterials: "",
  constructionMemo: "",
  constructionPhotos: [],
  completionReportId: null,
  invoiceId: "i1",
  paymentDueDate: "2026/07/31",
  paidDate: null,
  qnapBasePath: "",
  surveyProjectId: null,
  createdAt: "",
  updatedAt: "",
};

const items = [
  {
    id: "1",
    category: "other",
    name: "4K 屋外カメラ",
    memo: "TP-LINK Tapo C520WS",
    unit: "台",
    quantity: 2,
    unitPrice: 98000,
    amount: 196000,
  },
  {
    id: "2",
    category: "other",
    name: "配線・設置工事",
    memo: "",
    unit: "式",
    quantity: 1,
    unitPrice: 85000,
    amount: 85000,
  },
  {
    id: "3",
    category: "other",
    name: "PoEハブ",
    memo: "8ポート",
    unit: "台",
    quantity: 1,
    unitPrice: 18000,
    amount: 18000,
  },
];

const estimate = {
  id: "e1",
  projectId: project.id,
  estimateNo: "260614-001",
  customerName: project.customerName,
  title: project.title,
  items,
  shuseiDiscount: 0,
  shuseiDiscountMemo: "",
  lineSubtotal: 299000,
  subtotal: 299000,
  tax: 29900,
  total: 328900,
  internalCost: 0,
  grossProfit: 299000,
  grossProfitRate: 100,
  pdfPath: null,
  createdAt: "2026-06-14T00:00:00.000Z",
  updatedAt: "2026-06-14T00:00:00.000Z",
  header: {
    addressee: "富塚",
    subject: "龍ヶ崎市 防犯カメラ工事",
    issueDate: "2026/06/14",
    estimateNo: "260614-001",
    staffName: "山中 智紀",
    workLocation: project.address,
  },
};

const invoice = {
  id: "i1",
  projectId: project.id,
  invoiceNo: "260614-002",
  customerName: "株式会社 伝元",
  title: "阿見 リフォーム 居酒屋・母屋 エアコン工事",
  items,
  subtotal: 299000,
  tax: 29900,
  total: 328900,
  bankInfo: "常陽銀行 越谷支店\n普通 1370414\nトムズ",
  pdfPath: null,
  createdAt: "2026-06-14T00:00:00.000Z",
  updatedAt: "2026-06-14T00:00:00.000Z",
};

const invoiceProject = { ...project, customerName: "株式会社 伝元", title: invoice.title, address: "阿見町" };

const estimateV2 = renderEstimateHtmlV2(project, estimate, {
  header: estimate.header,
  notes: project.surveyMemo,
});
const invoiceV2 = renderInvoiceHtmlV2(invoiceProject, invoice, estimate, {
  header: {
    addressee: "株式会社 伝元",
    subject: invoice.title,
    invoiceDate: "2026/06/14",
    invoiceNo: invoice.invoiceNo,
    staffName: "山中 智紀",
    workLocation: "阿見町",
    estimateRefNo: estimate.estimateNo,
    bankInfo: invoice.bankInfo,
  },
  notes: project.surveyMemo,
  paymentDueDate: "2026/07/31",
});

for (const [name, html] of [
  ["02-estimate-v2-after", estimateV2],
  ["03-invoice-v2-after", invoiceV2],
]) {
  fs.writeFileSync(path.join(outDir, `${name}.html`), html, "utf8");
}

const browser = await puppeteer.launch({ headless: true });
const report = { generatedAt: new Date().toISOString(), screenshots: [], iphoneChecks: [] };

async function capture(name, html, viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.setContent(html, { waitUntil: "networkidle0" });
  const pngPath = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: pngPath, fullPage: true });
  const pdfPath = path.join(outDir, `${name}.pdf`);
  const pdf = await page.pdf({ format: "A4", printBackground: true });
  fs.writeFileSync(pdfPath, pdf);
  report.screenshots.push({ name, png: pngPath, pdf: pdfPath, viewport });
  await page.close();
  console.log("wrote", name);
}

await capture("02-estimate-v2-after", estimateV2, { width: 900, height: 1200, deviceScaleFactor: 2 });
await capture("03-invoice-v2-after", invoiceV2, { width: 900, height: 1200, deviceScaleFactor: 2 });

const iphoneSafari = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
await capture("04-estimate-v2-iphone-safari", estimateV2, iphoneSafari);
await capture("05-invoice-v2-iphone-safari", invoiceV2, iphoneSafari);

const pwaPage = await browser.newPage();
await pwaPage.setViewport(iphoneSafari);
await pwaPage.setContent(
  `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<meta name="apple-mobile-web-app-capable" content="yes"/>
<style>body{margin:0;background:#111} iframe{width:100%;height:100vh;border:0;background:#fff}</style></head>
<body><iframe id="pdf" title="PDF preview"></iframe>
<script>document.getElementById('pdf').srcdoc = ${JSON.stringify(estimateV2)};</script></body></html>`,
  { waitUntil: "networkidle0" }
);
const pwaPath = path.join(outDir, "06-estimate-v2-iphone-pwa.png");
await pwaPage.screenshot({ path: pwaPath, fullPage: true });
report.iphoneChecks.push({ label: "estimate PWA iframe", path: pwaPath, ok: true });
await pwaPage.close();

const invPwaPage = await browser.newPage();
await invPwaPage.setViewport(iphoneSafari);
await invPwaPage.setContent(
  `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<meta name="apple-mobile-web-app-capable" content="yes"/>
<style>body{margin:0;background:#111} iframe{width:100%;height:100vh;border:0;background:#fff}</style></head>
<body><iframe id="pdf" title="PDF preview"></iframe>
<script>document.getElementById('pdf').srcdoc = ${JSON.stringify(invoiceV2)};</script></body></html>`,
  { waitUntil: "networkidle0" }
);
const invPwaPath = path.join(outDir, "07-invoice-v2-iphone-pwa.png");
await invPwaPage.screenshot({ path: invPwaPath, fullPage: true });
report.iphoneChecks.push({ label: "invoice PWA iframe", path: invPwaPath, ok: true });
await invPwaPage.close();

await browser.close();

fs.writeFileSync(path.join(outDir, "verification-report.json"), JSON.stringify(report, null, 2), "utf8");
console.log(`Done — ${outDir}`);
