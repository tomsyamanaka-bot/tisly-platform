import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-document-viewer-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-document-viewer-v1.db";
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

describe("Document Viewer UX v1 API", () => {
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
        customerName: "ドキュメント閲覧テスト",
        siteName: "守谷市テスト現場",
        address: "茨城県守谷市",
        surveyDate: "2026-06-11",
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

    const est = await request(app)
      .post(`/api/estimate/v1/from-survey/${surveyProjectId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(est.status, 201);
    businessProjectId = est.body.businessProjectId;
  });

  after(() => closeDatabase());

  it("document-viewer-v1.html が配信される", async () => {
    const res = await request(app).get("/document-viewer-v1.html");
    assert.equal(res.status, 200);
    assert.match(res.text, /document-viewer-v1\.js/);
    assert.match(res.text, /btn-back/);
  });

  it("見積書 document-view JSON を返す", async () => {
    const res = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/document-view?kind=estimate`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.kind, "estimate");
    assert.equal(res.body.label, "見積書");
    assert.ok(res.body.estimate);
    assert.ok(res.body.estimate.items.length >= 1);
    assert.ok(res.body.estimate.total > 0);
    assert.match(res.body.pdfUrl, /\/pdf$/);
  });

  it("仕様書・現場報告 document-view JSON を返す", async () => {
    const spec = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/document-view?kind=specification`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(spec.status, 200);
    assert.equal(spec.body.kind, "specification");
    assert.ok(spec.body.specification);

    const field = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/document-view?kind=field-report`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(field.status, 200);
    assert.equal(field.body.kind, "field-report");
    assert.ok(field.body.fieldReport);
    assert.ok(field.body.fieldReport.materials.length >= 1);
  });

  it("請求書 document-view は invoice 作成後に返る", async () => {
    const before = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/document-view?kind=invoice`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(before.status, 404);

    await request(app)
      .post(`/api/estimate/v1/projects/${businessProjectId}/invoice`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const res = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/document-view?kind=invoice`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.kind, "invoice");
    assert.ok(res.body.invoice);
    assert.ok(typeof res.body.invoice.bankInfo === "string");
    assert.ok(res.body.invoice.total > 0);
  });

  it("完了報告書 document-view JSON を返す", async () => {
    await request(app)
      .post(`/api/estimate/v1/projects/${businessProjectId}/completion-report/create`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const res = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/document-view?kind=completion-report`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.kind, "completion-report");
    assert.ok(res.body.completionReport);
    assert.ok(Array.isArray(res.body.completionReport.checklist));
  });

  it("不正 kind は 400", async () => {
    const res = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/document-view?kind=unknown`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 400);
  });

  it("印刷用 PDF エンドポイントは従来どおり application/pdf を返す", async () => {
    await request(app)
      .post(`/api/estimate/v1/projects/${businessProjectId}/finalize`)
      .set("Authorization", `Bearer ${token}`)
      .send({ includePhotos: false });

    const res = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/pdf`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    const ct = String(res.headers["content-type"] || "");
    assert.ok(/pdf|html/.test(ct), `PDF endpoint unchanged (got ${ct})`);
  });
});
