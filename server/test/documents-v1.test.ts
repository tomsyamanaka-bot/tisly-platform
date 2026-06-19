import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-documents-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-documents-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.STORAGE_PROVIDER = "mock";

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

describe("Document Center v1", () => {
  let token = "";
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
    token = login.body.token;

    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "DocumentCenterテスト",
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
  });

  after(() => closeDatabase());

  it("GET /documents-v1 ページ", async () => {
    const res = await request(app).get("/documents-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /Document Center/);
  });

  it("document_center テーブルが存在する", () => {
    const db = getDatabase();
    for (const table of ["document_center_favorites_v1", "document_center_recent_v1"]) {
      const row = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
        .get(table) as { name: string } | undefined;
      assert.equal(row?.name, table);
    }
    const cols = db.prepare("PRAGMA table_info(storage_documents_v1)").all() as Array<{ name: string }>;
    assert.ok(cols.some((c) => c.name === "source_type"));
  });

  it("GET /api/documents/v1/projects — 案件一覧", async () => {
    const res = await request(app)
      .get("/api/documents/v1/projects")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.count >= 1);
    const hit = (res.body.projects ?? []).find((p: { projectId: string }) => p.projectId === businessProjectId);
    assert.ok(hit);
    assert.ok(hit.documentCount >= 1);
  });

  it("GET /api/documents/v1/projects/:id — フォルダ構造", async () => {
    const res = await request(app)
      .get(`/api/documents/v1/projects/${businessProjectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.folders));
    const estimateFolder = res.body.folders.find((f: { folderType: string }) => f.folderType === "estimate");
    assert.ok(estimateFolder);
    assert.ok(estimateFolder.count >= 1);
    assert.equal(estimateFolder.color, "#2563eb");
  });

  it("全文検索 — 顧客名・見積番号", async () => {
    const byCustomer = await request(app)
      .get("/api/documents/v1/search?q=DocumentCenter")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(byCustomer.status, 200);
    assert.ok(byCustomer.body.count >= 1);
    assert.ok(byCustomer.body.elapsedMs < 5000);

    const docs = listStorageDocumentsForProjectV1(businessProjectId);
    const estimateDoc = docs.find((d) => d.documentType === "estimate");
    assert.ok(estimateDoc);
  });

  it("お気に入り toggle", async () => {
    const on = await request(app)
      .post(`/api/documents/v1/favorites/${businessProjectId}/toggle`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(on.status, 200);
    assert.equal(on.body.favorite, true);

    const list = await request(app)
      .get("/api/documents/v1/favorites")
      .set("Authorization", `Bearer ${token}`);
    assert.ok(list.body.count >= 1);

    const off = await request(app)
      .post(`/api/documents/v1/favorites/${businessProjectId}/toggle`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(off.body.favorite, false);
  });

  it("最近使った書類 — record + list", async () => {
    const detail = await request(app)
      .get(`/api/documents/v1/projects/${businessProjectId}`)
      .set("Authorization", `Bearer ${token}`);
    const item = detail.body.folders?.[0]?.items?.[0];
    assert.ok(item);

    await request(app)
      .post("/api/documents/v1/recent")
      .set("Authorization", `Bearer ${token}`)
      .send({
        projectId: businessProjectId,
        documentId: item.id,
        documentType: item.documentType,
        title: item.title,
        fileName: item.fileName,
      });

    const recent = await request(app)
      .get("/api/documents/v1/recent?limit=10")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(recent.status, 200);
    assert.ok(recent.body.items.length >= 1);
    assert.equal(recent.body.items[0].projectId, businessProjectId);
  });

  it("ドキュメント履歴 timeline", async () => {
    const res = await request(app)
      .get(`/api/documents/v1/projects/${businessProjectId}/timeline`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.events));
  });

  it("QNAP連携 API — status + sync", async () => {
    const status = await request(app)
      .get(`/api/documents/v1/projects/${businessProjectId}/qnap/status`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(status.status, 200);
    assert.ok(status.body.summary);

    const doc = listStorageDocumentsForProjectV1(businessProjectId).find(
      (d) => d.documentType === "estimate"
    );
    assert.ok(doc);
    const sync = await request(app)
      .post(`/api/documents/v1/qnap/sync/${doc!.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(sync.status, 200);
    assert.equal(typeof sync.body.ok, "boolean");
  });

  it("storage_documents source_type 列", () => {
    const doc = listStorageDocumentsForProjectV1(businessProjectId)[0];
    assert.ok(doc);
    assert.equal(doc.sourceType, "pdf");
  });
});
