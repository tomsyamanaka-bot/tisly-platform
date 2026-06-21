import { describe, it, before, after } from "node:test";
import fs from "fs";
import path from "path";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-knowledge-field-v3";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-knowledge-field-v3.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { buildQnapDeepLinksV1 } = await import("../src/knowledge/knowledge-qnap-links-v1.js");
const {
  resolveKnowledgeFileDeliveryV1,
  resolveKnowledgeFileForServeV1,
} = await import("../src/knowledge/knowledge-file-delivery-v1.js");
const {
  appendKnowledgeUsageLogV1,
  aggregateKnowledgeUsageRankingV1,
} = await import("../src/knowledge/knowledge-usage-log-v1.js");
const { getKnowledgeDetailV1 } = await import("../src/knowledge/knowledge-detail-v1.js");
const { ensureKnowledgeLibraryTemplatesV1 } = await import("../src/knowledge/knowledge-templates-v1.js");
const { getKnowledgeDataRoot } = await import("../src/knowledge/knowledge-paths-v1.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("knowledge-qnap-links-v3 unit", () => {
  it("includes folderPath and fileName", () => {
    const links = buildQnapDeepLinksV1("3DPrint/Camera/mount-v2.step");
    assert.match(links.smbPath, /mount-v2\.step/);
    assert.match(links.folderPath, /3DPrint\\Camera/);
    assert.equal(links.fileName, "mount-v2.step");
  });
});

describe("knowledge-file-delivery-v1 unit", () => {
  it("resolves local 3DPrint STL with serve URL", () => {
    const delivery = resolveKnowledgeFileDeliveryV1({
      sourcePath: "3DPrint/DINRail/bracket-v1.stl",
      qnapPath: "3DPrint/DINRail/bracket-v1.stl",
    });
    if (fs.existsSync(path.join(getKnowledgeDataRoot(), "3DPrint/DINRail/bracket-v1.stl"))) {
      assert.equal(delivery.fileExists, true);
      assert.match(delivery.openUrl ?? "", /\/api\/knowledge\/files-v1\?path=/);
      assert.equal(delivery.deliveryMode, "local");
    } else {
      assert.equal(delivery.deliveryMode, "placeholder");
    }
  });

  it("returns placeholder when file missing", () => {
    const delivery = resolveKnowledgeFileDeliveryV1({
      sourcePath: "3DPrint/Missing/not-here.stl",
    });
    assert.equal(delivery.fileExists, false);
    assert.equal(delivery.deliveryMode, "placeholder");
  });

  it("resolveKnowledgeFileForServeV1 rejects path traversal", () => {
    assert.equal(resolveKnowledgeFileForServeV1("../secret"), null);
  });
});

describe("knowledge-usage-log-v1 unit", () => {
  it("appends and aggregates ranking", () => {
    appendKnowledgeUsageLogV1({
      knowledgeId: "TEST-RANK-001",
      title: "テストランキング",
      category: "PLC",
      kind: "plc",
    });
    appendKnowledgeUsageLogV1({
      knowledgeId: "TEST-RANK-001",
      title: "テストランキング",
      category: "PLC",
    });
    const ranking = aggregateKnowledgeUsageRankingV1(5);
    const hit = ranking.find((r) => r.knowledgeId === "TEST-RANK-001");
    assert.ok(hit);
    assert.ok(hit!.count >= 2);
  });
});

describe("knowledge-detail-v3 attachments", () => {
  it("enriches PLC template with delivery fields on attachments", () => {
    ensureKnowledgeLibraryTemplatesV1();
    const detail = getKnowledgeDetailV1("PLC-SELF-HOLD-001", "plc");
    assert.ok(detail);
    assert.ok(Array.isArray(detail!.attachments));
    for (const att of detail!.attachments) {
      assert.ok(att.qnapPath || att.sourcePath);
    }
  });
});

describe("Knowledge Field UX V3 API", () => {
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

  it("POST /api/knowledge/usage-log", async () => {
    const res = await request(app)
      .post("/api/knowledge/usage-log")
      .set("Authorization", `Bearer ${token}`)
      .send({
        knowledgeId: "PLC-SELF-HOLD-001",
        title: "自己保持回路",
        category: "PLC",
        kind: "plc",
        query: "自己保持",
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.entry.knowledgeId, "PLC-SELF-HOLD-001");
  });

  it("GET /api/knowledge/usage-log/ranking", async () => {
    const res = await request(app)
      .get("/api/knowledge/usage-log/ranking?limit=5")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.ranking));
  });

  it("GET /api/knowledge/files-v1 serves local 3DPrint when present", async () => {
    const stlPath = path.join(getKnowledgeDataRoot(), "3DPrint/DINRail/bracket-v1.stl");
    if (!fs.existsSync(stlPath)) return;
    const res = await request(app)
      .get("/api/knowledge/files-v1?path=" + encodeURIComponent("3DPrint/DINRail/bracket-v1.stl"))
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.headers["content-type"]);
  });

  it("GET /knowledge-field-v1 loads v3 css", async () => {
    const res = await request(app).get("/knowledge-field-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /knowledge-field-ux-v3\.css/);
  });

  it("GET /knowledge-detail-v1 loads v3 css", async () => {
    const res = await request(app).get("/knowledge-detail-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /knowledge-field-ux-v3\.css/);
  });
});
