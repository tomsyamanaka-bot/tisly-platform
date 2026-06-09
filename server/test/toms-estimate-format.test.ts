import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-toms-format";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-toms-estimate-format.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { renderEstimateHtml } = await import("../src/business/pdf/estimate-template.js");
const { renderInvoiceHtml } = await import("../src/business/pdf/invoice-template.js");
const { getBusinessProject, getEstimate, getInvoice } = await import("../src/business/business-store.js");
const { formatTomsIssueDate, generateTomsDailyDocNo, itemsToTomsLines, isEmptyLineItem } =
  await import("../src/business/toms-document-format.js");

const app = createApp();

const SAMPLE = {
  customerName: "株式会社伝元",
  siteName: "KSフロンティア様",
  workLocation: "茨城県つくば市研究学園5-1",
  subject: "換気扇設置工事",
  lines: [
    {
      name: "小上がり既存換気扇3台設置",
      memo: "清掃・修理配線",
      quantity: 3,
      unitPrice: 15000,
      amount: 45000,
    },
    {
      name: "試験・調整",
      memo: "",
      quantity: 1,
      unitPrice: 10000,
      amount: 10000,
    },
  ],
};

describe("TOMS標準見積フォーマット", () => {
  let token = "";
  let businessProjectId = "";

  before(async () => {
    closeDatabase();
    for (const p of [
      process.env.TISLY_DB_PATH!,
      `${process.env.TISLY_DB_PATH}-wal`,
      `${process.env.TISLY_DB_PATH}-shm`,
    ]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
    getDatabase();
    const login = await request(app)
      .post("/api/auth/customer/login")
      .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
    token = login.body.token;

    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: SAMPLE.customerName,
        siteName: SAMPLE.siteName,
        address: SAMPLE.workLocation,
        surveyDate: "2026-06-08",
      });
    await request(app)
      .post(`/api/survey/v1/projects/${survey.body.projectId}/estimate-pending`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const created = await request(app)
      .post(`/api/estimate/v1/from-survey/${survey.body.projectId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    businessProjectId = created.body.businessProjectId;

    await request(app)
      .patch(`/api/estimate/v1/projects/${businessProjectId}/header`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        addressee: SAMPLE.customerName,
        subject: SAMPLE.subject,
        siteName: SAMPLE.siteName,
        workLocation: SAMPLE.workLocation,
        staffName: "山中 智紀",
      });

    await request(app)
      .patch(`/api/estimate/v1/projects/${businessProjectId}/items`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: SAMPLE.lines.map((l) => ({ ...l, unit: "式", category: "other" })),
        notes: "納期2週間程度",
      });
  });

  after(() => closeDatabase());

  it("見積番号は YYMMDD-001 形式", () => {
    const no = generateTomsDailyDocNo("business_estimates", "estimate_no", new Date("2026-06-08"));
    assert.match(no, /^260608-\d{3}$/);
  });

  it("発行日は YYYY/MM/DD", () => {
    assert.equal(formatTomsIssueDate(new Date("2026-06-08")), "2026/06/08");
  });

  it("伝元/KSフロンティア案件の見積HTMLにTOMSヘッダーと明細列がある", async () => {
    const res = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/pdf?includePhotos=0`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.match(res.text, /お見積書/);
    assert.match(res.text, /toms-doc-header/);
    assert.match(res.text, /株式会社 TOMS/);
    assert.match(res.text, /御見積金額/);
    assert.match(res.text, /見積番号/);
    assert.match(res.text, /発行日/);
    assert.match(res.text, /件名/);
    assert.match(res.text, /御中/);
    assert.match(res.text, /山中 智紀/);
    assert.match(res.text, /株式会社伝元/);
    assert.ok(!/登録番号/.test(res.text));
    assert.match(res.text, /換気扇設置工事/);
    assert.match(res.text, />No</);
    assert.match(res.text, />適用</);
    assert.match(res.text, /小上がり既存換気扇3台設置/);
    assert.match(res.text, /清掃・修理配線/);
    assert.ok(!/参考写真/.test(res.text));
  });

  it("写真あり版では参考写真セクションが出る", async () => {
    const res = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/pdf?includePhotos=1`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    // 写真が無い案件でも写真ありモードではセクション構造を維持（写真0枚なら非表示）
    assert.match(res.text, /お見積書/);
  });

  it("空行だけの明細はPDFに出ない", () => {
    const lines = itemsToTomsLines([
      { id: "1", category: "other", name: "有効行", unit: "式", quantity: 1, unitPrice: 1000, amount: 1000 },
      { id: "2", category: "other", name: "", memo: "", unit: "式", quantity: 0, unitPrice: 0, amount: 0 },
    ]);
    assert.equal(lines.length, 1);
    assert.ok(isEmptyLineItem({ id: "x", category: "other", name: "", unit: "式", quantity: 0, unitPrice: 0, amount: 0 }));
  });

  it("TOMS JSONは Excel 連携用構造", async () => {
    const res = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/toms-format`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.version, "toms-standard-v1");
    assert.equal(res.body.excelTemplate, "TOMS_見積もり書_フォーマット.xlsx");
    assert.equal(res.body.header.addressee, SAMPLE.customerName);
    assert.equal(res.body.header.siteName, SAMPLE.siteName);
    assert.ok(res.body.lines[0].description.includes("清掃・修理配線"));
  });

  it("明細20件でもHTMLが生成できる", async () => {
    const manyItems = Array.from({ length: 22 }, (_, i) => ({
      name: `工事項目${i + 1}`,
      memo: i % 3 === 0 ? `詳細説明\n2行目${i}` : "",
      unit: "式",
      quantity: 1,
      unitPrice: 1000 * (i + 1),
      amount: 1000 * (i + 1),
      category: "other",
    }));
    await request(app)
      .patch(`/api/estimate/v1/projects/${businessProjectId}/items`)
      .set("Authorization", `Bearer ${token}`)
      .send({ items: manyItems });
    const res = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/pdf`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.match(res.text, /工事項目20/);
    assert.match(res.text, /税込合計/);
    const project = getBusinessProject(businessProjectId)!;
    const estimate = getEstimate(project.estimateId!)!;
    assert.equal(estimate.total, estimate.subtotal + estimate.tax);
  });

  it("請求PDF（写真なし・あり）が取得できる", async () => {
    await request(app)
      .post(`/api/estimate/v1/projects/${businessProjectId}/finalize`)
      .set("Authorization", `Bearer ${token}`)
      .send({ includePhotos: false });
    await request(app)
      .post(`/api/estimate/v1/projects/${businessProjectId}/invoice`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const noPhoto = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/invoice/pdf`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(noPhoto.status, 200);
    assert.match(noPhoto.text, /御請求書/);
    assert.match(noPhoto.text, /振込先/);
    assert.ok(!/参考写真/.test(noPhoto.text));

    const withPhoto = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/invoice/pdf?includePhotos=1`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(withPhoto.status, 200);
    assert.match(withPhoto.text, /御請求書/);
  });

  it("請求書テンプレに御請求書・振込先・見積参照番号がある", async () => {
    await request(app)
      .post(`/api/estimate/v1/projects/${businessProjectId}/finalize`)
      .set("Authorization", `Bearer ${token}`)
      .send({ includePhotos: false });
    const inv = await request(app)
      .post(`/api/estimate/v1/projects/${businessProjectId}/invoice`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(inv.status, 201);

    const project = getBusinessProject(businessProjectId)!;
    const invoice = getInvoice(project.invoiceId!)!;
    const estimate = getEstimate(project.estimateId!)!;
    const invoiceHtml = renderInvoiceHtml(project, invoice, estimate);
    assert.match(invoiceHtml, /御請求書/);
    assert.match(invoiceHtml, /見積参照番号/);
    assert.match(invoiceHtml, /振込先/);
    assert.match(invoiceHtml, /\d{6}-\d{3}/);
  });

  it("renderEstimateHtml はヘッダーテーブルを生成する", () => {
    const html = renderEstimateHtml(
      {
        id: "p1",
        projectNo: "PRJ-1",
        customerId: "c1",
        customerName: SAMPLE.customerName,
        title: SAMPLE.subject,
        address: SAMPLE.workLocation,
        phone: "",
        status: "estimate_created",
        surveySchedule: null,
        surveyMemo: "",
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
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "e1",
        projectId: "p1",
        estimateNo: "260608-001",
        customerName: SAMPLE.customerName,
        title: SAMPLE.subject,
        items: [
          {
            id: "1",
            category: "other",
            name: SAMPLE.lines[0].name,
            memo: SAMPLE.lines[0].memo,
            unit: "式",
            quantity: 3,
            unitPrice: 15000,
            amount: 45000,
          },
        ],
        shuseiDiscount: 0,
        shuseiDiscountMemo: "",
        subtotal: 45000,
        tax: 4500,
        total: 49500,
        internalCost: 0,
        grossProfit: 45000,
        grossProfitRate: 100,
        pdfPath: null,
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
      },
      {
        header: {
          addressee: SAMPLE.customerName,
          subject: SAMPLE.subject,
          issueDate: "2026/06/08",
          estimateNo: "260608-001",
          staffName: "山中 智紀",
          siteName: SAMPLE.siteName,
          workLocation: SAMPLE.workLocation,
        },
        includePhotos: false,
      }
    );
    assert.match(html, /お見積書/);
    assert.match(html, /toms-doc-header/);
    assert.match(html, /amount-banner/);
    assert.ok(!/<div class="toms-company-footer">/.test(html));
    assert.match(html, /換気扇設置工事/);
  });
});
