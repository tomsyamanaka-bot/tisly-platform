import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-document-storage-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-document-storage-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { listStorageDocumentsForProjectV1 } = await import(
  "../src/storage/storage-documents-v1-store.js"
);

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("Document storage v1", () => {
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
    const login = await surveyorLogin();
    token = login.body.token;

    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "保存分類テスト",
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
  });

  after(() => closeDatabase());

  it("storage_documents_v1 テーブルが存在する", () => {
    const row = getDatabase()
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='storage_documents_v1'`
      )
      .get() as { name: string } | undefined;
    assert.equal(row?.name, "storage_documents_v1");
  });

  it("見積PDF保存で履歴が qnap_pending で作られる", async () => {
    const pdf = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/pdf?includePhotos=false`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(pdf.status, 200);

    const docs = listStorageDocumentsForProjectV1(businessProjectId).filter(
      (d) => d.documentType === "estimate"
    );
    assert.ok(docs.length >= 1);
    assert.equal(docs[0].status, "qnap_pending");
    assert.ok(docs[0].customerName);
    assert.ok(docs[0].fileName.endsWith(".pdf"));
  });

  it("documents-status API に QNAP 保存状態が含まれる", async () => {
    const res = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/documents-status`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    const estimate = res.body.documents.find((d: { kind: string }) => d.kind === "estimate");
    assert.ok(estimate);
    assert.equal(estimate.storageStatus, "qnap_pending");
    assert.match(estimate.storageStatusLabel, /QNAP未保存/);
    assert.equal(estimate.storageStatusIcon, "🟡");
    assert.equal(estimate.hasPdf, true);
  });
});
