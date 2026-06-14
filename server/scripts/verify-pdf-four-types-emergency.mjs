/**
 * 緊急修正検証 — 4帳票PDFを実データで生成しページ数・スクショを出力
 * Usage: npm run build && node scripts/verify-pdf-four-types-emergency.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../data/pdf-four-types-emergency");
fs.mkdirSync(outDir, { recursive: true });

process.env.JWT_SECRET = process.env.JWT_SECRET || "verify-pdf-four-types";
process.env.CUSTOMER_DEMO_PASSWORD = process.env.CUSTOMER_DEMO_PASSWORD || "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = path.join(__dirname, "../data/verify-pdf-four-types.db");
process.env.RATE_LIMIT_PROVIDER = "memory";

for (const p of [
  process.env.TISLY_DB_PATH,
  `${process.env.TISLY_DB_PATH}-wal`,
  `${process.env.TISLY_DB_PATH}-shm`,
]) {
  try {
    fs.unlinkSync(p);
  } catch {
    /* */
  }
}

const { default: request } = await import("supertest");
const { createApp } = await import("../dist/app.js");
const { closeDatabase, getDatabase } = await import("../dist/db/database.js");
const { analyzePdfBuffer } = await import("../dist/business/pdf/pdf-validation.js");
const { embedPdfImagesInHtml } = await import("../dist/business/pdf/pdf-image-embed.js");
const {
  generateEstimatePdf,
  generateInvoicePdf,
  generateSpecificationPdfV1,
  generateCompletionReportPdfV1,
} = await import("../dist/business/services/pdfService.js");
const {
  renderSpecificationHtmlV1,
  renderCompletionReportHtmlV1,
  createCompletionReportV1,
} = await import("../dist/estimate/estimate-v1-store.js");
const { getBusinessProject, getEstimate, getInvoice } = await import("../dist/business/business-store.js");

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const SAMPLE = {
  customerName: "株式会社伝元",
  siteName: "KSフロンティア様",
  workLocation: "茨城県つくば市研究学園5-1",
  subject: "換気扇設置工事",
  lines: [
    { name: "小上がり既存換気扇3台設置", memo: "清掃・修理配線", quantity: 3, unitPrice: 15000, amount: 45000 },
    { name: "試験・調整", memo: "", quantity: 1, unitPrice: 10000, amount: 10000 },
  ],
};

getDatabase();
const app = createApp();

const login = await request(app)
  .post("/api/auth/customer/login")
  .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
if (!login.body.token) throw new Error(`login failed: ${JSON.stringify(login.body)}`);
const token = login.body.token;

const survey = await request(app)
  .post("/api/survey/v1/projects")
  .set("Authorization", `Bearer ${token}`)
  .send({
    customerCode: "TOMS001",
    customerName: SAMPLE.customerName,
    siteName: SAMPLE.siteName,
    address: SAMPLE.workLocation,
    surveyDate: "2026-06-15",
  });
const svyId = survey.body.projectId;

for (let i = 0; i < 6; i++) {
  await request(app)
    .post(`/api/survey/v1/projects/${svyId}/photos`)
    .set("Authorization", `Bearer ${token}`)
    .send({ imageBase64: TINY_PNG, fileName: `survey-${i + 1}.jpg`, comment: `現調写真${i + 1}` });
}

await request(app)
  .post(`/api/survey/v1/projects/${svyId}/estimate-pending`)
  .set("Authorization", `Bearer ${token}`)
  .send({});

const est = await request(app)
  .post(`/api/estimate/v1/from-survey/${svyId}`)
  .set("Authorization", `Bearer ${token}`)
  .send({});
const bizId = est.body.businessProjectId;

await request(app)
  .patch(`/api/estimate/v1/projects/${bizId}/items`)
  .set("Authorization", `Bearer ${token}`)
  .send({
    items: SAMPLE.lines.map((l) => ({ ...l, unit: "式", category: "other" })),
    notes: "納期2週間程度",
  });

