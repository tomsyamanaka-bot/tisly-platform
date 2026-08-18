import { describe, it, before, after } from "node:test";
import fs from "fs";
import path from "path";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-knowledge-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-knowledge-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { searchKnowledgeIndexV1 } = await import("../src/knowledge/knowledge-search-v1.js");
const {
  buildMothershipKnowledgeRelativePath,
  MOTHERSHIP_KNOWLEDGE_FOLDERS,
} = await import("../src/storage/mothership-paths-v1.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("knowledge-search-v1 unit", () => {
  it("matches title and tags", () => {
    const hits = searchKnowledgeIndexV1(
      [
        {
          id: "PLC-SELF-HOLD-001",
          title: "自己保持回路",
          category: "PLC",
          tags: ["PLC", "自己保持"],
          summary: "基本回路",
          updatedAt: "2026-06-21",
        },
      ],
      "自己保持"
    );
    assert.equal(hits.length, 1);
    assert.ok(hits[0].matchedFields.includes("title") || hits[0].matchedFields.includes("tags"));
  });

  it("returns empty for blank query", () => {
    assert.equal(searchKnowledgeIndexV1([], "  ").length, 0);
  });
});

describe("mothership knowledge paths", () => {
  it("buildMothershipKnowledgeRelativePath", () => {
    assert.equal(
      buildMothershipKnowledgeRelativePath("KnowledgeCards", "PLC-SELF-HOLD-001.json"),
      "AI/KnowledgeCards/PLC-SELF-HOLD-001.json"
    );
    assert.ok(MOTHERSHIP_KNOWLEDGE_FOLDERS.includes("Ladder"));
  });
});

describe("Knowledge Core v1 API", () => {
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

  it("GET /api/knowledge/categories returns master list", async () => {
    const res = await request(app)
      .get("/api/knowledge/categories")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.categories));
    assert.ok(res.body.categories.includes("PLC"));
    assert.ok(res.body.categories.includes("防犯カメラ"));
    assert.ok(res.body.categories.includes("Eco-Water"));
  });

  it("GET /api/knowledge/search finds sample card", async () => {
    const res = await request(app)
      .get("/api/knowledge/search?q=自己保持")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.engine, "keyword_v1");
    assert.ok(res.body.hits.length >= 1);
    assert.equal(res.body.hits[0].id, "PLC-SELF-HOLD-001");
  });

  it("POST /api/knowledge/cards saves and indexes", async () => {
    const cardId = `TEST-KNOW-${Date.now()}`;
    const post = await request(app)
      .post("/api/knowledge/cards")
      .set("Authorization", `Bearer ${token}`)
      .send({
        id: cardId,
        title: "テストナレッジ",
        category: "LAN",
        tags: ["テスト", "VLAN"],
        summary: "VLAN 設定のテストメモ",
        files: ["Procedures/vlan-setup.pdf"],
      });
    assert.equal(post.status, 201);
    assert.equal(post.body.card.id, cardId);

    const search = await request(app)
      .get(`/api/knowledge/search?q=${encodeURIComponent("VLAN")}`)
      .set("Authorization", `Bearer ${token}`);
    assert.ok(search.body.hits.some((h: { id: string }) => h.id === cardId));

    const cardPath = path.join(process.cwd(), "data", "knowledge", "KnowledgeCards", `${cardId}.json`);
    try {
      fs.unlinkSync(cardPath);
    } catch {
      /* */
    }
  });

  it("GET /api/knowledge/structure", async () => {
    const res = await request(app)
      .get("/api/knowledge/structure")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.folders.includes("KnowledgeCards"));
  });
});
