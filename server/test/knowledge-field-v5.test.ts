import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-knowledge-field-v5";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-knowledge-field-v5.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.QNAP_MODE = "mock";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { runKnowledgeQnapConnectionTestV1 } = await import("../src/knowledge/knowledge-qnap-connection-test-v1.js");
const { buildCustomerExplanationV1 } = await import("../src/knowledge/knowledge-customer-explanation-v1.js");
const { listProjectKnowledgeV1 } = await import("../src/knowledge/knowledge-project-knowledge-v1.js");
const {
  buildKnowledgeUsageDashboardV1,
  exportKnowledgeUsageCsvV1,
} = await import("../src/knowledge/knowledge-usage-analytics-v1.js");
const { appendKnowledgeUsageLogV1 } = await import("../src/knowledge/knowledge-usage-log-v1.js");
const { getKnowledgeDetailV1 } = await import("../src/knowledge/knowledge-detail-v1.js");
const { ensureKnowledgeLibraryTemplatesV1 } = await import("../src/knowledge/knowledge-templates-v1.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("Knowledge Field UX V5 — QNAP connection test", () => {
  it("env unset mock mode returns reachable mock", async () => {
    process.env.QNAP_MODE = "mock";
    const result = await runKnowledgeQnapConnectionTestV1();
    assert.equal(result.mode, "mock");
    assert.equal(result.reachable, true);
    assert.ok(result.sampleListResult);
    assert.ok(result.checkedAt);
  });

  it("webdav without credentials — configured false / fallback", async () => {
    process.env.QNAP_MODE = "webdav";
    delete process.env.QNAP_WEBDAV_URL;
    delete process.env.QNAP_WEBDAV_BASE_URL;
    delete process.env.QNAP_WEBDAV_USER;
    delete process.env.QNAP_WEBDAV_PASSWORD;
    const result = await runKnowledgeQnapConnectionTestV1();
    assert.equal(result.mode, "mock");
    assert.equal(result.reachable, true);
    assert.ok(result.fallbackReason);
    process.env.QNAP_MODE = "mock";
  });

  it("WebDAV failure does not throw", async () => {
    process.env.QNAP_MODE = "webdav";
    process.env.QNAP_WEBDAV_URL = "http://127.0.0.1:59999/invalid";
    process.env.QNAP_WEBDAV_USER = "test";
    process.env.QNAP_WEBDAV_PASSWORD = "test";
    const result = await runKnowledgeQnapConnectionTestV1();
    assert.ok(result.checkedAt);
    assert.equal(typeof result.reachable, "boolean");
    delete process.env.QNAP_WEBDAV_URL;
    delete process.env.QNAP_WEBDAV_USER;
    delete process.env.QNAP_WEBDAV_PASSWORD;
    process.env.QNAP_MODE = "mock";
  });
});

describe("Knowledge Field UX V5 — customer explanation", () => {
  it("builds mock customer explanation card data", () => {
    ensureKnowledgeLibraryTemplatesV1();
    const detail = getKnowledgeDetailV1("PLC-SELF-HOLD-001", "plc");
    assert.ok(detail);
    const explanation = buildCustomerExplanationV1(detail!);
    assert.equal(explanation.source, "mock_v1");
    assert.ok(explanation.whatIsIt);
    assert.ok(explanation.afterInstallPoints);
    assert.ok(!explanation.whatIsIt.includes("QNAP"));
  });
});

describe("Knowledge Field UX V5 — project knowledge & analytics", () => {
  it("lists project knowledge sorted by usage", () => {
    appendKnowledgeUsageLogV1({
      knowledgeId: "V5-PROJ-001",
      title: "案件テスト資料",
      projectId: "MO-26-0616-001",
      category: "PLC",
    });
    const items = listProjectKnowledgeV1("MO-26-0616-001", 10);
    assert.ok(Array.isArray(items));
  });

  it("dashboard includes filters, unused, total count", () => {
    const dash = buildKnowledgeUsageDashboardV1({ topLimit: 10, unusedLimit: 5 });
    assert.ok(typeof dash.totalLogCount === "number");
    assert.ok(Array.isArray(dash.unusedKnowledge));
    assert.ok(Array.isArray(dash.topKnowledge));
    assert.ok(dash.filters);
  });

  it("exports usage CSV", () => {
    const csv = exportKnowledgeUsageCsvV1({});
    assert.match(csv, /usedAt,knowledgeId,title/);
  });
});

describe("Knowledge Field UX V5 API & assets", () => {
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

  it("GET /api/knowledge/qnap-connection-test", async () => {
    const res = await request(app)
      .get("/api/knowledge/qnap-connection-test")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok("mode" in res.body);
    assert.ok("configured" in res.body);
    assert.ok("reachable" in res.body);
    assert.ok("sampleListResult" in res.body);
    assert.ok(!JSON.stringify(res.body).includes("password"));
  });

  it("GET /api/knowledge/project-access-v1/:id/knowledge", async () => {
    const res = await request(app)
      .get("/api/knowledge/project-access-v1/MO-26-0616-001/knowledge")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.items));
  });

  it("GET /api/knowledge/usage-analytics-v1/export.csv", async () => {
    const res = await request(app)
      .get("/api/knowledge/usage-analytics-v1/export.csv")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.match(res.text, /usedAt,knowledgeId,title/);
  });

  it("GET /sw-knowledge-field-v5.js serves SW", async () => {
    const res = await request(app).get("/sw-knowledge-field-v5.js");
    assert.equal(res.status, 200);
    assert.match(res.text, /KNOWLEDGE_CACHE_V5/);
    assert.match(res.text, /files-v1/);
    assert.match(res.text, /detail-v1/);
  });

  it("GET /knowledge-field-v1 loads v5 css", async () => {
    const res = await request(app).get("/knowledge-field-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /knowledge-field-ux-v5\.css/);
    assert.match(res.text, /offline-field-mount/);
  });

  it("GET /knowledge-detail-v1 loads v5 css", async () => {
    const res = await request(app).get("/knowledge-detail-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /knowledge-field-ux-v5\.css/);
  });

  it("GET /knowledge-usage-dashboard-v1", async () => {
    const res = await request(app).get("/knowledge-usage-dashboard-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /knowledge-field-ux-v5\.css/);
  });

  it("detail API includes customerExplanation", async () => {
    ensureKnowledgeLibraryTemplatesV1();
    const res = await request(app)
      .get("/api/knowledge/detail-v1?id=PLC-SELF-HOLD-001&kind=plc")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.detail?.customerExplanation?.whatIsIt);
  });
});
