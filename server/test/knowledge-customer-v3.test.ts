import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-knowledge-customer-v3";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-knowledge-customer-v3.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.QNAP_MODE = "mock";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const {
  getCustomerProjectPageV1,
  getCustomerProjectMetaForApiV1,
} = await import("../src/knowledge/knowledge-customer-project-v1.js");
const {
  isProductionProjectRefV1,
  normalizeCustomerProjectRefV1,
  resolveCustomerProjectMetaV1,
} = await import("../src/knowledge/knowledge-customer-project-adapter-v1.js");
const {
  assertCustomerFileUrlsSafeV1,
  listCustomerProjectFilesV1,
} = await import("../src/knowledge/knowledge-customer-project-files-v1.js");
const {
  getCustomerSiteAreaDetailV1,
  getCustomerSiteMapForProjectV1,
} = await import("../src/knowledge/knowledge-customer-site-map-v1.js");
const { assertCustomerDetailSanitizedV1 } = await import("../src/knowledge/knowledge-customer-detail-v1.js");
const { ensureKnowledgeLibraryTemplatesV1 } = await import("../src/knowledge/knowledge-templates-v1.js");

const app = createApp();
const FORBIDDEN = /QNAP|SMB|WebDAV|projectId|userId|mock fallback|192\.168\.|project-storage/i;
const RAW_ID_ON_SCREEN = /\bMO-\d{2}-\d{4}/;

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("Knowledge Customer UI V3 — production ref adapter", () => {
  it("recognizes production project ref format", () => {
    assert.ok(isProductionProjectRefV1("MO-26-0709"));
    assert.ok(isProductionProjectRefV1("MO-26-0709-01"));
    assert.ok(isProductionProjectRefV1("JY-26-0711"));
    assert.ok(!isProductionProjectRefV1("DEMO-HOME-001"));
  });

  it("normalizes production ref to uppercase city code", () => {
    assert.equal(normalizeCustomerProjectRefV1("mo-26-0709"), "MO-26-0709");
  });

  it("resolves MO-26-0709 with customer-safe display name", () => {
    const meta = resolveCustomerProjectMetaV1("MO-26-0709");
    assert.equal(meta.displayName, "守谷市 防犯設備工事");
    assert.equal(meta.customerSafeTitle, "守谷市 防犯設備工事");
    assert.ok(meta.relatedKnowledgeIds.length >= 1);
  });

  it("DEMO ref still works", () => {
    const meta = resolveCustomerProjectMetaV1("DEMO-HOME-001");
    assert.match(meta.displayName, /守谷市/);
  });

  it("unknown ref returns fallback meta", () => {
    const meta = resolveCustomerProjectMetaV1("UNKNOWN-REF-999");
    assert.ok(meta.isFallback);
    assert.ok(meta.customerSafeTitle.length >= 2);
  });

  it("API meta excludes internal fields", () => {
    const meta = getCustomerProjectMetaForApiV1("MO-26-0709");
    assert.ok(!("templateKey" in meta));
    assert.ok(!("storageRef" in meta));
    assert.doesNotMatch(JSON.stringify(meta), FORBIDDEN);
  });
});

describe("Knowledge Customer UI V3 — project files adapter", () => {
  it("lists photos and PDFs for MO-26-0709", () => {
    ensureKnowledgeLibraryTemplatesV1();
    const files = listCustomerProjectFilesV1("MO-26-0709");
    assert.ok(files.some((f) => f.type.includes("photo")));
    assert.ok(files.some((f) => f.type.includes("pdf")));
    assert.ok(assertCustomerFileUrlsSafeV1(files));
  });

  it("project page has photo sections before PDF sections", () => {
    ensureKnowledgeLibraryTemplatesV1();
    const page = getCustomerProjectPageV1("MO-26-0709");
    assert.ok(page.photoSections.before.length + page.photoSections.after.length >= 1);
    assert.ok(page.pdfSections.specification.length + page.pdfSections.completion.length >= 1);
    const photoCount =
      page.photoSections.before.length +
      page.photoSections.during.length +
      page.photoSections.after.length +
      page.photoSections.memo.length;
    assert.ok(photoCount >= 1);
  });

  it("site map area detail includes related photos and PDFs", () => {
    ensureKnowledgeLibraryTemplatesV1();
    const detail = getCustomerSiteAreaDetailV1("MO-26-0709", "entrance");
    assert.ok(detail);
    assert.ok(detail!.relatedPhotos.length >= 1 || detail!.relatedPdfs.length >= 1);
    assert.ok(detail!.beforePoints.length >= 1);
    assert.ok(detail!.afterPoints.length >= 1);
    assert.doesNotMatch(JSON.stringify(detail), FORBIDDEN);
  });
});

