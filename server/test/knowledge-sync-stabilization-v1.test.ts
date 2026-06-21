import { describe, it, before, after } from "node:test";
import fs from "fs";
import path from "path";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-knowledge-sync-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-knowledge-sync-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { parseProjectPdfKnowledgeV1 } = await import("../src/knowledge/knowledge-pdf-parser-v1.js");
const {
  runPhotoOcrV1,
  DummyPhotoOcrEngineV1,
  setPhotoOcrEngineV1,
  RuleBasedPhotoOcrEngineV1,
  inferPhotoOcrTypeV1,
} = await import("../src/knowledge/knowledge-photo-ocr-v1.js");
const {
  enqueueKnowledgeQnapSyncV1,
  getKnowledgeQnapSyncStatusV1,
  listKnowledgeQnapSyncQueueV1,
} = await import("../src/knowledge/knowledge-qnap-sync-store-v1.js");
const { getKnowledgeQnapConnectionInfoV1 } = await import(
  "../src/knowledge/knowledge-qnap-sync-service-v1.js"
);
const { bulkApproveKnowledgeCandidatesV1 } = await import(
  "../src/knowledge/knowledge-candidates-store-v1.js"
);

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("Knowledge Sync Stabilization v1", () => {
  let token = "";
  let projectId = "BIZ-KNOW-SYNC";

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

    const db = getDatabase();
    db.prepare(`DELETE FROM business_estimates WHERE project_id = ?`).run(projectId);
    db.prepare(`DELETE FROM business_projects WHERE id = ?`).run(projectId);
    db.prepare(
      `INSERT INTO business_projects (id, project_no, customer_id, customer_name, title, address, status, created_at, updated_at)
       VALUES (?, 'MO-26-0621-200', 'cust-sync', '同期テスト顧客', '防犯カメラ設置', '守谷市テスト現場', 'estimate_created', datetime('now'), datetime('now'))`
    ).run(projectId);
    db.prepare(
      `INSERT INTO business_estimates (id, project_id, estimate_no, customer_name, title, items_json, subtotal, tax, total, internal_cost, gross_profit, gross_profit_rate, created_at, updated_at)
       VALUES ('est-sync-1', ?, 'EST-SYNC', '同期テスト顧客', '防犯カメラ設置',
         ?, 100000, 10000, 110000, 50000, 50000, 50, datetime('now'), datetime('now'))`
    ).run(
      projectId,
      JSON.stringify([
        { id: "1", category: "material", name: "UTPケーブル", unit: "m", quantity: 50, unitPrice: 200, amount: 10000 },
        { id: "2", category: "equipment", name: "防犯カメラ DS-2CD", unit: "台", quantity: 4, unitPrice: 15000, amount: 60000 },
      ])
    );
    db.prepare(`UPDATE business_projects SET estimate_id = 'est-sync-1' WHERE id = ?`).run(projectId);
  });

  after(() => {
    setPhotoOcrEngineV1(new RuleBasedPhotoOcrEngineV1());
    closeDatabase();
  });

  it("QNAP sync queue supports all sync kinds", () => {
    const tmpDir = path.join(process.cwd(), "data", "knowledge", "test-sync");
    fs.mkdirSync(tmpDir, { recursive: true });
    const testFile = path.join(tmpDir, "test-card.json");
    fs.writeFileSync(testFile, '{"id":"TEST"}', "utf8");

    for (const kind of ["KnowledgeCards", "Candidates", "Assets", "SearchIndex"] as const) {
      enqueueKnowledgeQnapSyncV1({
        syncKind: kind,
        resourceId: `res-${kind}`,
        localPath: testFile,
        relativePath: `AI/${kind}/test.json`,
      });
    }

    const status = getKnowledgeQnapSyncStatusV1();
    assert.ok(status.byKind.KnowledgeCards.pending >= 1);
    assert.ok(status.byKind.Candidates.pending >= 1);
    assert.ok(status.byKind.Assets.pending >= 1);
    assert.ok(status.byKind.SearchIndex.pending >= 1);
    assert.ok(Array.isArray(status.recentFailures));
  });

  it("getKnowledgeQnapConnectionInfoV1 returns mock in test", () => {
    const info = getKnowledgeQnapConnectionInfoV1();
    assert.equal(info.mockMode, true);
    assert.ok(info.message);
  });

  it("GET /api/knowledge/qnap-sync/status includes connection and byKind", async () => {
    const res = await request(app)
      .get("/api/knowledge/qnap-sync/status")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.byKind);
    assert.ok(res.body.connection);
  });

  it("parseProjectPdfKnowledgeV1 extracts extended fields", () => {
    const extract = parseProjectPdfKnowledgeV1({ projectId, pdfKind: "estimate" });
    assert.equal(extract.projectNo, "MO-26-0621-200");
    assert.equal(extract.customerName, "同期テスト顧客");
    assert.equal(extract.constructionName, "防犯カメラ設置");
    assert.ok(extract.propertyName);
    assert.equal(extract.amount, 110000);
    assert.equal(extract.subtotal, 100000);
  });

  it("inferPhotoOcrTypeV1 detects photo types", () => {
    assert.equal(inferPhotoOcrTypeV1({ photoId: "1", photoKind: "survey", title: "盤内配線" }), "panel");
    assert.equal(inferPhotoOcrTypeV1({ photoId: "2", photoKind: "survey", title: "20Aブレーカ" }), "breaker");
    assert.equal(inferPhotoOcrTypeV1({ photoId: "3", photoKind: "survey", title: "NVR 192.168.1.50 port 8000" }), "router_nvr");
  });

  it("DummyPhotoOcrEngineV1 is swappable", async () => {
    setPhotoOcrEngineV1(new DummyPhotoOcrEngineV1());
    const extract = await runPhotoOcrV1({
      photoId: "ph-dummy",
      photoKind: "completion",
      title: "型番ラベル DS-2CD",
      photoType: "model_label",
    });
    assert.equal(extract.engine, "dummy_v1");
    assert.ok(extract.photoType === "model_label");
    setPhotoOcrEngineV1(new RuleBasedPhotoOcrEngineV1());
  });

  it("POST /api/knowledge/candidates/bulk/approve approves multiple", async () => {
    const { saveKnowledgeCandidateV1 } = await import(
      "../src/knowledge/knowledge-candidates-store-v1.js"
    );
    const suffix = Date.now().toString(36);
    const mk = (n: number) =>
      saveKnowledgeCandidateV1({
        source: "project_stage",
        stage: "estimate",
        projectId,
        projectNo: "MO-26-0621-200",
        customerName: "同期テスト顧客",
        title: `一括承認テスト${n}-${suffix}`,
        category: "防犯カメラ",
        tags: ["テスト", `bulk-${suffix}`],
        summary: `一括承認テスト候補 ${n}`,
        draft: {
          id: `AUTO-SYNC${suffix.toUpperCase()}-${n}`,
          title: `一括承認${n}`,
          category: "防犯カメラ",
          tags: ["テスト"],
          summary: `一括承認テスト ${n}`,
          files: [],
          updatedAt: "2026-06-21",
          sourceType: "project",
          relatedProjectIds: [projectId],
          projectNo: "MO-26-0621-200",
        },
      });

    const ids = [mk(1).id, mk(2).id];
    const res = await request(app)
      .post("/api/knowledge/candidates/bulk/approve")
      .set("Authorization", `Bearer ${token}`)
      .send({ ids });
    assert.equal(res.status, 200);
    assert.ok(res.body.approved.length >= 1);
  });

  it("GET /api/knowledge/candidates supports category filter", async () => {
    const res = await request(app)
      .get("/api/knowledge/candidates?category=防犯カメラ")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.categories));
  });

  it("GET /api/knowledge/mothership/explorer includes sync and topFolders", async () => {
    const res = await request(app)
      .get("/api/knowledge/mothership/explorer")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.syncStatus);
    assert.ok(res.body.connection);
    assert.ok(res.body.topFolders?.length >= 10);
    assert.ok(Array.isArray(res.body.recentUpdates));
  });

  it("bulkApproveKnowledgeCandidatesV1 skips invalid ids gracefully", () => {
    const result = bulkApproveKnowledgeCandidatesV1(["KC-NOTEXIST999"]);
    assert.equal(result.approved.length, 0);
    assert.equal(result.errors.length, 1);
  });
});
