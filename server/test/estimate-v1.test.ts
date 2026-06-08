import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-estimate-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-estimate-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("見積PWA v1 API", () => {
  let token = "";
  let surveyProjectId = "";
  let businessProjectId = "";

  before(async () => {
    closeDatabase();
    const dbPath = process.env.TISLY_DB_PATH!;
    for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
    getDatabase();
    const login = await surveyorLogin();
    assert.equal(login.status, 200, login.body?.error);
    token = login.body.token;

    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "見積テスト顧客",
        address: "大阪府大阪市",
        surveyDate: "2026-06-08",
      });
    surveyProjectId = survey.body.projectId;

    await request(app)
      .post(`/api/survey/v1/projects/${surveyProjectId}/materials`)
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "camera", itemLabel: "屋外カメラ", quantity: 2 });

    await request(app)
      .post(`/api/survey/v1/projects/${surveyProjectId}/estimate-pending`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
  });

  after(() => closeDatabase());

  it("見積待ち一覧を取得できる", async () => {
    const res = await request(app)
      .get("/api/estimate/v1/pending-surveys?customerCode=TOMS001")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.surveys.some((s: { surveyProjectId: string }) => s.surveyProjectId === surveyProjectId));
  });

  it("現調案件から見積を作成できる（部材シード）", async () => {
    const res = await request(app)
      .post(`/api/estimate/v1/from-survey/${surveyProjectId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(res.status, 201);
    assert.ok(res.body.businessProjectId);
    assert.ok(res.body.estimate);
    assert.ok(res.body.estimate.items.length >= 1);
    assert.match(res.body.estimate.estimateNo, /^\d{6}-\d{3}$/);
    businessProjectId = res.body.businessProjectId;

    const handoff = getDatabase()
      .prepare(`SELECT business_project_id FROM survey_handoff_log WHERE survey_project_id = ?`)
      .get(surveyProjectId) as { business_project_id: string };
    assert.equal(handoff.business_project_id, businessProjectId);
  });

  it("見積明細を更新し税込計算できる", async () => {
    const detail = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}`)
      .set("Authorization", `Bearer ${token}`);
    const items = detail.body.estimate.items.map((it: { name: string; category: string; unit: string; quantity: number; unitPrice: number }) => ({
      ...it,
      unitPrice: 50000,
      amount: 50000 * it.quantity,
    }));
    const res = await request(app)
      .patch(`/api/estimate/v1/projects/${businessProjectId}/items`)
      .set("Authorization", `Bearer ${token}`)
      .send({ items });
    assert.equal(res.status, 200);
    assert.ok(res.body.totals.subtotal > 0);
    assert.equal(res.body.totals.tax, Math.round(res.body.totals.subtotal * 0.1));
    assert.equal(res.body.totals.total, res.body.totals.subtotal + res.body.totals.tax);
  });

  it("見積を確定してPDFパスを取得できる", async () => {
    const res = await request(app)
      .post(`/api/estimate/v1/projects/${businessProjectId}/finalize`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(res.status, 200);
    assert.ok(res.body.pdfPath);
    assert.equal(res.body.surveyWorkflowStatus, "estimate_done");

    const survey = await request(app)
      .get(`/api/survey/v1/projects/${surveyProjectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(survey.body.workflowStatus, "estimate_done");
  });

  it("TOMSフォーマットプレビューを取得できる", async () => {
    const res = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/toms-format`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.version, "toms-standard-v1");
    assert.ok(Array.isArray(res.body.lines));
  });

  it("PDFプレビューはJWT（Bearer）で取得できる", async () => {
    const res = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/pdf`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    const ct = String(res.headers["content-type"] || "");
    assert.ok(ct.includes("pdf") || ct.includes("html"));
    if (ct.includes("html")) {
      assert.ok(res.text.includes("お見積書"));
      assert.ok(res.text.includes("株式会社 TOMS"));
      assert.ok(res.text.includes("適用"));
      assert.ok(!res.text.includes("T-2030001139320"));
      assert.ok(!res.text.includes("登録番号"));
    } else {
      assert.ok(Buffer.isBuffer(res.body) ? res.body.length > 50 : true);
    }
  });

  it("PDFプレビューはaccess_tokenクエリでも取得できる", async () => {
    const res = await request(app).get(
      `/api/estimate/v1/projects/${businessProjectId}/pdf?access_token=${encodeURIComponent(token)}`
    );
    assert.equal(res.status, 200);
  });

  it("見積項目を複数行追加・更新できる", async () => {
    const items = [
      { name: "防犯カメラ設置", unit: "台", quantity: 2, unitPrice: 30000, amount: 60000, category: "camera" },
      { name: "配線工事", unit: "式", quantity: 1, unitPrice: 50000, amount: 50000, category: "other" },
      { name: "試験・調整", unit: "式", quantity: 1, unitPrice: 10000, amount: 10000, category: "other" },
    ];
    const res = await request(app)
      .patch(`/api/estimate/v1/projects/${businessProjectId}/items`)
      .set("Authorization", `Bearer ${token}`)
      .send({ items, notes: "納期2週間程度" });
    assert.equal(res.status, 200);
    assert.equal(res.body.estimate.items.length, 3);
    assert.equal(res.body.totals.subtotal, 120000);
  });

  it("確定前でもPDFプレビュー（HTML）が返る", async () => {
    const survey2 = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "ドラフトPDF顧客",
        siteName: "ドラフト現場",
        address: "東京都",
      });
    await request(app)
      .post(`/api/survey/v1/projects/${survey2.body.projectId}/estimate-pending`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const draft = await request(app)
      .post(`/api/estimate/v1/from-survey/${survey2.body.projectId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const res = await request(app)
      .get(`/api/estimate/v1/projects/${draft.body.businessProjectId}/pdf`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("お見積書") || res.text.includes("小計"));
  });

  it("GET /estimate-v1 ページを配信できる", async () => {
    const res = await request(app).get("/estimate-v1");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("見積を確定") || res.text.includes("TiSLY — 見積"));
    assert.ok(res.text.includes("社内用データを確認"));
    assert.ok(res.text.includes("完了報告書を開く"));
    assert.ok(res.text.includes("見積を複製"));
    assert.ok(!res.text.includes("写真付き"));
    assert.ok(res.text.includes("工事場所"));
    assert.ok(!res.text.includes("現場名"));
  });

  it("見積を複製すると見積番号だけ再発番される", async () => {
    const before = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}`)
      .set("Authorization", `Bearer ${token}`);
    const oldNo = before.body.estimate.estimateNo;
    const res = await request(app)
      .post(`/api/estimate/v1/projects/${businessProjectId}/duplicate`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(res.status, 201);
    assert.notEqual(res.body.estimate.estimateNo, oldNo);
    assert.equal(res.body.estimate.items.length, before.body.estimate.items.length);
  });

  it("完了報告書は写真12枚で2ページ以上になる", async () => {
    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "完了報告テスト",
        siteName: "報告現場",
        address: "兵庫県神戸市",
        assignee: "担当太郎",
        surveyDate: "2026-06-09",
      });
    const svyId = survey.body.projectId;
    const titles = [
      "玄関カメラ",
      "事務所NVR",
      "駐車場配管",
      "LAN配線",
      "屋外カメラ",
      "配電盤",
      "受付モニタ",
      "倉庫",
      "屋上",
      "機械室",
      "会議室",
      "廊下",
    ];
    for (let i = 0; i < 12; i++) {
      const photo = await request(app)
        .post(`/api/survey/v1/projects/${svyId}/photos`)
        .set("Authorization", `Bearer ${token}`)
        .send({ imageBase64: TINY_PNG, fileName: `cr-${i}.jpg` });
      await request(app)
        .patch(`/api/survey/v1/projects/${svyId}/photos/${photo.body.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title: titles[i] });
    }
    await request(app)
      .post(`/api/survey/v1/projects/${svyId}/estimate-pending`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const est = await request(app)
      .post(`/api/estimate/v1/from-survey/${svyId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const res = await request(app)
      .get(`/api/estimate/v1/projects/${est.body.businessProjectId}/completion-report/pdf`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("完了報告書"));
    assert.ok(res.text.includes("玄関カメラ"));
    assert.ok(res.text.includes("LAN配線"));
    const photoPages = (res.text.match(/cr-photo-page/g) || []).length;
    assert.ok(photoPages >= 2, `expected >=2 photo pages, got ${photoPages}`);
  });
});

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
