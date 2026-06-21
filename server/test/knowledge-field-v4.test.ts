import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-knowledge-field-v4";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-knowledge-field-v4.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.QNAP_MODE = "mock";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const {
  resolveKnowledgeFileDeliveryV1,
  getKnowledgeFileDeliveryStatusV1,
  fetchKnowledgeFileFromWebDavV1,
} = await import("../src/knowledge/knowledge-file-delivery-v1.js");
const {
  getKnowledgeQnapDeliveryConfigV1,
} = await import("../src/knowledge/knowledge-qnap-delivery-config-v1.js");
const {
  buildKnowledgeUsageDashboardV1,
  aggregateUsageByCategoryV1,
  aggregateUsageByProjectV1,
} = await import("../src/knowledge/knowledge-usage-analytics-v1.js");
const {
  listKnowledgeProjectAccessV1,
  filterKnowledgeHitsByProjectV1,
} = await import("../src/knowledge/knowledge-project-access-v1.js");
const { appendKnowledgeUsageLogV1 } = await import("../src/knowledge/knowledge-usage-log-v1.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("Knowledge Field UX V4 — QNAP delivery config", () => {
  it("QNAP_MODE mock uses effective mock", () => {
    process.env.QNAP_MODE = "mock";
    const cfg = getKnowledgeQnapDeliveryConfigV1();
    assert.equal(cfg.qnapMode, "mock");
    assert.equal(cfg.effectiveMode, "mock");
  });

  it("QNAP_MODE webdav without credentials falls back to mock", () => {
    process.env.QNAP_MODE = "webdav";
    delete process.env.QNAP_WEBDAV_URL;
    delete process.env.QNAP_WEBDAV_BASE_URL;
    delete process.env.QNAP_WEBDAV_USER;
    delete process.env.QNAP_WEBDAV_PASSWORD;
    const cfg = getKnowledgeQnapDeliveryConfigV1();
    assert.equal(cfg.qnapMode, "webdav");
    assert.equal(cfg.effectiveMode, "mock");
    assert.ok(cfg.fallbackReason);
    process.env.QNAP_MODE = "mock";
  });

  it("WebDAV unset does not throw on file delivery resolve", () => {
    process.env.QNAP_MODE = "webdav";
    const delivery = resolveKnowledgeFileDeliveryV1({
      sourcePath: "3DPrint/Missing/not-here.stl",
    });
    assert.ok(["placeholder", "webdav", "local", "mock_mirror"].includes(delivery.deliveryMode));
    process.env.QNAP_MODE = "mock";
  });

  it("fetchKnowledgeFileFromWebDavV1 returns null when mock fallback", async () => {
    process.env.QNAP_MODE = "webdav";
    const result = await fetchKnowledgeFileFromWebDavV1("3DPrint/test.stl");
    assert.equal(result, null);
    process.env.QNAP_MODE = "mock";
  });

  it("getKnowledgeFileDeliveryStatusV1 exposes mode", () => {
    const status = getKnowledgeFileDeliveryStatusV1();
    assert.ok(status.qnapMode);
    assert.ok(status.effectiveMode);
    assert.ok(status.shareRoot);
  });
});

describe("Knowledge Field UX V4 — usage analytics", () => {
  it("aggregates dashboard data", () => {
    appendKnowledgeUsageLogV1({
      knowledgeId: "V4-DASH-001",
      title: "ダッシュボードテスト",
      category: "PLC",
      projectId: "MO-26-0616-001",
    });
    const dash = buildKnowledgeUsageDashboardV1({ topLimit: 5, recentLimit: 5 });
    assert.ok(Array.isArray(dash.topKnowledge));
    assert.ok(Array.isArray(dash.byCategory));
    assert.ok(Array.isArray(dash.byProject));
    assert.ok(Array.isArray(dash.recentLogs));
    assert.ok(typeof dash.totalLogCount === "number");
    assert.ok(aggregateUsageByCategoryV1(5).length >= 1);
    assert.ok(aggregateUsageByProjectV1(5).some((p) => p.projectId === "MO-26-0616-001"));
  });
});

describe("Knowledge Field UX V4 — project access", () => {
  it("lists project quick access with mock fallback", () => {
    const projects = listKnowledgeProjectAccessV1(5);
    assert.ok(projects.length >= 1);
    assert.ok(projects[0].projectId);
  });

  it("filters hits by project", () => {
    const hits = [
      { id: "A", projectNo: "MO-26-0616-001" },
      { id: "B", projectNo: "MO-26-9999-001" },
    ];
    const filtered = filterKnowledgeHitsByProjectV1(hits, "MO-26-0616-001");
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, "A");
  });
});

describe("Knowledge Field UX V4 API", () => {
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

  it("GET /api/knowledge/delivery-status-v1", async () => {
    const res = await request(app)
      .get("/api/knowledge/delivery-status-v1")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.effectiveMode);
  });

  it("GET /api/knowledge/project-access-v1", async () => {
    const res = await request(app)
      .get("/api/knowledge/project-access-v1?limit=5")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.projects));
  });

  it("GET /api/knowledge/usage-analytics-v1/dashboard", async () => {
    const res = await request(app)
      .get("/api/knowledge/usage-analytics-v1/dashboard")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.topKnowledge));
    assert.ok(Array.isArray(res.body.recentLogs));
  });

  it("GET /knowledge-field-v1 loads v4 css", async () => {
    const res = await request(app).get("/knowledge-field-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /knowledge-field-ux-v4\.css/);
  });

  it("GET /knowledge-detail-v1 loads v4 css", async () => {
    const res = await request(app).get("/knowledge-detail-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /knowledge-field-ux-v4\.css/);
  });

  it("GET /knowledge-usage-dashboard-v1", async () => {
    const res = await request(app).get("/knowledge-usage-dashboard-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /knowledge-usage-dashboard-v1\.js/);
  });
});
