import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-knowledge-field-v2";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-knowledge-field-v2.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { buildQnapDeepLinksV1 } = await import("../src/knowledge/knowledge-qnap-links-v1.js");
const { buildAttachmentV1 } = await import("../src/knowledge/knowledge-attachments-v1.js");
const { getKnowledgeDetailV1 } = await import("../src/knowledge/knowledge-detail-v1.js");
const { unifiedKnowledgeSearchV1 } = await import("../src/knowledge/unified-knowledge-search-v1.js");
const { ensureKnowledgeLibraryTemplatesV1 } = await import("../src/knowledge/knowledge-templates-v1.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("knowledge-qnap-links-v1 unit", () => {
  it("builds SMB and web URLs for KnowledgeCards path", () => {
    const links = buildQnapDeepLinksV1("AI/KnowledgeCards/PLC-SELF-HOLD-001.json");
    assert.match(links.smbPath, /\\\\192\.168\.1\.10\\TiSLY\\AI\\KnowledgeCards/);
    assert.match(links.webUrl, /192\.168\.1\.10/);
    assert.equal(links.copyPath, links.smbPath);
    assert.equal(links.relativePath, "AI/KnowledgeCards/PLC-SELF-HOLD-001.json");
  });

  it("builds Photos path", () => {
    const links = buildQnapDeepLinksV1("Photos/survey/photo-001.jpg");
    assert.match(links.smbPath, /Photos\\survey/);
  });
});

describe("knowledge-attachments-v1 unit", () => {
  it("infers PDF file type", () => {
    const att = buildAttachmentV1({ sourcePath: "estimate/sample.pdf", label: "見積PDF" });
    assert.equal(att.fileType, "pdf");
    assert.equal(att.label, "見積PDF");
  });

  it("infers STL file type", () => {
    const att = buildAttachmentV1({ sourcePath: "3DPrint/Parts/bracket.stl" });
    assert.equal(att.fileType, "stl");
  });
});

describe("unified-knowledge-search-v2 enhancements", () => {
  it("enriches hits with capability flags", () => {
    ensureKnowledgeLibraryTemplatesV1();
    const result = unifiedKnowledgeSearchV1({ query: "自己保持", limit: 10 });
    const plcHit = result.hits.find((h) => h.kind === "plc");
    assert.ok(plcHit);
    assert.equal(plcHit.hasPlc, true);
    assert.ok(plcHit.qnapPath);
  });

  it("uses or_fallback when category+keyword AND is too narrow", () => {
    ensureKnowledgeLibraryTemplatesV1();
    const narrow = unifiedKnowledgeSearchV1({
      query: "自己保持",
      category: "防犯カメラ",
      limit: 10,
    });
    if (narrow.searchMode === "or_fallback") {
      assert.ok(narrow.total >= 1);
      assert.ok(narrow.hits.some((h) => h.title.includes("自己保持") || h.category === "防犯カメラ"));
    } else {
      assert.equal(narrow.searchMode, "and");
    }
    const combined = unifiedKnowledgeSearchV1({
      query: "自己保持",
      category: "PLC",
      limit: 10,
    });
    assert.ok(combined.total >= 1);
    assert.ok(combined.hits.every((h) => h.category === "PLC" || combined.searchMode === "or_fallback"));
  });
});

describe("knowledge-detail-v2 enhancements", () => {
  it("returns attachment groups for PLC template", () => {
    ensureKnowledgeLibraryTemplatesV1();
    const detail = getKnowledgeDetailV1("PLC-SELF-HOLD-001", "plc");
    assert.ok(detail);
    assert.ok(detail?.qnapLinks?.smbPath);
    assert.ok(Array.isArray(detail?.relatedPlc));
    assert.ok(Array.isArray(detail?.attachments));
  });
});

describe("Knowledge Field UX V2 API", () => {
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

  it("GET /api/knowledge/qnap-links-v1", async () => {
    const res = await request(app)
      .get("/api/knowledge/qnap-links-v1?path=" + encodeURIComponent("AI/KnowledgeCards"))
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.links.smbPath.includes("KnowledgeCards"));
  });

  it("GET /api/knowledge/search-v1 returns enriched hits", async () => {
    const res = await request(app)
      .get("/api/knowledge/search-v1?q=自己保持")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.hits.length >= 1);
    assert.ok("hasPlc" in res.body.hits[0]);
  });

  it("GET /api/knowledge/detail-v1 returns v2 fields", async () => {
    const res = await request(app)
      .get("/api/knowledge/detail-v1?id=PLC-SELF-HOLD-001&kind=plc")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.detail.relatedPlc));
    assert.ok(res.body.detail.qnapLinks);
  });

  it("GET /knowledge-field-v1 loads v2 css", async () => {
    const res = await request(app).get("/knowledge-field-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /knowledge-field-ux-v2\.css/);
  });
});
