/**
 * TOMS Official PDF Layout v1 — estimate/invoice HTML + PNG samples.
 * Usage: npm run build && node scripts/render-toms-pdf-layout-samples.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../data/pdf-layout-samples");
fs.mkdirSync(outDir, { recursive: true });

const { renderEstimateHtml } = await import("../dist/business/pdf/estimate-template.js");
const { renderInvoiceHtml } = await import("../dist/business/pdf/invoice-template.js");

const project = {
  id: "pdf-layout-sample",
  projectNo: "TOMS-0001",
  customerId: "c1",
  customerName: "株式会社伝元",
  title: "土浦寮",
  address: "茨城県土浦市○○",
  phone: "",
  status: "estimate_created",
  surveySchedule: null,
  surveyMemo: "・価格は税抜単価に基づき算出しています\n・正式見積前に現地確認が必要な場合があります\n・案件番号: TOMS-0001",
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
  createdAt: "",
  updatedAt: "",
};

const items = [
  {
    id: "1",
    category: "other",
    name: "1Fトイレ 換気 交換 (φ100)",
    memo: "",
    unit: "式",
    quantity: 2,
    unitPrice: 55000,
    amount: 110000,
  },
  {
    id: "2",
    category: "other",
    name: "2Fトイレ 換気 交換 (φ100)",
    memo: "",
    unit: "式",
    quantity: 2,
    unitPrice: 55000,
    amount: 110000,
  },
  {
    id: "3",
    category: "other",
    name: "2F廊下 照明 新設 (ダウンライト)",
    memo: "",
    unit: "式",
    quantity: 6,
    unitPrice: 18000,
    amount: 108000,
  },
  {
    id: "4",
    category: "other",
    name: "1F電気室 分電盤 交換 (20+2)",
    memo: "",
    unit: "式",
    quantity: 1,
    unitPrice: 180000,
    amount: 180000,
  },
];

const estimate = {
  id: "e1",
  projectId: project.id,
  estimateNo: "EST-20260531-0001",
  customerName: project.customerName,
  title: project.title,
  items,
  shuseiDiscount: 0,
  shuseiDiscountMemo: "",
  lineSubtotal: 508000,
  subtotal: 508000,
  tax: 50800,
  total: 558800,
  internalCost: 0,
  grossProfit: 508000,
  grossProfitRate: 100,
  pdfPath: null,
  createdAt: "2026-05-31T00:00:00.000Z",
  updatedAt: "2026-05-31T00:00:00.000Z",
  header: {
    addressee: project.customerName,
    subject: project.title,
    issueDate: "2026-05-31",
    estimateNo: "EST-20260531-0001",
    staffName: "山中智紀",
    workLocation: project.address,
  },
};

const invoice = {
  id: "i1",
  projectId: project.id,
  invoiceNo: "INV-2026-0002",
  customerName: project.customerName,
  title: project.title,
  items,
  subtotal: 508000,
  tax: 50800,
  total: 558800,
  bankInfo: "みずほ銀行 守谷支店 普通 1234567 カ）トムス",
  pdfPath: null,
  createdAt: "2026-05-31T00:00:00.000Z",
  updatedAt: "2026-05-31T00:00:00.000Z",
};

const estimateHtml = renderEstimateHtml(project, estimate, {
  header: estimate.header,
  workLocation: project.address,
  notes: project.surveyMemo,
  includePhotos: false,
});

const invoiceHtml = renderInvoiceHtml(project, invoice, estimate, {
  header: {
    addressee: project.customerName,
    subject: project.title,
    invoiceDate: "2026-05-31",
    invoiceNo: invoice.invoiceNo,
    staffName: "山中智紀",
    workLocation: project.address,
    estimateRefNo: estimate.estimateNo,
    bankInfo: invoice.bankInfo,
  },
  notes: project.surveyMemo,
  includePhotos: false,
});

fs.writeFileSync(path.join(outDir, "after-estimate-v1.html"), estimateHtml, "utf8");
fs.writeFileSync(path.join(outDir, "after-invoice-v1.html"), invoiceHtml, "utf8");

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1200, deviceScaleFactor: 2 });

for (const [name, html] of [
  ["after-estimate-v1", estimateHtml],
  ["after-invoice-v1", invoiceHtml],
]) {
  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
  const pdf = await page.pdf({ format: "A4", printBackground: true });
  fs.writeFileSync(path.join(outDir, `${name}.pdf`), pdf);
  console.log("wrote", name);
}

await browser.close();
console.log(`Samples written to ${outDir}`);
