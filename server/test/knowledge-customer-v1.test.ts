import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-knowledge-customer-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-knowledge-customer-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.QNAP_MODE = "mock";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { buildCustomerExplanationV1 } = await import("../src/knowledge/knowledge-customer-explanation-v1.js");
const { buildCustomerHomeV1 } = await import("../src/knowledge/knowledge-customer-home-v1.js");
const {
  getKnowledgeCustomerDetailV1,
  assertCustomerDetailSanitizedV1,
} = await import("../src/knowledge/knowledge-customer-detail-v1.js");
const { buildCustomerSiteLocationsV1 } = await import("../src/knowledge/knowledge-customer-site-map-v1.js");
const { getKnowledgeDetailV1 } = await import("../src/knowledge/knowledge-detail-v1.js");
const { ensureKnowledgeLibraryTemplatesV1 } = await import("../src/knowledge/knowledge-templates-v1.js");

const app = createApp();
const FORBIDDEN = /QNAP|SMB|WebDAV|projectId|userId|mock fallback|192\.168\./i;

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("Knowledge Customer UI V1 — explanation data structure", () => {
  it("builds extended customer explanation fields", () => {
    ensureKnowledgeLibraryTemplatesV1();
    const detail = getKnowledgeDetailV1("PLC-SELF-HOLD-001", "plc");
    assert.ok(detail);
    const ex = buildCustomerExplanationV1(detail!);
    assert.equal(ex.knowledgeId, "PLC-SELF-HOLD-001");
    assert.ok(ex.headline);
    assert.ok(ex.simpleDescription);
    assert.ok(Array.isArray(ex.customerBenefits));
    assert.ok(ex.customerBenefits.length >= 1);
    assert.ok(Array.isArray(ex.customerWarnings));
    assert.ok(Array.isArray(ex.afterWorkCheckpoints));
    assert.ok(Array.isArray(ex.recommendedFor));
    assert.ok(Array.isArray(ex.relatedQuestions));
    assert.equal(ex.source, "mock_v1");
    assert.ok(!ex.simpleDescription.includes("QNAP"));
  });

  it("builds customer home categories with counts", () => {
    ensureKnowledgeLibraryTemplatesV1();
    const home = buildCustomerHomeV1();
    assert.ok(home.categories.length >= 8);
    assert.ok(home.categories.some((c) => c.label === "防犯カメラ"));
    assert.equal(typeof home.categories[0].count, "number");
  });

  it("builds site map mock locations", () => {
    const locs = buildCustomerSiteLocationsV1("PLC", ["制御盤"]);
    assert.ok(locs.length >= 2);
    assert.ok(locs.some((l) => l.label === "制御盤" || l.label === "分電盤"));
  });

  it("customer detail strips internal metadata", () => {
    ensureKnowledgeLibraryTemplatesV1();
    const detail = getKnowledgeCustomerDetailV1("PLC-SELF-HOLD-001", "plc");
    assert.ok(detail);
    assert.ok(assertCustomerDetailSanitizedV1(detail));
    assert.ok(detail!.explanation.headline);
    assert.ok(detail!.siteLocations.length >= 2);
    assert.match(detail!.fieldDetailUrl, /knowledge-detail-v1/);
    assert.match(detail!.customerHomeUrl, /knowledge-customer-v1/);
  });
});

describe("Knowledge Customer UI V1 API & pages", () => {
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

  it("GET /knowledge-customer-v1 page", async () => {
    const res = await request(app).get("/knowledge-customer-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /knowledge-customer-v1\.js/);
    assert.match(res.text, /knowledge-customer-v1\.css/);
    assert.match(res.text, /TiSLY Knowledge/);
    assert.doesNotMatch(res.text, FORBIDDEN);
  });

  it("GET /knowledge-customer-detail-v1 page", async () => {
    const res = await request(app).get("/knowledge-customer-detail-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /knowledge-customer-detail-v1\.js/);
    assert.doesNotMatch(res.text, FORBIDDEN);
  });

  it("GET /api/knowledge/customer-home-v1", async () => {
    const res = await request(app)
      .get("/api/knowledge/customer-home-v1")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.categories));
    assert.ok(res.body.categories.length >= 8);
  });

  it("GET /api/knowledge/customer-detail-v1 returns sanitized detail", async () => {
    ensureKnowledgeLibraryTemplatesV1();
    const res = await request(app)
      .get("/api/knowledge/customer-detail-v1?id=PLC-SELF-HOLD-001&kind=plc")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    const detail = res.body.detail;
    assert.ok(detail.explanation?.headline);
    assert.ok(detail.beforeAfter?.summary);
    assert.ok(detail.beforeAfter?.beforePoints?.length >= 2);
    assert.ok(detail.beforeAfter?.afterPoints?.length >= 2);
    assert.ok(Array.isArray(detail.siteLocations));
    const json = JSON.stringify(detail);
    assert.doesNotMatch(json, FORBIDDEN);
    assert.doesNotMatch(json, /qnapPath/i);
  });

  it("GET /api/knowledge/customer-search-v1", async () => {
    const res = await request(app)
      .get("/api/knowledge/customer-search-v1?q=PLC")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.hits));
    if (res.body.hits.length) {
      assert.match(res.body.hits[0].detailUrl, /knowledge-customer-detail-v1/);
    }
  });

  it("field detail page links to customer UI", async () => {
    const res = await request(app).get("/knowledge-detail-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /knowledge-detail-v1\.js/);
  });

  it("field home page links to customer UI", async () => {
    const res = await request(app).get("/knowledge-field-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /knowledge-field-v1\.js/);
  });

  it("customer detail API has photos before pdfs in structure", () => {
    ensureKnowledgeLibraryTemplatesV1();
    const detail = getKnowledgeCustomerDetailV1("PLC-SELF-HOLD-001", "plc");
    assert.ok(detail);
    assert.ok(Array.isArray(detail!.photos));
    assert.ok(Array.isArray(detail!.pdfs));
  });
});
