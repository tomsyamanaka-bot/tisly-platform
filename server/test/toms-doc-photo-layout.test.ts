import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderEstimateHtml } from "../src/business/pdf/estimate-template.js";
import { renderInvoiceHtml } from "../src/business/pdf/invoice-template.js";
import { FIRST_PAGE_PHOTOS_MAX } from "../src/estimate/practical-pdf-layout.js";

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

function countCoverPhotos(html: string, prefix: "est" | "inv") {
  const coverRe = new RegExp(
    `class="${prefix}-page ${prefix}-cover-page"[\\s\\S]*?(?=class="${prefix}-page |class="doc |$)`
  );
  const cover = html.match(coverRe)?.[0] ?? "";
  return (cover.match(new RegExp(`class="${prefix}-photo-cell"`, "g")) || []).length;
}

function countContinuationPages(html: string, prefix: "est" | "inv") {
  return (html.match(new RegExp(`class="${prefix}-page ${prefix}-photo-page"`, "g")) || []).length;
}

describe("見積・請求 統一写真レイアウト", () => {
  it("見積書 6枚は1ページ目（表紙）に6枚・object-fit cover", () => {
    const html = renderEstimateHtml(baseProject, baseEstimate, { includePhotos: true });
    assert.equal(countCoverPhotos(html, "est"), 6);
    assert.equal(countContinuationPages(html, "est"), 0);
    assert.match(html, /est-cover-photo-grid/);
    assert.match(html, /object-fit:\s*cover/);
    assert.match(html, /Page 1 \/ 2/);
    assert.ok(!html.includes("参考写真"));
  });

  it("見積書 7枚目は2ページ目（写真専用）へ", () => {
    const project = { ...baseProject, surveyPhotos: businessPhotos(7) };
    const html = renderEstimateHtml(project, baseEstimate, { includePhotos: true });
    assert.equal(FIRST_PAGE_PHOTOS_MAX, 6);
    assert.equal(countCoverPhotos(html, "est"), 6);
    assert.equal(countContinuationPages(html, "est"), 1);
    assert.match(html, /Page 1 \/ 3/);
    assert.match(html, /Page 2 \/ 3/);
  });

  it("請求書 4枚は1ページ目に4枚のみ", () => {
    const project = { ...baseProject, surveyPhotos: businessPhotos(4) };
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
    const html = renderInvoiceHtml(project, invoice, baseEstimate, { includePhotos: true });
    assert.equal(countCoverPhotos(html, "inv"), 4);
    assert.equal(countContinuationPages(html, "inv"), 0);
    assert.match(html, /inv-cover-photo-grid/);
  });

  it("写真なし見積は従来の単一ページ", () => {
    const project = { ...baseProject, surveyPhotos: [] };
    const html = renderEstimateHtml(project, baseEstimate, { includePhotos: true });
    assert.ok(!html.includes("est-cover-photo-grid"));
    assert.match(html, /toms-v2-page/);
  });
});
