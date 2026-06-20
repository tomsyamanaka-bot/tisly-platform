import { describe, it, before, after } from "node:test";
import fs from "fs";
import path from "path";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-knowledge-acq-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-knowledge-acq-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const {
  buildMothership3DPrintRelativePath,
  MOTHERSHIP_TOP_FOLDERS,
} = await import("../src/storage/mothership-paths-v1.js");
const { ensureKnowledgeLibraryTemplatesV1 } = await import("../src/knowledge/knowledge-templates-v1.js");
const { getKnowledgeQnapSyncStatusV1 } = await import("../src/knowledge/knowledge-qnap-sync-store-v1.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("Knowledge Acquisition Engine v1", () => {
  let token = "";

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
  });

  after(() => closeDatabase());

  it("MotherShip includes 3DPrint folder", () => {
    assert.ok(MOTHERSHIP_TOP_FOLDERS.includes("3DPrint"));
    assert.equal(buildMothership3DPrintRelativePath("STL", "part.stl"), "3DPrint/STL/part.stl");
  });

  it("POST /api/knowledge/quick saves card", async () => {
    const res = await request(app)
      .post("/api/knowledge/quick")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "PoE配線メモ",
        category: "LAN",
        tags: ["PoE給電", "RJ45"],
        memo: "ラック内配線の注意点",
      });
    assert.equal(res.status, 201);
    assert.ok(res.body.card.id.startsWith("QUICK-"));
    assert.equal(res.body.card.sourceType, "quick");
  });

  it("POST /api/knowledge/templates/seed creates PLC and RP templates", async () => {
    const res = await request(app)
      .post("/api/knowledge/templates/seed")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.plcCreated >= 0);
    assert.ok(res.body.rpCreated >= 0);

    const search = await request(app)
      .get("/api/knowledge/search?q=自己保持")
      .set("Authorization", `Bearer ${token}`);
    assert.ok(search.body.hits.length >= 1);
  });

  it("POST /api/knowledge/photos/tag creates photo knowledge card", async () => {
    const db = getDatabase();
    const projectId = "BIZ-KNOW-TEST";
    db.prepare(`DELETE FROM completion_photos WHERE business_project_id = ?`).run(projectId);
    db.prepare(`DELETE FROM business_projects WHERE id = ?`).run(projectId);
    db.prepare(
      `INSERT INTO business_projects (id, project_no, customer_id, customer_name, title, address, status, created_at, updated_at)
       VALUES (?, 'MO-26-0621-099', 'cust-know-test', 'テスト顧客', 'ナレッジテスト', '守谷', 'completed', datetime('now'), datetime('now'))`
    ).run(projectId);
    db.prepare(
      `INSERT INTO completion_photos (id, business_project_id, photo_path, title, sort_order, created_at)
       VALUES ('cp-know-1', ?, 'test.jpg', '盤内', 0, datetime('now'))`
    ).run(projectId);

    const res = await request(app)
      .post("/api/knowledge/photos/tag")
      .set("Authorization", `Bearer ${token}`)
      .send({
        projectId,
        photoKind: "completion",
        photoId: "cp-know-1",
        title: "盤内配線",
        category: "LAN",
        tags: ["盤内配線", "RJ45"],
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.card.sourceType, "photo");

    const photoSearch = await request(app)
      .get("/api/knowledge/search?q=盤内&type=photo")
      .set("Authorization", `Bearer ${token}`);
    assert.ok(photoSearch.body.hits.length >= 1);
  });

  it("POST /api/knowledge/pdfs/register creates pdf knowledge card", async () => {
    const projectId = "BIZ-KNOW-TEST";
    const res = await request(app)
      .post("/api/knowledge/pdfs/register")
      .set("Authorization", `Bearer ${token}`)
      .send({
        projectId,
        kind: "estimate",
        category: "防犯カメラ",
        fileName: "estimate-test.pdf",
        localPath: "uploads/business/test/estimate.pdf",
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.card.sourceType, "pdf");
    assert.equal(res.body.card.pdfMeta.kind, "estimate");

    const pdfSearch = await request(app)
      .get("/api/knowledge/search?q=見積&type=pdf")
      .set("Authorization", `Bearer ${token}`);
    assert.ok(pdfSearch.body.hits.length >= 1);
  });

  it("POST /api/knowledge/from-project converts project", async () => {
    const projectId = "BIZ-KNOW-TEST";
    const res = await request(app)
      .post(`/api/knowledge/from-project/${encodeURIComponent(projectId)}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 201);
    assert.equal(res.body.projectId, projectId);
    assert.ok(Array.isArray(res.body.cardsCreated));

    const status = await request(app)
      .get(`/api/knowledge/from-project/${encodeURIComponent(projectId)}/status`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(status.body.registered, true);
    assert.ok(status.body.cardCount >= 1);
  });

  it("GET /api/knowledge/qnap-sync/status returns queue stats", async () => {
    const res = await request(app)
      .get("/api/knowledge/qnap-sync/status")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(typeof res.body.pending === "number");
    const local = getKnowledgeQnapSyncStatusV1();
    assert.ok(local.total >= 0);
  });

  it("GET /knowledge-quick-v1 serves quick UI", async () => {
    const res = await request(app).get("/knowledge-quick-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /ナレッジ登録/);
  });
});

describe("ensureKnowledgeLibraryTemplatesV1 unit", () => {
  it("seeds without throwing", () => {
    const result = ensureKnowledgeLibraryTemplatesV1();
    assert.ok(result.plcCreated >= 0);
    assert.ok(result.rpCreated >= 0);
    const plcDir = path.join(process.cwd(), "data", "knowledge", "Ladder");
    assert.ok(fs.existsSync(plcDir));
    const printDir = path.join(process.cwd(), "data", "knowledge", "3DPrint", "STL");
    assert.ok(fs.existsSync(printDir));
  });
});
