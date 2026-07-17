import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderEstimateHtml } from "../src/business/pdf/estimate-template.js";
import { htmlToPdfBuffer } from "../src/business/pdf/render.js";
import { analyzePdfBuffer } from "../src/business/pdf/pdf-validation.js";

const project = {
  id: "p1",
  projectNo: "PRJ-2026-0099",
  customerId: "c1",
  customerName: "金剛株式会社テスト顧客名やや長め",
  title: "防犯カメラ工事",
  address: "茨城県守谷市中央一丁目1番地1 マンション名101号室",
  phone: "",
  status: "estimate_created",
  surveySchedule: null,
  surveyMemo:
    "備考1: 既設配線流用可否は現地確認\n備考2: 電源工事は別途\n備考3: 保証は機器1年・工事1年",
  surveyPhotos: [],
  estimateId: "e1",
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
  createdAt: "2026-06-13T00:00:00.000Z",
  updatedAt: "2026-06-13T00:00:00.000Z",
} as const;

function buildEstimate(itemCount: number) {
  const items = Array.from({ length: itemCount }, (_, i) => ({
    id: String(i + 1),
    category: "other" as const,
    name: `防犯カメラ設置・調整・配線工事（屋外／屋内）${i + 1}`,
    memo: i % 2 === 0 ? "TP-LINK PoE対応・取付金具含む" : "ケーブル延長あり",
    unit: "式",
    quantity: 1 + (i % 3),
    unitPrice: 21000 + i * 1500,
    amount: (21000 + i * 1500) * (1 + (i % 3)),
  }));
  const lineSubtotal = items.reduce((s, x) => s + x.amount, 0);
  const shuseiDiscount = 10000;
  const subtotal = lineSubtotal - shuseiDiscount;
  const tax = Math.round(subtotal * 0.1);
  return {
    id: "e1",
    projectId: "p1",
    estimateNo: "260613-001",
    title: "防犯カメラ工事",
    customerName: project.customerName,
    items,
    lineSubtotal,
    shuseiDiscount,
    shuseiDiscountMemo: "セット割引",
    subtotal,
    tax,
    total: subtotal + tax,
    header: {
      addressee: project.customerName,
      subject: "金剛様邸 防犯カメラ・録画装置一式工事のお見積り",
      issueDate: "2026/06/14",
      estimateNo: "260613-001",
      staffName: "山中 智紀",
      workLocation: project.address,
    },
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
  };
}

describe("見積書 PDF 1ページ最適化", () => {
  it("HTML は余白・行高・改ページ回避を含む", () => {
    const html = renderEstimateHtml(project as any, buildEstimate(12) as any);
    assert.match(html, /margin:\s*5mm/);
    assert.match(html, /height:\s*5\.5mm/);
    assert.match(html, /page-break-inside:\s*avoid/);
    assert.match(html, /Page 1 \/ 1/);
    assert.equal((html.match(/class="toms-v2-page"/g) || []).length, 1);
  });

  it("明細18行まで Puppeteer PDF は 1 ページ", async () => {
    if (process.env.TISLY_PDF_PUPPETEER === "false") return;
    const html = renderEstimateHtml(project as any, buildEstimate(18) as any);
    const buf = await htmlToPdfBuffer(html);
    assert.ok(buf, "puppeteer should produce buffer");
    const analysis = analyzePdfBuffer(buf);
    assert.equal(analysis.valid, true, JSON.stringify(analysis));
    assert.equal(analysis.pageCount, 1, `expected 1 page, got ${analysis.pageCount}`);
  });
});
