import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderPracticalCompletionReportHtml } from "../src/estimate/practical-completion-report-template.js";
import { renderSpecificationHtml } from "../src/estimate/specification-template.js";
import { formatPhotoCircledNumber } from "../src/estimate/practical-pdf-layout.js";
import { renderEstimateHtml } from "../src/business/pdf/estimate-template.js";
import { renderInvoiceHtml } from "../src/business/pdf/invoice-template.js";
import { resolveTomsBankInfo } from "../src/business/toms-document-format.js";

const baseProject = {
  id: "p1",
  projectNo: "PRJ-2026-0099",
  customerId: "c1",
  customerName: "テスト顧客",
  title: "テスト案件",
  address: "東京都",
  phone: "",
  status: "estimate_created",
  surveySchedule: null,
  surveyMemo: "Google予定から自動生成 / PWA連携",
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
  createdAt: "2026-06-13T00:00:00.000Z",
  updatedAt: "2026-06-13T00:00:00.000Z",
};

const baseEstimate = {
  id: "e1",
  projectId: "p1",
  estimateNo: "260613-001",
  title: "テスト案件",
  customerName: "テスト顧客",
  items: [{ id: "1", category: "other", name: "作業", unit: "式", quantity: 1, unitPrice: 10000, amount: 10000 }],
  lineSubtotal: 10000,
  shuseiDiscount: 0,
  shuseiDiscountMemo: "",
  subtotal: 10000,
  tax: 1000,
  total: 11000,
  header: {
    addressee: "テスト顧客",
    subject: "テスト案件",
    issueDate: "2026/06/13",
    estimateNo: "260613-001",
    staffName: "山中 智紀",
    workLocation: "東京都",
  },
  createdAt: "2026-06-13T00:00:00.000Z",
  updatedAt: "2026-06-13T00:00:00.000Z",
};

describe("お客様向けPDFコンテンツ", () => {
  it("見積書にインボイス番号を出さない", () => {
    const html = renderEstimateHtml(baseProject, baseEstimate);
    assert.ok(!html.includes("インボイス番号"));
    assert.ok(!html.includes("Google予定"));
  });

  it("請求書の振込先名義はトムズ", () => {
    const invoice = {
      id: "i1",
      projectId: "p1",
      invoiceNo: "260613-002",
      title: "テスト案件",
      customerName: "テスト顧客",
      items: baseEstimate.items,
      subtotal: 10000,
      tax: 1000,
      total: 11000,
      bankInfo: "常陽銀行 越谷支店\n普通 1370414\nトムス",
      createdAt: "2026-06-13T00:00:00.000Z",
      updatedAt: "2026-06-13T00:00:00.000Z",
    };
    const html = renderInvoiceHtml(baseProject, invoice, baseEstimate);
    assert.match(html, /トムズ/);
    assert.match(html, /登録番号/);
    assert.equal(resolveTomsBankInfo("常陽銀行 越谷支店\n普通 1370414\nトムス"), "常陽銀行 越谷支店\n普通 1370414\nトムズ");
  });

  it("仕様書は最低限フィールドと写真のみ", () => {
    const html = renderSpecificationHtml({
      projectNo: "PRJ-2026-0099",
      addressee: "テスト顧客",
      subject: "テスト案件",
      siteName: "テスト現場",
      workLocation: "東京都",
      issueDate: "2026/06/13",
      staffName: "山中 智紀",
      generatedAt: "2026-06-13T12:00:00+09:00",
      systemConfig: "内部構成",
      installationLocations: "設置場所",
      notes: "Google予定から自動生成",
      photos: [{ url: "/p.jpg", title: "写真1" }],
    });
    assert.match(html, /仕様書/);
    assert.doesNotMatch(html, /システム仕様書/);
    assert.match(html, /写真1/);
    assert.ok(!html.includes("システム構成"));
    assert.ok(!html.includes("設置場所一覧"));
    assert.ok(!html.includes("Google予定"));
  });

  it("写真ページは左上から①②順・2列×3段", () => {
    const photos = Array.from({ length: 4 }, (_, i) => ({
      url: `/p${i + 1}.jpg`,
      title: `現場${i + 1}`,
    }));
    const html = renderSpecificationHtml({
      projectNo: "PRJ-2026-0099",
      addressee: "テスト",
      subject: "案件",
      siteName: "現場",
      workLocation: "東京都",
      issueDate: "2026/06/13",
      staffName: "担当",
      generatedAt: "2026-06-13T12:00:00+09:00",
      photos,
    });
    assert.match(html, /①/);
    assert.match(html, /②/);
    assert.match(html, /③/);
    assert.match(html, /④/);
    assert.match(html, /object-fit: cover/);
    assert.equal(formatPhotoCircledNumber(1), "①");
    assert.equal(formatPhotoCircledNumber(6), "⑥");
  });

  it("完了報告書から作業時間・部材・確認結果を除く", () => {
    const html = renderPracticalCompletionReportHtml({
      projectNo: "PRJ-2026-0099",
      addressee: "テスト顧客",
      subject: "テスト案件",
      siteName: "テスト現場",
      workLocation: "東京都",
      issueDate: "2026/06/13",
      workDate: "2026/06/13",
      staffName: "山中 智紀",
      startTime: "09:00",
      endTime: "17:00",
      workContent: "設置作業を実施",
      materialsUsed: "ケーブル",
      checklistSummary: "確認済",
      notes: "社内メモ",
      generatedAt: "2026-06-13T12:00:00+09:00",
      photos: [],
    });
    assert.match(html, /工事完了報告書/);
    assert.match(html, /作業内容/);
    assert.match(html, /設置作業を実施/);
    assert.match(html, /cr-cover-photo-grid/);
    assert.equal((html.match(/class="cr-photo-cell(?:\s|")/g) || []).length, 6);
    assert.ok(!html.includes('class="cr-cover-section"'));
    assert.ok(!html.includes("開始時間"));
    assert.ok(!html.includes("終了時間"));
    assert.ok(!html.includes("使用部材"));
    assert.ok(!html.includes("確認結果"));
  });
});
