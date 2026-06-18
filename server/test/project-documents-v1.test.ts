import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-project-documents-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-project-documents-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { isTomsEstimateNo } = await import("../src/business/toms-document-format.js");
const { markProjectPdfStaleV1, isProjectPdfStaleV1 } = await import(
  "../src/projects/project-pdf-stale-v1.js"
);
const { getProjectDocumentsStatusV1, prefetchProjectPdfsV1 } = await import(
  "../src/projects/project-documents-v1.js"
);
const { recordPdfShareLogV1, listPdfShareLogsForProjectV1 } = await import(
  "../src/projects/pdf-share-log-store.js"
);

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("Project Documents v1", () => {
  let token = "";
  let businessProjectId = "";
  let projectNo = "";

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
        customerName: "書類状態テスト",
        siteName: "守谷市テスト",
        address: "茨城県守谷市",
        surveyDate: "2026-06-16",
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
    projectNo = est.body.projectNo;
  });

  after(() => closeDatabase());

  it("見積番号は TOMS 標準形式", async () => {
    const est = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(est.status, 200);
    assert.ok(isTomsEstimateNo(est.body.estimate?.estimateNo || est.body.header?.estimateNo));
  });

  it("documents-status API が4書類を返す", async () => {
    const res = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/documents-status`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.documents.length, 4);
    const estimate = res.body.documents.find((d: { kind: string }) => d.kind === "estimate");
    assert.ok(estimate);
    assert.ok(["ready", "stale", "not_created"].includes(estimate.status));
  });

  it("stale フラグ後に estimate が stale 表示", () => {
    markProjectPdfStaleV1(businessProjectId, "estimate");
    assert.equal(isProjectPdfStaleV1(businessProjectId, "estimate"), true);
    const status = getProjectDocumentsStatusV1(businessProjectId);
    const est = status?.documents.find((d) => d.kind === "estimate");
    assert.equal(est?.status, "stale");
  });

  it("prefetch が estimate PDF を生成して stale を解除", async () => {
    const result = await prefetchProjectPdfsV1(businessProjectId);
    assert.ok(result.prefetched.includes("estimate") || result.skipped.includes("estimate"));
    assert.equal(isProjectPdfStaleV1(businessProjectId, "estimate"), false);
  });

  it("pdf-share-log を保存・取得できる", () => {
    recordPdfShareLogV1({
      projectId: businessProjectId,
      documentKind: "estimate",
      fileName: "見積書_テスト.pdf",
    });
    const logs = listPdfShareLogsForProjectV1(businessProjectId);
    assert.ok(logs.length >= 1);
    assert.equal(logs[0].documentKind, "estimate");
  });

  it("estimate-v1.html に書類一覧と状態表示がある", async () => {
    const res = await request(app).get("/estimate-v1.html");
    assert.equal(res.status, 200);
    assert.match(res.text, /doc-list-section/);
    assert.match(res.text, /doc-status-estimate/);
    assert.ok(!/btn-regenerate-estimate/.test(res.text));
  });
});
