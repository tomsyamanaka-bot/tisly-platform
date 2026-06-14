import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderEstimateHtmlV2 } from "../src/business/pdf/estimate-template-v2.js";
import { renderInvoiceHtmlV2 } from "../src/business/pdf/invoice-template-v2.js";
import { splitTomsV2Addressee } from "../src/business/pdf/toms-excel-doc-layout-v2.js";

const baseProject = {
  id: "p1",
  projectNo: "PRJ-2026-0099",
  customerId: "c1",
  customerName: "金剛",
  title: "防犯カメラ工事",
  address: "茨城県",
  phone: "",
  status: "estimate_created",
  surveySchedule: null,
  surveyMemo: "テスト備考",
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
  title: "防犯カメラ工事",
  customerName: "金剛",
  items: [
    {
      id: "1",
      category: "other",
      name: "カメラ設置",
      memo: "TP-LINK",
      unit: "式",
      quantity: 1,
      unitPrice: 210000,
      amount: 210000,
    },
  ],
  lineSubtotal: 210000,
  shuseiDiscount: 0,
  shuseiDiscountMemo: "",
  subtotal: 210000,
  tax: 21000,
  total: 231000,
  header: {
    addressee: "金剛",
    subject: "金剛様邸 防犯カメラ工事",
    issueDate: "2026/06/14",
    estimateNo: "260613-001",
    staffName: "山中 智紀",
    workLocation: "茨城県",
  },
  createdAt: "2026-06-13T00:00:00.000Z",
  updatedAt: "2026-06-13T00:00:00.000Z",
};

describe("TOMS Excel layout v2 templates", () => {
  it("splitTomsV2Addressee は個人名に様・法人名に御中", () => {
    assert.deepEqual(splitTomsV2Addressee("富塚"), { name: "富塚", honorific: "様" });
    assert.deepEqual(splitTomsV2Addressee("株式会社 伝元"), {
      name: "株式会社 伝元",
      honorific: "御中",
    });
  });

  it("見積書 v2 は Excel 帳票風クラスと黒枠を含む", () => {
    const html = renderEstimateHtmlV2(baseProject, baseEstimate);
    assert.match(html, /お見積書/);
    assert.match(html, /toms-v2-frame/);
    assert.match(html, /toms-v2-title-band/);
    assert.match(html, /toms-v2-items/);
    assert.match(html, />摘要</);
    assert.match(html, /#e6f2ff/);
    assert.match(html, /下記の通り、お見積り申し上げます。/);
    assert.match(html, /Page 1 \/ 1/);
    assert.match(html, /toms-seal/);
    assert.ok(!html.includes("インボイス番号"));
  });

  it("請求書 v2 は振込口座・税率内訳・登録番号を含む", () => {
    const invoice = {
      id: "i1",
      projectId: "p1",
      invoiceNo: "260613-002",
      title: "防犯カメラ工事",
      customerName: "株式会社 伝元",
      items: baseEstimate.items,
      subtotal: 210000,
      tax: 21000,
      total: 231000,
      bankInfo: "常陽銀行 越谷支店\n普通 1370414\nトムズ",
      createdAt: "2026-06-13T00:00:00.000Z",
      updatedAt: "2026-06-13T00:00:00.000Z",
    };
    const html = renderInvoiceHtmlV2(baseProject, invoice, baseEstimate);
    assert.match(html, /御請求書/);
    assert.match(html, /振込口座/);
    assert.match(html, /税率内訳/);
    assert.match(html, /登録番号/);
    assert.match(html, /施工場所/);
    assert.match(html, /下記の通り、御請求申し上げます。/);
    assert.match(html, /＜備考＞/);
  });
});
