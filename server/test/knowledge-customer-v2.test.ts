import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-knowledge-customer-v2";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-knowledge-customer-v2.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.QNAP_MODE = "mock";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { buildCustomerHomeV2 } = await import("../src/knowledge/knowledge-customer-home-v2.js");
const {
  filterCustomerMaterialsV1,
  getCustomerProjectPageV1,
  listCustomerDemoProjectsV1,
} = await import("../src/knowledge/knowledge-customer-project-v1.js");
const {
  getCustomerSiteAreaV1,
  getCustomerSiteMapForProjectV1,
} = await import("../src/knowledge/knowledge-customer-site-map-v1.js");
const {
  getKnowledgeCustomerDetailV1,
  assertCustomerDetailSanitizedV1,
} = await import("../src/knowledge/knowledge-customer-detail-v1.js");
const { ensureKnowledgeLibraryTemplatesV1 } = await import("../src/knowledge/knowledge-templates-v1.js");

const app = createApp();
const FORBIDDEN = /QNAP|SMB|WebDAV|projectId|userId|mock fallback|192\.168\./i;

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("Knowledge Customer UI V2 — project & site map data", () => {
  it("lists demo projects for customer home", () => {
    const projects = listCustomerDemoProjectsV1();
    assert.ok(projects.length >= 3);
    assert.ok(projects.some((p) => p.ref === "DEMO-HOME-001"));
    assert.ok(projects.some((p) => p.workGenre.includes("防犯")));
  });

  it("builds customer home v2 with demo projects", () => {
    ensureKnowledgeLibraryTemplatesV1();
    const home = buildCustomerHomeV2();
    assert.ok(home.demoProjects.length >= 3);
    assert.ok(home.categories.length >= 8);
  });

  it("builds project page for DEMO-HOME-001", () => {
    ensureKnowledgeLibraryTemplatesV1();
    const page = getCustomerProjectPageV1("DEMO-HOME-001");
    assert.ok(page);
    assert.equal(page!.propertyName, "守谷市 山田様邸");
    assert.ok(page!.capabilities.length >= 3);
    assert.ok(page!.materials.length >= 4);
    assert.ok(assertCustomerDetailSanitizedV1(page));
  });

  it("site map returns areas with knowledge counts", () => {
    const map = getCustomerSiteMapForProjectV1("DEMO-HOME-001");
    assert.ok(map);
    assert.ok(map!.areas.length >= 5);
    assert.ok(map!.areas.some((a) => a.areaName === "玄関"));
    assert.ok(map!.areas.some((a) => a.areaName === "外周"));
    assert.ok(assertCustomerDetailSanitizedV1(map));
  });

  it("site map area exposes related knowledge ids", () => {
    const area = getCustomerSiteAreaV1("DEMO-HOME-001", "breaker");
    assert.ok(area);
    assert.ok(area!.relatedKnowledgeIds.length >= 1);
    assert.equal(area!.relatedKnowledgeIds[0].id, "PLC-SELF-HOLD-001");
  });

  it("materials filter by photo puts photos first", () => {
    ensureKnowledgeLibraryTemplatesV1();
    const page = getCustomerProjectPageV1("DEMO-HOME-001");
    assert.ok(page);
    const photos = filterCustomerMaterialsV1(page!.materials, "写真");
    assert.ok(photos.length >= 1);
    assert.ok(photos.every((m) => m.type === "photo" || m.hasPhoto));
    const firstPhotoIdx = page!.materials.findIndex((m) => m.type === "photo");
    const firstPdfIdx = page!.materials.findIndex((m) => m.type === "pdf");
    if (firstPhotoIdx >= 0 && firstPdfIdx >= 0) {
      assert.ok(firstPhotoIdx < firstPdfIdx);
    }
  });

  it("customer detail has enhanced before/after points", () => {
    ensureKnowledgeLibraryTemplatesV1();
    const detail = getKnowledgeCustomerDetailV1("PLC-SELF-HOLD-001", "plc", "DEMO-HOME-001");
    assert.ok(detail);
    assert.ok(detail!.beforeAfter.beforePoints.length >= 2);
    assert.ok(detail!.beforeAfter.afterPoints.length >= 2);
    assert.ok(detail!.projectPageUrl?.includes("DEMO-HOME-001"));
  });

  it("material category filter works", () => {
    ensureKnowledgeLibraryTemplatesV1();
    const page = getCustomerProjectPageV1("DEMO-FACTORY-001");
    assert.ok(page);
    const filtered = filterCustomerMaterialsV1(page!.materials, "工場");
    assert.ok(filtered.length >= 1);
  });
});

