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
    assert.equal(res.body.version, "toms-standard-v1-stub");
    assert.ok(Array.isArray(res.body.lines));
  });

  it("GET /estimate-v1 ページを配信できる", async () => {
    const res = await request(app).get("/estimate-v1");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("見積を確定") || res.text.includes("TiSLY — 見積"));
  });
});
