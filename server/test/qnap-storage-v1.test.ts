import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-qnap-storage-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-qnap-storage-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.STORAGE_PROVIDER = "mock";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { getStorageDocumentByIdV1, listStorageDocumentsForProjectV1 } = await import(
  "../src/storage/storage-documents-v1-store.js"
);

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("QNAP storage v1", () => {
  let token = "";
  let businessProjectId = "";
  let estimateDocId = "";

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
    token = login.body.token;

    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "QNAP保存テスト",
        siteName: "守谷市テスト現場",
        address: "茨城県守谷市",
        surveyDate: "2026-06-19",
      });

    await request(app)
      .post(`/api/survey/v1/projects/${survey.body.projectId}/estimate-pending`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const est = await request(app)
      .post(`/api/estimate/v1/from-survey/${survey.body.projectId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    businessProjectId = est.body.businessProjectId;

    await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/pdf?includePhotos=false`)
      .set("Authorization", `Bearer ${token}`);

    const doc = listStorageDocumentsForProjectV1(businessProjectId).find(
      (d) => d.documentType === "estimate"
    );
    estimateDocId = doc!.id;
  });

  after(() => closeDatabase());

  it("QNAP未設定でも health と test API が落ちない", async () => {
    const health = await request(app).get("/api/health");
    assert.equal(health.status, 200);

    const test = await request(app)
      .post("/api/storage/qnap/test")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(test.status, 200);
    assert.equal(typeof test.body.ok, "boolean");
  });

  it("保存失敗時 qnap_failed", async () => {
    const failRes = await request(app)
      .post(`/api/storage/qnap/sync/${estimateDocId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ forceMockFail: true });
    assert.equal(failRes.status, 200);
    assert.equal(failRes.body.ok, false);
    assert.equal(failRes.body.status, "qnap_failed");

    const doc = getStorageDocumentByIdV1(estimateDocId);
    assert.equal(doc?.status, "qnap_failed");
    assert.ok(doc?.errorMessage);
  });

  it("再試行で qnap_synced", async () => {
    const retry = await request(app)
      .post("/api/storage/qnap/retry-failed")
      .set("Authorization", `Bearer ${token}`)
      .send({ projectId: businessProjectId });
    assert.equal(retry.status, 200);
    assert.ok(retry.body.synced.length >= 1);

    const doc = getStorageDocumentByIdV1(estimateDocId);
    assert.equal(doc?.status, "qnap_synced");
    assert.ok(doc?.qnapPath?.includes("/estimates/"));
  });

  it("単体保存成功 — 既に synced なら idempotent", async () => {
    const res = await request(app)
      .post(`/api/storage/qnap/sync/${estimateDocId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.status, "qnap_synced");
  });

  it("案件まとめて保存成功", async () => {
    const sync = await request(app)
      .post(`/api/storage/qnap/sync-project/${businessProjectId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(sync.status, 200);
    assert.ok(Array.isArray(sync.body.synced) || Array.isArray(sync.body.skipped));
  });

  it("GET status/:projectId", async () => {
    const res = await request(app)
      .get(`/api/storage/qnap/status/${businessProjectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.projectId, businessProjectId);
    assert.ok(res.body.summary);
    assert.ok(res.body.documents.length >= 1);
  });
});
