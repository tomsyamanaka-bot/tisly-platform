import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-knowledge-search-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-knowledge-search-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { unifiedKnowledgeSearchV1 } = await import("../src/knowledge/unified-knowledge-search-v1.js");
const { ensureKnowledgeLibraryTemplatesV1 } = await import("../src/knowledge/knowledge-templates-v1.js");
const { saveKnowledgeCardV1 } = await import("../src/knowledge/knowledge-store-v1.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("unified-knowledge-search-v1 unit", () => {
  it("finds PLC self-hold by keyword", () => {
    ensureKnowledgeLibraryTemplatesV1();
    const result = unifiedKnowledgeSearchV1({ query: "自己保持", limit: 20 });
    assert.ok(result.total >= 1);
    assert.equal(result.engine, "keyword_unified_v1");
    const plcHit = result.hits.find((h) => h.kind === "plc" || h.title.includes("自己保持"));
    assert.ok(plcHit);
    assert.ok(plcHit.matchReasons.length >= 1);
  });

  it("filters by category PLC", () => {
    const result = unifiedKnowledgeSearchV1({ query: "PLC", category: "PLC", limit: 30 });
    for (const hit of result.hits) {
      assert.equal(hit.category, "PLC");
    }
  });

  it("finds 3DPrint DIN rail assets", () => {
    const result = unifiedKnowledgeSearchV1({ query: "DIN", kinds: ["3dprint", "plc"], limit: 20 });
    assert.ok(result.hits.some((h) => h.title.includes("DIN") || h.tags.some((t) => t.includes("DIN"))));
  });

  it("returns empty for blank query tokens", () => {
    const result = unifiedKnowledgeSearchV1({ query: "   ", limit: 10 });
    assert.equal(result.total, 0);
  });
});

describe("Knowledge Search V1 API", () => {
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

  it("GET /api/knowledge/search-v1 returns unified hits", async () => {
    const res = await request(app)
      .get("/api/knowledge/search-v1?q=自己保持")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.engine, "keyword_unified_v1");
    assert.ok(Array.isArray(res.body.hits));
    assert.ok(res.body.hits.length >= 1);
    assert.ok(res.body.hits[0].matchReasons?.length >= 1);
    assert.ok(Array.isArray(res.body.categories));
  });

  it("GET /api/knowledge/search-v1 filters projectNo", async () => {
    const cardId = `SEARCH-PROJ-${Date.now()}`;
    saveKnowledgeCardV1({
      id: cardId,
      title: "案件フィルタテスト",
      category: "LAN",
      tags: ["テスト"],
      summary: "project filter test",
      projectNo: "MO-99-9999-001",
    });
    const res = await request(app)
      .get("/api/knowledge/search-v1?q=フィルタ&projectNo=MO-99-9999-001")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.hits.every((h: { projectNo?: string }) => h.projectNo === "MO-99-9999-001"));
    try {
      fs.unlinkSync(
        `${process.cwd()}/data/knowledge/KnowledgeCards/${cardId}.json`
      );
    } catch {
      /* */
    }
  });

  it("GET /api/knowledge/search-v1 kinds=plc", async () => {
    const res = await request(app)
      .get("/api/knowledge/search-v1?q=タイマー&kinds=plc")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.hits.every((h: { kind: string }) => h.kind === "plc"));
  });

  it("GET /knowledge-search-v1 page", async () => {
    const res = await request(app).get("/knowledge-search-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /knowledge-search-v1\.js/);
  });

  it("PLC template includes ladder usage cautions after seed", async () => {
    await request(app)
      .post("/api/knowledge/templates/seed")
      .set("Authorization", `Bearer ${token}`);
    const res = await request(app)
      .get("/api/knowledge/search-v1?q=インターロック&kinds=plc")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    const hit = res.body.hits.find((h: { title: string }) => h.title.includes("インターロック"));
    assert.ok(hit);
    assert.ok(hit.summary.includes("用途") || hit.usage);
  });
});