for (let i = 0; i < 6; i++) {
  await request(app)
    .post(`/api/estimate/v1/projects/${bizId}/completion-photos`)
    .set("Authorization", `Bearer ${token}`)
    .send({ imageBase64: TINY_PNG, fileName: `completion-${i + 1}.jpg`, title: `完了写真${i + 1}` });
}

await request(app)
  .post(`/api/estimate/v1/projects/${bizId}/finalize`)
  .set("Authorization", `Bearer ${token}`)
  .send({});
await request(app)
  .post(`/api/estimate/v1/projects/${bizId}/invoice`)
  .set("Authorization", `Bearer ${token}`)
  .send({});
await createCompletionReportV1(bizId);

const project = getBusinessProject(bizId);
const estimate = getEstimate(project.estimateId);
const invoice = getInvoice(project.invoiceId);
if (!project || !estimate || !invoice) throw new Error("project data missing");

const specHtml = renderSpecificationHtmlV1(bizId);
const crHtml = renderCompletionReportHtmlV1(bizId);
if (!specHtml || !crHtml) throw new Error("spec/completion html missing");

const pdfPaths = {
  estimate: await generateEstimatePdf(project, estimate),
  invoice: await generateInvoicePdf(project, invoice, estimate),
  specification: await generateSpecificationPdfV1(project, specHtml),
  "completion-report": await generateCompletionReportPdfV1(project, crHtml),
};

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const report = {
  generatedAt: new Date().toISOString(),
  businessProjectId: bizId,
  documents: [],
};

const labels = {
  estimate: "見積書",
  invoice: "請求書",
  specification: "仕様書",
  "completion-report": "完了報告書",
};

for (const [kind, storedPath] of Object.entries(pdfPaths)) {
  const localPath = path.join(process.cwd(), storedPath.replace(/^\//, ""));
  const pdfBuf = fs.readFileSync(localPath);
  const analysis = analyzePdfBuffer(pdfBuf);

  let htmlForShot = "";
  if (kind === "specification") htmlForShot = embedPdfImagesInHtml(specHtml);
  else if (kind === "completion-report") htmlForShot = embedPdfImagesInHtml(crHtml);
  else {
    const htmlName = kind === "estimate" ? `estimate-${estimate.estimateNo}.html` : `invoice-${invoice.invoiceNo}.html`;
    const htmlPath = path.join(process.cwd(), "uploads", "business", bizId, "pdf-html", htmlName);
    if (fs.existsSync(htmlPath)) htmlForShot = fs.readFileSync(htmlPath, "utf8");
  }

  const outPdf = path.join(outDir, `${kind}.pdf`);
  const outPng = path.join(outDir, `${kind}.png`);
  fs.copyFileSync(localPath, outPdf);

  const page = await browser.newPage();
  await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
  if (htmlForShot) {
    await page.setContent(htmlForShot, { waitUntil: "networkidle0" });
    await page.screenshot({ path: outPng, fullPage: true });
  }
  await page.close();

  const prefix = kind === "specification" ? "sp" : kind === "completion-report" ? "cr" : kind.slice(0, 3);
  const photoCells =
    kind === "estimate" || kind === "invoice"
      ? 0
      : (htmlForShot.match(new RegExp(`class="${prefix}-photo-cell"`, "g")) || []).length;

  report.documents.push({
    kind,
    label: labels[kind],
    pdfPath: outPdf,
    screenshot: outPng,
    pageCount: analysis.pageCount,
    photoCells,
    bytes: pdfBuf.length,
    noPhotoLayout:
      kind === "estimate" || kind === "invoice" ? !htmlForShot.includes("-photo-cell") : photoCells >= 4,
  });
  console.log(`${labels[kind]}: ${analysis.pageCount} pages, photoCells=${photoCells}`);
}

await browser.close();
closeDatabase();

fs.writeFileSync(path.join(outDir, "verification-report.json"), JSON.stringify(report, null, 2), "utf8");
console.log(`Done — ${outDir}`);
