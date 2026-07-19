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
const { formatTomsIssueDate, generateProjectScopedDocNo, itemsToTomsLines, isEmptyLineItem } =
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

  it("見積番号は案件番号-001形式", () => {
    const no = generateProjectScopedDocNo("MO-26-0616", "business_estimates", "estimate_no");
    assert.equal(no, "MO-26-0616-001");
  });

  it("発行日は YYYY/MM/DD", () => {
    assert.equal(formatTomsIssueDate(new Date("2026-06-08")), "2026/06/08");
  });

  it("ヘッダー発行日を変更すると見積HTMLに YYYY/MM/DD で反映される", async () => {
    const patch = await request(app)
      .patch(`/api/estimate/v1/projects/${businessProjectId}/header`)
      .set("Authorization", `Bearer ${token}`)
      .send({ issueDate: "2026-07-20" });
    assert.equal(patch.status, 200, JSON.stringify(patch.body));
    assert.equal(patch.body.header.issueDate, "2026/07/20");

    const res = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/pdf?format=html&includePhotos=0&regenerate=1`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.match(res.text, /2026\/07\/20/);
  });

  it("請求日を変更すると請求HTMLの発行日に YYYY/MM/DD で反映される", async () => {
    const invCreate = await request(app)
      .post(`/api/estimate/v1/projects/${businessProjectId}/invoice`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.ok([200, 201].includes(invCreate.status), JSON.stringify(invCreate.body));

    const patch = await request(app)
      .patch(`/api/estimate/v1/projects/${businessProjectId}/header`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        issueDate: "2026-07-01",
        invoiceDate: "2026-07-15",
        paymentDueDate: "2026-08-15",
      });
    assert.equal(patch.status, 200, JSON.stringify(patch.body));

    const res = await request(app)
      .get(
        `/api/estimate/v1/projects/${businessProjectId}/invoice/pdf?format=html&includePhotos=0&regenerate=1`
      )
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.match(res.text, /発行日/);
    assert.match(res.text, /2026\/07\/15/);
    assert.ok(!res.text.includes("2026/07/01"), "請求日が発行日より優先されること");
    assert.match(res.text, /2026\/08\/15/);
  });

  it("伝元/KSフロンティア案件の見積HTMLにTOMSヘッダーと明細列がある", async () => {
    const res = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/pdf?format=html&includePhotos=0`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.match(res.text, /お見積書/);
    assert.match(res.text, /toms-v2/);
    assert.match(res.text, /株式会社TOMS/);
    assert.match(res.text, /金額/);
    assert.match(res.text, /見積番号/);
    assert.match(res.text, /発行日/);
    assert.ok(!/インボイス番号/.test(res.text));
    assert.match(res.text, /件名/);
    assert.match(res.text, /施工場所/);
    assert.match(res.text, /御中/);
    assert.match(res.text, /山中/);
    assert.ok(!/税率内訳/.test(res.text));
    assert.match(res.text, /株式会社伝元/);
    assert.ok(!/toms-v2-addressee-line/.test(res.text));
    assert.match(res.text, /toms-v2-addressee-row/);
    assert.match(res.text, /\.toms-v2-addressee-row[\s\S]*border-bottom:\s*1px solid #000/);
    assert.ok(!/登録番号/.test(res.text));
    assert.match(res.text, /換気扇設置工事/);
    assert.match(res.text, />No</);
    assert.match(res.text, />摘要</);
    assert.match(res.text, /小上がり既存換気扇3台設置/);
    assert.match(res.text, /清掃・修理配線/);
    assert.ok(!/参考写真/.test(res.text));
    assert.ok(!/振込口座/.test(res.text));
    assert.match(res.text, /有効期限/);
    assert.match(res.text, /担当/);
    assert.match(res.text, /toms-v2-frame/);
    assert.match(res.text, /Page 1 \/ 1/);
    assert.match(res.text, /案件番号/);
    const project = getBusinessProject(businessProjectId)!;
    assert.ok(
      project.projectNo.trim().length > 0 && res.text.includes(project.projectNo),
      `見積HTMLに案件番号 ${project.projectNo} が含まれること`
    );
  });

  it("includePhotos=1 でも見積書に写真レイアウトは出ない", async () => {
    const res = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/pdf?format=html&includePhotos=1`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.match(res.text, /お見積書/);
    assert.ok(!/est-cover-photo-grid/.test(res.text));
    assert.ok(!/est-photo-cell/.test(res.text));
    assert.match(res.text, />摘要</);
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
      .get(`/api/estimate/v1/projects/${businessProjectId}/pdf?format=html`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.match(res.text, /工事項目20/);
    assert.match(res.text, /税込合計/);
    const project = getBusinessProject(businessProjectId)!;
    const estimate = getEstimate(project.estimateId!)!;
    assert.equal(estimate.total, estimate.subtotal + estimate.tax);
  });

  it("請求PDFは写真なしで取得できる", async () => {
    await request(app)
      .post(`/api/estimate/v1/projects/${businessProjectId}/finalize`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    await request(app)
      .post(`/api/estimate/v1/projects/${businessProjectId}/invoice`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const noPhoto = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/invoice/pdf?format=html&live=1`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(noPhoto.status, 200);
    assert.match(noPhoto.text, /御請求書/);
    assert.match(noPhoto.text, /振込口座/);
    assert.match(noPhoto.text, /常陽銀行/);
    assert.match(noPhoto.text, /支払期限/);
    assert.match(noPhoto.text, /担当/);
    assert.ok(!/参考写真/.test(noPhoto.text));
    assert.ok(!/inv-photo-cell/.test(noPhoto.text));

    const withPhotoQuery = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/invoice/pdf?format=html&includePhotos=1&live=1`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(withPhotoQuery.status, 200);
    assert.match(withPhotoQuery.text, /御請求書/);
    assert.ok(!/inv-photo-cell/.test(withPhotoQuery.text));
  });

  it("請求書テンプレに御請求書・振込先・見積参照番号がある", async () => {
    await request(app)
      .post(`/api/estimate/v1/projects/${businessProjectId}/finalize`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
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
    assert.match(invoiceHtml, /toms-v2/);
    assert.match(invoiceHtml, /金額/);
    assert.match(invoiceHtml, /振込口座/);
    assert.match(invoiceHtml, /常陽銀行 越谷支店/);
    assert.match(invoiceHtml, /トムズ/);
    assert.match(invoiceHtml, /登録番号/);
    assert.match(invoiceHtml, /支払期限/);
    assert.match(invoiceHtml, /担当/);
    assert.match(invoiceHtml, /税率内訳/);
    assert.match(invoiceHtml, /案件番号/);
    assert.ok(
      project.projectNo.trim().length > 0 && invoiceHtml.includes(project.projectNo),
      `請求書HTMLに案件番号 ${project.projectNo} が含まれること`
    );
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
      }
    );
    assert.match(html, /お見積書/);
    assert.match(html, /toms-v2/);
    assert.match(html, /toms-v2-amount-value/);
    assert.ok(!/<div class="toms-company-footer">/.test(html));
    assert.match(html, /換気扇設置工事/);
  });

  it("renderEstimateHtml の明細テーブルはA4縦レイアウト", () => {
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
            name: "防犯カメラ設置工事一式",
            memo: "",
            unit: "式",
            quantity: 1,
            unitPrice: 150000,
            amount: 150000,
          },
        ],
        shuseiDiscount: 0,
        shuseiDiscountMemo: "",
        subtotal: 150000,
        tax: 15000,
        total: 165000,
        internalCost: 0,
        grossProfit: 150000,
        grossProfitRate: 100,
        pdfPath: null,
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
      },
      {}
    );
    assert.match(html, /toms-v2-items/);
    assert.match(html, /word-break:\s*keep-all/);
    assert.match(html, /charset=.UTF-8/);
    assert.match(html, /Noto Sans JP/);
    assert.ok(!html.includes("@media screen and (max-width:520px)"));
    assert.match(html, /width=device-width/);
    assert.match(html, /size: A4 portrait/);
    assert.match(html, /防犯カメラ設置工事一式/);
    assert.ok(!/振込口座/.test(html));
  });

  it("????? 破損テキストはPDFに出さない", () => {
    const html = renderEstimateHtml(
      {
        id: "p1",
        projectNo: "PRJ-1",
        customerId: "c1",
        customerName: "?????",
        title: "?????",
        address: "茨城県",
        phone: "",
        status: "estimate_created",
        surveySchedule: null,
        surveyMemo: "?????",
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
        estimateNo: "260613-001",
        customerName: "?????",
        title: "?????",
        items: [
          {
            id: "1",
            category: "other",
            name: "?????",
            memo: "",
            unit: "式",
            quantity: 1,
            unitPrice: 1000,
            amount: 1000,
          },
          {
            id: "2",
            category: "other",
            name: "正常な項目",
            memo: "",
            unit: "式",
            quantity: 1,
            unitPrice: 2000,
            amount: 2000,
          },
        ],
        shuseiDiscount: 0,
        shuseiDiscountMemo: "",
        subtotal: 2000,
        tax: 200,
        total: 2200,
        internalCost: 0,
        grossProfit: 2000,
        grossProfitRate: 100,
        pdfPath: null,
        createdAt: "2026-06-13T00:00:00.000Z",
        updatedAt: "2026-06-13T00:00:00.000Z",
      },
      { notes: "?????" }
    );
    assert.ok(!html.includes("?????"));
    assert.match(html, /未設定/);
    assert.match(html, /作業一式/);
    assert.match(html, /正常な項目/);
    assert.ok(!html.includes("〈備考〉"));
  });

  it("請求PDFも ????? を除去する", () => {
    const project = {
      id: "p1",
      projectNo: "PRJ-1",
      customerId: "c1",
      customerName: "?????",
      title: "?????",
      address: "茨城県",
      phone: "",
      status: "invoice_created",
      surveySchedule: null,
      surveyMemo: "",
      surveyPhotos: [],
      estimateId: "e1",
      constructionSchedule: null,
      requiredMaterials: "",
      constructionMemo: "",
      completionReportId: null,
      invoiceId: "i1",
      paymentDueDate: null,
      paidDate: null,
      qnapBasePath: "",
      surveyProjectId: null,
      createdAt: "",
      updatedAt: "",
    };
    const estimate = {
      id: "e1",
      projectId: "p1",
      estimateNo: "260613-001",
      customerName: "?????",
      title: "?????",
      items: [],
      shuseiDiscount: 0,
      shuseiDiscountMemo: "",
      subtotal: 1000,
      tax: 100,
      total: 1100,
      internalCost: 0,
      grossProfit: 1000,
      grossProfitRate: 100,
      pdfPath: null,
      createdAt: "2026-06-13T00:00:00.000Z",
      updatedAt: "2026-06-13T00:00:00.000Z",
    };
    const invoice = {
      id: "i1",
      projectId: "p1",
      invoiceNo: "260613-001",
      customerName: "?????",
      title: "?????",
      items: [
        {
          id: "1",
          category: "other",
          name: "正常な請求項目",
          memo: "",
          unit: "式",
          quantity: 1,
          unitPrice: 1000,
          amount: 1000,
        },
      ],
      subtotal: 1000,
      tax: 100,
      total: 1100,
      bankInfo: "?????",
      pdfPath: null,
      createdAt: "2026-06-13T00:00:00.000Z",
      updatedAt: "2026-06-13T00:00:00.000Z",
    };
    const html = renderInvoiceHtml(project, invoice, estimate);
    assert.ok(!html.includes("?????"));
    assert.match(html, /正常な請求項目/);
    assert.match(html, /常陽銀行 越谷支店/);
    assert.match(html, /振込口座/);
  });
});
