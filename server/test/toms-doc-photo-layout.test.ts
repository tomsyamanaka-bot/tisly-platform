import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderEstimateHtml } from "../src/business/pdf/estimate-template.js";
import { renderInvoiceHtml } from "../src/business/pdf/invoice-template.js";

const portraitSample =
  "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>').toString("base64");

function businessPhotos(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    fileName: `photo${i + 1}.jpg`,
    urlPath: portraitSample,
    caption: `写真${i + 1}`,
  }));
}

const baseProject = {
  id: "p1",
  projectNo: "PRJ-TEST",
  customerId: "c1",
  customerName: "上田",
  title: "カメラ工事",
  address: "東京都",
  phone: "",
  status: "estimate_created",
  surveySchedule: null,
  surveyMemo: "Google予定から自動生成",
  surveyPhotos: businessPhotos(6),
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
  updatedAt: "2026-06-13T12:00:00.000Z",
};

const baseEstimate = {
  id: "e1",
  projectId: "p1",
  estimateNo: "260613-001",
  title: "カメラ工事",
  customerName: "上田様",
  items: [{ id: "1", category: "other", name: "作業", unit: "式", quantity: 1, unitPrice: 10000, amount: 10000 }],
  lineSubtotal: 10000,
  shuseiDiscount: 0,
  shuseiDiscountMemo: "",
  subtotal: 10000,
  tax: 1000,
  total: 11000,
  header: {
    addressee: "上田様",
    subject: "カメラ工事",
    issueDate: "2026/06/13",
    estimateNo: "260613-001",
    staffName: "山中 智紀",
    workLocation: "東京都",
  },
  createdAt: "2026-06-13T00:00:00.000Z",
  updatedAt: "2026-06-13T12:00:00.000Z",
};

describe("見積・請求 PDF — 写真ページ禁止", () => {
  it("現調写真6枚があっても見積書に写真レイアウトが出ない", () => {
    const html = renderEstimateHtml(baseProject, baseEstimate);
    assert.ok(!html.includes("est-cover-photo-grid"));
    assert.ok(!html.includes("est-photo-page"));
    assert.ok(!html.includes("est-photo-cell"));
    assert.match(html, /toms-v2-page/);
    assert.match(html, />摘要</);
    assert.match(html, /Page 1 \/ 1/);
  });

  it("現調写真6枚があっても請求書に写真レイアウトが出ない", () => {
    const invoice = {
      id: "i1",
      projectId: "p1",
      invoiceNo: "260613-002",
      title: "カメラ工事",
      customerName: "上田様",
      items: baseEstimate.items,
      subtotal: 10000,
      tax: 1000,
      total: 11000,
      bankInfo: "常陽銀行\nトムズ",
      createdAt: "2026-06-13T00:00:00.000Z",
      updatedAt: "2026-06-13T12:00:00.000Z",
    };
    const html = renderInvoiceHtml(baseProject, invoice, baseEstimate);
    assert.ok(!html.includes("inv-cover-photo-grid"));
    assert.ok(!html.includes("inv-photo-page"));
    assert.ok(!html.includes("inv-photo-cell"));
    assert.match(html, /御請求書/);
    assert.match(html, /Page 1 \/ 1/);
  });
});
