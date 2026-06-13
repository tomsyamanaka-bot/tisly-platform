/**
 * TOMS PDF / 案件一覧 提出用スクショ
 * Usage: npm run build && node scripts/capture-toms-format-deliverables.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../data/pdf-verify");
fs.mkdirSync(outDir, { recursive: true });

const { renderEstimateHtml } = await import("../dist/business/pdf/estimate-template.js");
const { renderInvoiceHtml } = await import("../dist/business/pdf/invoice-template.js");

const project = {
  id: "BIZ-TOMS-FMT",
  projectNo: "TOMS-2026-0613",
  customerId: "c1",
  customerName: "フレックス株式会社",
  title: "防犯カメラ設置工事",
  address: "茨城県つくば市研究学園5丁目",
  phone: "029-000-0000",
  status: "estimate_created",
  surveySchedule: null,
  surveyMemo:
    "現調PWA v1 連携 (SVY-DEMO01) / メモ: Google予定から自動生成 / 部材2件 / ・納期は2週間程度を目安にご連絡ください",
  surveyPhotos: [],
  estimateId: "e1",
  constructionSchedule: null,
  requiredMaterials: "",
  constructionMemo: "",
  constructionPhotos: [],
  completionReportId: null,
  invoiceId: "i1",
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
    addressee: "フレックス株式会社 御中",
    subject: "防犯カメラ設置工事",
    issueDate: "2026/06/13",
    estimateNo: "260613-001",
    validUntil: "2026/07/13",
    staffName: "山中 智紀",
    workLocation: "茨城県つくば市研究学園5丁目",
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
  pdfPath: "/uploads/business/BIZ-TOMS-FMT/pdfs/estimate-260613-001.pdf",
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
  invoiceDate: "2026/06/13",
  paymentDueDate: "2026/07/13",
  bankInfo: "三菱UFJ銀行 つくば支店 普通 1234567 カ）トムス",
  pdfPath: "/uploads/business/BIZ-TOMS-FMT/pdfs/invoice-260613-001.pdf",
  createdAt: "2026-06-13T00:00:00.000Z",
  updatedAt: "2026-06-13T00:00:00.000Z",
};

const estimateHtml = renderEstimateHtml(project, estimate);
const invoiceHtml = renderInvoiceHtml(project, invoice, estimate);
const estimateHtmlPath = path.join(outDir, "estimate-toms-format.html");
const invoiceHtmlPath = path.join(outDir, "invoice-toms-format.html");
fs.writeFileSync(estimateHtmlPath, estimateHtml, "utf8");
fs.writeFileSync(invoiceHtmlPath, invoiceHtml, "utf8");

const projectsListHtml = `<!DOCTYPE html><html lang="ja"><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=390, initial-scale=1"/>
<link rel="stylesheet" href="../../public/css/tisly-friendly-ui.css"/>
<link rel="stylesheet" href="../../public/css/field-ops-mobile.css"/>
<style>
body.tisly-friendly.field-ops-touch{margin:0;padding:0.75rem;background:#f6f8fa}
.project-card{position:relative;cursor:pointer}
.project-card .list-card-actions{position:absolute;top:0.65rem;right:0.65rem;display:flex;gap:0.35rem;z-index:2}
.list-card-action{border:1px solid #e2e8f0;background:#f6f8fa;border-radius:6px;padding:0.25rem 0.45rem;font-size:0.85rem}
.dialog-overlay{position:fixed;inset:0;background:rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center;padding:1rem}
.dialog-card{background:#fff;border-radius:12px;padding:1rem 1.1rem;max-width:320px;width:100%;box-shadow:0 8px 30px rgba(0,0,0,0.18)}
.dialog-card p{margin:0 0 1rem;line-height:1.5;font-size:0.95rem}
.dialog-actions{display:flex;gap:0.5rem;justify-content:flex-end}
.dialog-actions button{min-height:44px;padding:0.55rem 0.9rem;border-radius:8px;border:1px solid #e2e8f0;background:#fff}
.dialog-actions .danger{background:#dc2626;color:#fff;border-color:#dc2626}
</style></head><body class="tisly-friendly field-ops-touch">
<p class="section-label">📂 案件一覧</p>
<article class="friendly-card project-card">
  <div class="list-card-actions"><button type="button" class="list-card-action" title="案件を削除">🗑</button></div>
  <p><strong>TOMS-2026-0613</strong> 防犯カメラ設置工事</p>
  <p class="section-hint">フレックス株式会社</p>
  <p class="section-hint">📍 茨城県つくば市研究学園5丁目</p>
  <p><span class="status-badge">見積作成</span></p>
</article>
</body></html>`;

const deleteDialogHtml = `<!DOCTYPE html><html lang="ja"><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=390, initial-scale=1"/>
<link rel="stylesheet" href="../../public/css/tisly-friendly-ui.css"/>
<style>
body{margin:0;font-family:system-ui,sans-serif;background:#f6f8fa}
.dialog-overlay{position:fixed;inset:0;background:rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center;padding:1rem}
.dialog-card{background:#fff;border-radius:12px;padding:1rem 1.1rem;max-width:320px;width:100%;box-shadow:0 8px 30px rgba(0,0,0,0.18)}
.dialog-card h3{margin:0 0 0.5rem;font-size:1rem}
.dialog-card p{margin:0 0 1rem;line-height:1.55;font-size:0.92rem;color:#334155;white-space:pre-line}
.dialog-actions{display:flex;gap:0.5rem;justify-content:flex-end}
.dialog-actions button{min-height:44px;padding:0.55rem 0.9rem;border-radius:8px;border:1px solid #e2e8f0;background:#fff;font-size:0.9rem}
.dialog-actions .danger{background:#dc2626;color:#fff;border-color:#dc2626}
</style></head><body>
<div class="dialog-overlay">
  <div class="dialog-card">
    <h3>案件の削除</h3>
    <p>この案件には見積または請求があります。
本当に削除しますか？
関連する見積・請求・材料情報も一覧から非表示になります。</p>
    <div class="dialog-actions"><button type="button">キャンセル</button><button type="button" class="danger">削除する</button></div>
  </div>
</div>
</body></html>`;

const projectsListPath = path.join(outDir, "projects-list-delete-ui.html");
const deleteDialogPath = path.join(outDir, "projects-delete-dialog.html");
fs.writeFileSync(projectsListPath, projectsListHtml, "utf8");
fs.writeFileSync(deleteDialogPath, deleteDialogHtml, "utf8");

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
const iphone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true };
const a4 = { width: 794, height: 1123, deviceScaleFactor: 2 };

async function captureTaxArea(htmlPath, pngName, viewport) {
  await page.setViewport(viewport);
  await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "networkidle0" });
  const box = await page.evaluate(() => {
    const el = document.querySelector(".toms-official-tax-breakdown");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: r.width + 16, height: r.height + 16 };
  });
  if (box) {
    await page.screenshot({ path: path.join(outDir, pngName), clip: box });
  } else {
    await page.screenshot({ path: path.join(outDir, pngName), fullPage: true });
  }
}

async function captureNotesArea(htmlPath, pngName) {
  await page.setViewport(a4);
  await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "networkidle0" });
  const box = await page.evaluate(() => {
    const el = document.querySelector(".toms-official-notes");
    const totals = document.querySelector(".toms-official-totals");
    const anchor = el || totals;
    if (!anchor) return null;
    const r = anchor.getBoundingClientRect();
    return { x: 8, y: Math.max(0, r.y - 4), width: 760, height: Math.min(220, (el ? r.height : 120) + 24) };
  });
  if (box) {
    await page.screenshot({ path: path.join(outDir, pngName), clip: box });
  }
}

await captureTaxArea(estimateHtmlPath, "estimate-tax-breakdown-a4.png", a4);
await captureTaxArea(invoiceHtmlPath, "invoice-tax-breakdown-a4.png", a4);
await captureTaxArea(estimateHtmlPath, "estimate-tax-breakdown-mobile.png", iphone);
await captureTaxArea(invoiceHtmlPath, "invoice-tax-breakdown-mobile.png", iphone);
await captureNotesArea(estimateHtmlPath, "estimate-notes-filtered.png");

await page.setViewport(iphone);
await page.goto(`file:///${projectsListPath.replace(/\\/g, "/")}`, { waitUntil: "networkidle0" });
await page.screenshot({ path: path.join(outDir, "projects-list-delete-button.png"), fullPage: false });

await page.goto(`file:///${deleteDialogPath.replace(/\\/g, "/")}`, { waitUntil: "networkidle0" });
await page.screenshot({ path: path.join(outDir, "projects-delete-dialog.png"), fullPage: true });

await page.setViewport(a4);
for (const [htmlPath, pngName] of [
  [estimateHtmlPath, "estimate-toms-format-a4.png"],
  [invoiceHtmlPath, "invoice-toms-format-a4.png"],
]) {
  await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "networkidle0" });
  await page.screenshot({ path: path.join(outDir, pngName), fullPage: true });
}

await browser.close();
console.log("Deliverable screenshots written to", outDir);