describe("Knowledge Customer UI V2 API & pages", () => {
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

  it("GET /knowledge-customer-v2 page", async () => {
    const res = await request(app).get("/knowledge-customer-v2");
    assert.equal(res.status, 200);
    assert.match(res.text, /knowledge-customer-v2\.js/);
    assert.match(res.text, /knowledge-customer-v2\.css/);
    assert.doesNotMatch(res.text, FORBIDDEN);
  });

  it("GET /knowledge-customer-project-v1 page", async () => {
    const res = await request(app).get("/knowledge-customer-project-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /knowledge-customer-project-v1\.js/);
    assert.doesNotMatch(res.text, FORBIDDEN);
  });

  it("GET /knowledge-customer-site-map-v1 page", async () => {
    const res = await request(app).get("/knowledge-customer-site-map-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /knowledge-customer-site-map-v1\.js/);
    assert.doesNotMatch(res.text, FORBIDDEN);
  });

  it("GET /api/knowledge/customer-home-v2", async () => {
    const res = await request(app)
      .get("/api/knowledge/customer-home-v2")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.demoProjects.length >= 3);
    assert.doesNotMatch(JSON.stringify(res.body), FORBIDDEN);
  });

  it("GET /api/knowledge/customer-project-v1 returns sanitized project page", async () => {
    ensureKnowledgeLibraryTemplatesV1();
    const res = await request(app)
      .get("/api/knowledge/customer-project-v1?ref=DEMO-HOME-001")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.page.propertyName, "守谷市 山田様邸");
    assert.ok(Array.isArray(res.body.page.materials));
    assert.doesNotMatch(JSON.stringify(res.body), FORBIDDEN);
  });

  it("GET /api/knowledge/customer-site-map-v1", async () => {
    const res = await request(app)
      .get("/api/knowledge/customer-site-map-v1?ref=DEMO-HOME-001")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.siteMap.areas.length >= 5);
    assert.doesNotMatch(JSON.stringify(res.body), FORBIDDEN);
  });

  it("GET /api/knowledge/customer-site-map-v1/area returns knowledge links", async () => {
    ensureKnowledgeLibraryTemplatesV1();
    const res = await request(app)
      .get("/api/knowledge/customer-site-map-v1/area?ref=DEMO-HOME-001&areaId=breaker")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.knowledgeLinks.length >= 1);
    assert.match(res.body.knowledgeLinks[0].detailUrl, /knowledge-customer-detail-v1/);
    assert.doesNotMatch(JSON.stringify(res.body), FORBIDDEN);
  });

  it("GET /api/knowledge/customer-materials-v1 filter", async () => {
    ensureKnowledgeLibraryTemplatesV1();
    const res = await request(app)
      .get("/api/knowledge/customer-materials-v1?ref=DEMO-HOME-001&filter=pdf")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.materials));
    assert.doesNotMatch(JSON.stringify(res.body), FORBIDDEN);
  });

  it("GET /api/knowledge/customer-detail-v1 with ref returns project back link", async () => {
    ensureKnowledgeLibraryTemplatesV1();
    const res = await request(app)
      .get("/api/knowledge/customer-detail-v1?id=PLC-SELF-HOLD-001&kind=plc&ref=DEMO-HOME-001")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.detail.beforeAfter.beforePoints.length >= 2);
    assert.ok(res.body.detail.projectPageUrl.includes("DEMO-HOME-001"));
    assert.doesNotMatch(JSON.stringify(res.body), FORBIDDEN);
  });

  it("accepts legacy projectId query on project API", async () => {
    const res = await request(app)
      .get("/api/knowledge/customer-project-v1?projectId=DEMO-NETWORK-001")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.match(res.body.page.workGenre, /ネットワーク/);
  });
});
