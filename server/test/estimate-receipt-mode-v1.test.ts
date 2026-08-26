import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderEstimateHtml, DEFAULT_RECEIPT_PROVISO } from "../src/business/pdf/estimate-template.js";
import { htmlToPdfBuffer } from "../src/business/pdf/render.js";
import { analyzePdfBuffer } from "../src/business/pdf/pdf-validation.js";

const project = {
  id: "p-receipt-1",
  projectNo: "PRJ-2026-REC1",
  customerId: "c1",
  customerName: "領収テスト株式会社",
  title: "TVアンテナ・防犯カメラ工事",
  address: "茨城県守谷市中央1-1-1",
  phone: "",
  status: "estimate_created",
  surveySchedule: null,
  surveyMemo: "備考テスト",
  surveyPhotos: [],
  estimateId: "e-receipt-1",
  constructionSchedule: null,
  requiredMaterials: "",
  constructionMemo: "",
  constructionPhotos: [],
  completionReportId: null,
  invoiceId: null,
  paymentDueDate: null,
  paidDate: null,
  qnapBasePath: "",
  surveyProjectId: null,
  createdAt: "2026-08-26T00:00:00.000Z",
  updatedAt: "2026-08-26T00:00:00.000Z",
} as const;

function buildEstimate(itemCount = 6) {
  const items = Array.from({ length: itemCount }, (_, i) => ({
    id: String(i + 1),
    category: "other" as const,
    name: `工事明細 ${i + 1}`,
    memo: "",
    unit: "式",
    quantity: 1,
    unitPrice: 20000 + i * 1000,
    amount: 20000 + i * 1000,
  }));
  const lineSubtotal = items.reduce((s, x) => s + x.amount, 0);
  const subtotal = lineSubtotal;
  const tax = Math.round(subtotal * 0.1);
  return {
    id: "e-receipt-1",
    projectId: "p-receipt-1",
    estimateNo: "260826-001",
    title: project.title,
    customerName: project.customerName,
    items,
    lineSubtotal,
    shuseiDiscount: 0,
    shuseiDiscountMemo: "",
    subtotal,
    tax,
    total: subtotal + tax,
    header: {
      addressee: project.customerName,
      subject: "TVアンテナ・防犯カメラ工事代金",
      issueDate: "2026/08/26",
      estimateNo: "260826-001",
      staffName: "山中 智紀",
      workLocation: project.address,
    },
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
  };
}

describe("見積→領収書モード HTML/PDF", () => {
  it("見積モードは既存文言を維持する", () => {
    const html = renderEstimateHtml(project as any, buildEstimate() as any);
    assert.match(html, /お見積書/);
    assert.match(html, /下記の通り、お見積り申し上げます。/);
    assert.match(html, /有効期限/);
    assert.doesNotMatch(html, /電子発行につき印紙不要/);
    assert.doesNotMatch(html, /正に領収いたしました/);
  });

  it("領収書モードは表題・挨拶・印紙注記・但し書きを反映する", () => {
    const html = renderEstimateHtml(project as any, buildEstimate() as any, {
      mode: "receipt",
      receiptDate: "2026/08/26",
      proviso: DEFAULT_RECEIPT_PROVISO,
    });
    assert.match(html, />領収書</);
    assert.match(html, /上記の通り、正に領収いたしました。/);
    assert.match(html, /電子発行につき印紙不要/);
    assert.match(html, /但 TVアンテナ・防犯カメラ工事代金として/);
    assert.match(html, /領収日/);
    assert.match(html, /登録番号/);
    assert.match(html, /山中 智紀/);
    assert.doesNotMatch(html, /有効期限/);
    assert.doesNotMatch(html, /お見積書/);
  });

  it("領収書 PDF は A4 1 ページに収まる", async () => {
    if (process.env.TISLY_PDF_PUPPETEER === "false") return;
    const html = renderEstimateHtml(project as any, buildEstimate(8) as any, {
      mode: "receipt",
    });
    assert.match(html, /max-height:\s*287mm/);
    assert.match(html, /page-break-inside:\s*avoid/);
    assert.match(html, /Page 1 \/ 1/);
    assert.equal((html.match(/class="toms-v2-page"/g) || []).length, 1);
    const buf = await htmlToPdfBuffer(html);
    assert.ok(buf, "puppeteer should produce buffer");
    const info = analyzePdfBuffer(buf);
    assert.equal(info.valid, true, JSON.stringify(info));
    assert.equal(info.pageCount, 1, `expected 1 page, got ${info.pageCount}`);
  });
});