describe("Knowledge Customer UI V3 — sanitized page payloads", () => {
  it("project page for MO-26-0709 is sanitized", () => {
    ensureKnowledgeLibraryTemplatesV1();
    const page = getCustomerProjectPageV1("MO-26-0709");
    assert.equal(page.customerSafeTitle, "守谷市 防犯設備工事");
    assert.ok(assertCustomerDetailSanitizedV1(page));
    assert.doesNotMatch(JSON.stringify(page), FORBIDDEN);
  });

  it("does not expose raw project id as primary title", () => {
    const page = getCustomerProjectPageV1("MO-26-0709");
    assert.notEqual(page.propertyName, "MO-26-0709");
    assert.doesNotMatch(page.customerSafeTitle, RAW_ID_ON_SCREEN);
  });

  it("fallback unknown ref still renders friendly page", () => {
    const page = getCustomerProjectPageV1("UNKNOWN-XYZ-001");
    assert.ok(page.isFallback);
    assert.match(page.preparingMessage || "", /準備中/);
    assert.ok(assertCustomerDetailSanitizedV1(page));
  });

  it("site map works for production ref", () => {
    const map = getCustomerSiteMapForProjectV1("MO-26-0709");
    assert.ok(map.areas.length >= 3);
    assert.equal(map.customerSafeTitle, "守谷市 防犯設備工事");
    assert.doesNotMatch(JSON.stringify(map), FORBIDDEN);
  });
});

describe("Knowledge Customer UI V3 API & pages", () => {
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

  it("GET /api/knowledge/customer-project-v1?ref=MO-26-0709", async () => {
    ensureKnowledgeLibraryTemplatesV1();
    const res = await request(app)
      .get("/api/knowledge/customer-project-v1?ref=MO-26-0709")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.page.customerSafeTitle, "守谷市 防犯設備工事");
    assert.ok(res.body.page.photoSections);
    assert.ok(res.body.page.pdfSections);
    assert.doesNotMatch(JSON.stringify(res.body), FORBIDDEN);
  });

  it("GET /api/knowledge/customer-project-v1 DEMO ref still works", async () => {
    const res = await request(app)
      .get("/api/knowledge/customer-project-v1?ref=DEMO-HOME-001")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.match(res.body.page.propertyName, /守谷市/);
  });

  it("GET unknown ref returns fallback not 404", async () => {
    const res = await request(app)
      .get("/api/knowledge/customer-project-v1?ref=UNKNOWN-REF-999")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.isFallback, true);
  });

  it("GET /api/knowledge/customer-site-map-v1?ref=MO-26-0709", async () => {
    const res = await request(app)
      .get("/api/knowledge/customer-site-map-v1?ref=MO-26-0709")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.siteMap.areas.length >= 3);
    assert.doesNotMatch(JSON.stringify(res.body), FORBIDDEN);
  });

  it("GET site map area returns photos PDFs and before/after", async () => {
    ensureKnowledgeLibraryTemplatesV1();
    const res = await request(app)
      .get("/api/knowledge/customer-site-map-v1/area?ref=MO-26-0709&areaId=breaker")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.area);
    assert.ok(Array.isArray(res.body.relatedPhotos));
    assert.ok(Array.isArray(res.body.beforePoints));
    assert.doesNotMatch(JSON.stringify(res.body), FORBIDDEN);
  });

  it("GET customer project file serves content", async () => {
    ensureKnowledgeLibraryTemplatesV1();
    const res = await request(app)
      .get("/api/knowledge/customer-project-file-v1?ref=MO-26-0709&fileId=entrance-before-1")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.headers["content-type"]?.includes("image") || res.headers["content-type"]?.includes("pdf"));
  });

  it("GET /knowledge-customer-project-v1 page loads v3 assets", async () => {
    const res = await request(app).get("/knowledge-customer-project-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /knowledge-customer-v3\.css/);
    assert.doesNotMatch(res.text, FORBIDDEN);
  });
});
