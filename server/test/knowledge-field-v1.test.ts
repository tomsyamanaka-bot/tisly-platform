import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-knowledge-field-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-knowledge-field-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { tokenizeFieldMemoV1 } = await import("../src/knowledge/knowledge-field-memo-v1.js");
const { getKnowledgeDetailV1 } = await import("../src/knowledge/knowledge-detail-v1.js");
const { ensureKnowledgeLibraryTemplatesV1 } = await import("../src/knowledge/knowledge-templates-v1.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("knowledge-field-memo-v1 unit", () => {
  it("tokenizes kitchen 5.5kW breaker memo", () => {
    const tokens = tokenizeFieldMemoV1("厨房の5.5kW機器で30Aブレーカーか確認したい");
    assert.ok(tokens.includes("5.5kW") || tokens.some((t) => t.includes("5.5")));
    assert.ok(tokens.includes("厨房") || tokens.includes("ブレーカー"));
  });

  it("extracts technical patterns", () => {
    const tokens = tokenizeFieldMemoV1("VVF2.0 と PoEカメラ RP2350");
    assert.ok(tokens.some((t) => /VVF/i.test(t)));
    assert.ok(tokens.some((t) => /PoE/i.test(t)));
    assert.ok(tokens.includes("RP2350"));
  });

  it("returns empty for blank input", () => {
    assert.deepEqual(tokenizeFieldMemoV1("   "), []);
  });
});

describe("knowledge-detail-v1 unit", () => {
  it("returns PLC template detail after seed", () => {
    ensureKnowledgeLibraryTemplatesV1();
    const detail = getKnowledgeDetailV1("PLC-SELF-HOLD-001", "plc");
    assert.ok(detail);
    assert.equal(detail?.kind, "plc");
    assert.ok(detail?.title.includes("自己保持"));
    assert.ok(detail?.hasPlc);
  });
});

describe("Knowledge Field UX V1 API", () => {
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
    ensureKnowledgeLibraryTemplatesV1();
  });

  after(() => closeDatabase());

  it("GET /api/knowledge/field-memo-tokenize", async () => {
    const res = await request(app)
      .get("/api/knowledge/field-memo-tokenize?q=" + encodeURIComponent("厨房の5.5kW機器"))
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.engine, "rule_based_v1");
    assert.ok(Array.isArray(res.body.tokens));
    assert.ok(res.body.tokens.length >= 1);
  });

  it("GET /api/knowledge/detail-v1 returns PLC detail", async () => {
    const res = await request(app)
      .get("/api/knowledge/detail-v1?id=PLC-SELF-HOLD-001&kind=plc")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.detail);
    assert.equal(res.body.detail.kind, "plc");
    assert.ok(res.body.detail.title);
  });

  it("GET /api/knowledge/detail-v1 404 for unknown id", async () => {
    const res = await request(app)
      .get("/api/knowledge/detail-v1?id=UNKNOWN-FIELD-999")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 404);
  });

  it("GET /knowledge-field-v1 page", async () => {
    const res = await request(app).get("/knowledge-field-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /knowledge-field-v1\.js/);
    assert.match(res.text, /現場メモから検索/);
  });

  it("GET /knowledge-detail-v1 page", async () => {
    const res = await request(app).get("/knowledge-detail-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /knowledge-detail-v1\.js/);
  });
});
