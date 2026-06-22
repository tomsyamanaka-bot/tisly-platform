import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";

process.env.JWT_SECRET = "test-jwt-pdf-restore-v1";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-pdf-restore-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const { renderEstimateHtml } = await import("../src/business/pdf/estimate-template.js");
const { renderInvoiceHtml } = await import("../src/business/pdf/invoice-template.js");
const { renderSpecificationHtml } = await import("../src/estimate/specification-template.js");
const { renderPracticalPdfHtml } = await import("../src/estimate/practical-pdf-layout.js");
const { runPdfDiagnosticsV1 } = await import("../src/business/pdf/pdf-diagnostics-v1.js");
const { resolveTomsBankInfo } = await import("../src/business/toms-document-format.js");

const app = createApp();
const publicDir = path.join(process.cwd(), "public");

const sampleProject = {
  id: "p-restore",
  projectNo: "MO-26-0622-099",
  customerId: "c1",
  customerName: "復旧テスト様",
  title: "防犯カメラ設置",
  address: "茨城県守谷市",
  phone: "",
  status: "estimate_created",
  surveySchedule: null,
  surveyMemo: "",
  surveyPhotos: [],
  estimateId: "e-restore",
  constructionSchedule: null,
  requiredMaterials: "",
  constructionMemo: "",
  constructionPhotos: [],
  completionReportId: null,
  invoiceId: "i-restore",
  paymentDueDate: null,
  paidDate: null,
  qnapBasePath: "",
  surveyProjectId: null,
  createdAt: "2026-06-22T00:00:00.000Z",
  updatedAt: "2026-06-22T00:00:00.000Z",
};

const sampleEstimate = {
  id: "e-restore",
  projectId: "p-restore",
  estimateNo: "260622-099",
  title: "防犯カメラ設置",
  customerName: "復旧テスト様",
  items: [{ id: "1", category: "other", name: "カメラ設置", unit: "式", quantity: 2, unitPrice: 50000, amount: 100000 }],
  lineSubtotal: 100000,
  shuseiDiscount: 0,
  shuseiDiscountMemo: "",
  subtotal: 100000,
  tax: 10000,
  total: 110000,
  header: {
    addressee: "復旧テスト様",
    subject: "防犯カメラ設置",
    issueDate: "2026/06/22",
    estimateNo: "260622-099",
    staffName: "山中 智紀",
    workLocation: "茨城県守谷市",
    siteName: "守谷市テスト現場",
  },
  createdAt: "2026-06-22T00:00:00.000Z",
  updatedAt: "2026-06-22T00:00:00.000Z",
};

describe("PDF復旧 Phase4+", () => {
  after(() => closeDatabase());

  it("見積PDFに株式会社TOMS・明細・税込が含まれる", () => {
    const html = renderEstimateHtml(sampleProject, sampleEstimate);
    assert.match(html, /株式会社TOMS/);
    assert.match(html, /カメラ設置/);
    assert.match(html, /小計|税込|合計/);
    assert.ok(!html.includes("インボイス番号"));
  });

  it("請求PDFの口座名義はトムズ（トムス禁止）", () => {
    const invoice = {
      id: "i-restore",
      projectId: "p-restore",
      invoiceNo: "260622-100",
      title: "防犯カメラ設置",
      customerName: "復旧テスト様",
      items: sampleEstimate.items,
      subtotal: 100000,
      tax: 10000,
      total: 110000,
      bankInfo: "常陽銀行 越谷支店\n普通 1370414\nトムス",
      createdAt: "2026-06-22T00:00:00.000Z",
      updatedAt: "2026-06-22T00:00:00.000Z",
    };
    const html = renderInvoiceHtml(sampleProject, invoice, sampleEstimate);
    assert.match(html, /トムズ/);
    assert.ok(!html.includes("トムス"));
    assert.equal(resolveTomsBankInfo(invoice.bankInfo).includes("トムズ"), true);
  });

  it("仕様書PDFに現場名・工事内容・設備・写真6枠", () => {
    const photos = Array.from({ length: 6 }, (_, i) => ({
      url: `/p${i + 1}.jpg`,
      title: `写真${i + 1}`,
    }));
    const html = renderSpecificationHtml({
      projectNo: sampleProject.projectNo,
      addressee: "復旧テスト様",
      subject: "防犯カメラ設置",
      siteName: "守谷市テスト現場",
      workLocation: "茨城県守谷市",
      issueDate: "2026/06/22",
      staffName: "山中 智紀",
      generatedAt: "2026-06-22T12:00:00+09:00",
      systemConfig: "防犯カメラ",
      equipmentList: "・屋外カメラ × 4",
      photos,
    });
    assert.match(html, /現場名/);
    assert.match(html, /守谷市テスト現場/);
    assert.match(html, /工事内容/);
    assert.match(html, /設備一覧/);
    assert.equal((html.match(/class="sp-photo-cell(?:\s|")/g) || []).length, 6);
    assert.ok(html.length > 500);
  });

  it("写真6枚は2列×3段で左上から配置", () => {
    const html = renderPracticalPdfHtml({
      prefix: "sp",
      pageTitle: "配置テスト",
      documentTitle: "仕様書",
      projectNo: "PRJ",
      generatedAt: "2026-06-22T12:00:00+09:00",
      coverFields: [{ label: "件名", value: "テスト" }],
      photos: Array.from({ length: 6 }, (_, i) => ({ url: `/p${i}.jpg`, title: `写真${i + 1}` })),
    });
    assert.match(html, /grid-template-rows:\s*repeat\(3,\s*1fr\)/);
    assert.match(html, /①/);
    assert.match(html, /⑥/);
  });

  it("PDF共有モジュールにエラー表示とWeb Share対応", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/pdf-share-v1.js"), "utf8");
    assert.ok(js.includes("sharePdfBlobAsFile"));
    assert.ok(js.includes("LINE_SHARE_HINT"));
    assert.ok(js.includes("PDF_FAIL_MSG"));
    assert.ok(js.includes("triggerDownload"));
  });

  it("estimate-v1にPDF共有ボタンがある", async () => {
    const res = await request(app).get("/estimate-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /btn-pdf-quick-generate/);
    assert.match(res.text, /btn-pdf-quick-share/);
    assert.match(res.text, /btn-pdf-specification/);
  });

  it("survey-v1に仕様書PDFボタンがある", async () => {
    const res = await request(app).get("/survey-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /btn-survey-pdf-create/);
    assert.match(res.text, /btn-survey-pdf-redo/);
  });

  it("GET /api/health/pdf-diagnostics", async () => {
    const res = await request(app).get("/api/health/pdf-diagnostics");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.types));
    assert.equal(res.body.types.length, 4);
    for (const t of res.body.types) {
      assert.ok(["estimate", "invoice", "specification", "completion"].includes(t.kind));
      assert.ok(t.htmlOk);
    }
  });

  it("runPdfDiagnosticsV1 全帳票HTML OK", async () => {
    const diag = await runPdfDiagnosticsV1();
    assert.ok(diag.types.every((t) => t.htmlOk));
    assert.ok(!diag.types.find((t) => t.label === "見積PDF") || diag.types.find((t) => t.kind === "estimate")?.htmlOk);
  });
});
