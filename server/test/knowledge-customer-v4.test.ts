import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-knowledge-customer-v4";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-knowledge-customer-v4.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.QNAP_MODE = "mock";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const {
  getCustomerProjectPageV1,
} = await import("../src/knowledge/knowledge-customer-project-v1.js");
const {
  resolveCustomerProjectMetaV1,
} = await import("../src/knowledge/knowledge-customer-project-adapter-v1.js");
const {
  isBusinessProjectsTableAvailableV1,
  tryResolveCustomerMetaFromBusinessProjectsV1,
} = await import("../src/knowledge/knowledge-business-projects-adapter-v1.js");
const { buildCustomerProjectsPageV1 } = await import("../src/knowledge/knowledge-customer-projects-v1.js");
const { resolveCustomerDocumentPageV1 } = await import("../src/knowledge/knowledge-customer-document-v1.js");
const {
  filterCustomerPdfSectionsForShareV1,
  assertSharePayloadSanitizedV1,
  isCustomerShareVisibleFileV1,
} = await import("../src/knowledge/knowledge-customer-share-filter-v1.js");
const { getCustomerSiteMapForProjectV1 } = await import("../src/knowledge/knowledge-customer-site-map-v1.js");
const { ensureKnowledgeLibraryTemplatesV1 } = await import("../src/knowledge/knowledge-templates-v1.js");

const app = createApp();
const FORBIDDEN = /QNAP|SMB|WebDAV|projectId|userId|mock fallback|192\.168\.|project-storage/i;

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("Knowledge Customer UI V4 — business_projects adapter", () => {
  it("falls back to mock when business project not found", () => {
    const meta = tryResolveCustomerMetaFromBusinessProjectsV1("UNKNOWN-BIZ-999");
    assert.equal(meta, null);
    const fallback = resolveCustomerProjectMetaV1("UNKNOWN-BIZ-999");
    assert.ok(fallback.isFallback);
  });

  it("business_projects table availability check works", () => {
    assert.equal(typeof isBusinessProjectsTableAvailableV1(), "boolean");
  });

  it("MO-26-0709 still resolves via mock/production profile", () => {
    const meta = resolveCustomerProjectMetaV1("MO-26-0709");
    assert.equal(meta.customerSafeTitle, "守谷市 防犯設備工事");
    assert.ok(!("templateKey" in meta) || meta.templateKey);
  });
});

describe("Knowledge Customer UI V4 — projects list", () => {
  it("lists customer projects including demos", () => {
    ensureKnowledgeLibraryTemplatesV1();
    const page = buildCustomerProjectsPageV1();
    assert.ok(page.projects.length >= 3);
    assert.ok(page.projects.some((p) => p.ref === "DEMO-HOME-001"));
    assert.doesNotMatch(JSON.stringify(page), FORBIDDEN);
  });

  it("filters by genre 防犯", () => {
    const page = buildCustomerProjectsPageV1({ filter: "防犯" });
    assert.ok(page.projects.length >= 1);
    assert.ok(page.projects.every((p) => p.workGenre.includes("防犯") || p.genreTag === "防犯"));
  });
});

describe("Knowledge Customer UI V4 — document viewer", () => {
  it("resolves spec-pdf-001 alias for MO-26-0709", () => {
    ensureKnowledgeLibraryTemplatesV1();
    const doc = resolveCustomerDocumentPageV1({
      ref: "MO-26-0709",
      fileId: "spec-pdf-001",
    });
    assert.equal(doc.fileId, "spec-pdf");
    assert.ok(doc.hasContent);
    assert.match(doc.viewUrl, /customer-project-file-v1/);
    assert.doesNotMatch(JSON.stringify(doc), FORBIDDEN);
  });

  it("missing PDF returns preparing message", () => {
    const doc = resolveCustomerDocumentPageV1({
      ref: "MO-26-0709",
      fileId: "missing-doc-999",
    });
    assert.equal(doc.hasContent, false);
    assert.match(doc.preparingMessage || "", /準備中/);
  });
});

describe("Knowledge Customer UI V4 — share filter", () => {
  it("hides invoice in share pdf sections", () => {
    ensureKnowledgeLibraryTemplatesV1();
    const page = getCustomerProjectPageV1("MO-26-0709");
    const filtered = filterCustomerPdfSectionsForShareV1(page.pdfSections);
    assert.equal(filtered.invoice.length, 0);
    assert.ok(filtered.specification.length + filtered.completion.length >= 1);
  });

  it("share project page hides invoice pdfs", () => {
    ensureKnowledgeLibraryTemplatesV1();
    const page = getCustomerProjectPageV1("MO-26-0709", { shareView: true });
    assert.equal(page.pdfSections.invoice.length, 0);
    assert.equal(page.isShareView, true);
    assert.ok(assertSharePayloadSanitizedV1(page));
  });

  it("invoice file type is not share visible", () => {
    assert.equal(
      isCustomerShareVisibleFileV1({
        fileType: "invoice_pdf",
        safeLabel: "請求書",
        fileId: "invoice-pdf",
      }),
      false
    );
  });
});

describe("Knowledge Customer UI V4 — site map 3D prep", () => {
  it("returns map asset structure for MO-26-0709", () => {
    const map = getCustomerSiteMapForProjectV1("MO-26-0709");
    assert.ok(map.mapAsset);
    assert.equal(map.mapAsset!.mapType, "2d");
    assert.ok(Array.isArray(map.mapAsset!.cameraPositions));
    assert.ok(Array.isArray(map.mapAsset!.areaPolygons));
    assert.match(map.mapAsset!.integrationStatusLabel, /図面連携準備中/);
    assert.doesNotMatch(JSON.stringify(map.mapAsset), FORBIDDEN);
  });
});

describe("Knowledge Customer UI V4 — regression V1/V2/V3", () => {
  it("V3 MO-26-0709 project page still works", () => {
    ensureKnowledgeLibraryTemplatesV1();
    const page = getCustomerProjectPageV1("MO-26-0709");
    assert.equal(page.customerSafeTitle, "守谷市 防犯設備工事");
    assert.ok(page.photoSections.before.length + page.photoSections.after.length >= 1);
  });

  it("DEMO-HOME-001 still works", () => {
    const page = getCustomerProjectPageV1("DEMO-HOME-001");
    assert.match(page.propertyName, /守谷市/);
  });
});

describe("Knowledge Customer UI V4 API & pages", () => {
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

  it("GET /api/knowledge/customer-projects-v1", async () => {
    const res = await request(app)
      .get("/api/knowledge/customer-projects-v1")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.projects.length >= 3);
    assert.doesNotMatch(JSON.stringify(res.body), FORBIDDEN);
  });

  it("GET /api/knowledge/customer-document-v1", async () => {
    ensureKnowledgeLibraryTemplatesV1();
    const res = await request(app)
      .get("/api/knowledge/customer-document-v1?ref=MO-26-0709&fileId=spec-pdf-001")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.document.hasContent);
    assert.doesNotMatch(JSON.stringify(res.body), FORBIDDEN);
  });

  it("GET share project hides invoice", async () => {
    ensureKnowledgeLibraryTemplatesV1();
    const res = await request(app)
      .get("/api/knowledge/customer-project-v1?ref=MO-26-0709&view=share")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.shareView, true);
    assert.equal(res.body.page.pdfSections.invoice.length, 0);
    assert.doesNotMatch(JSON.stringify(res.body), FORBIDDEN);
  });

  it("GET /knowledge-customer-projects-v1 page loads v4 assets", async () => {
    const res = await request(app).get("/knowledge-customer-projects-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /knowledge-customer-v4\.css/);
  });

  it("GET /knowledge-customer-document-v1 page loads", async () => {
    const res = await request(app).get("/knowledge-customer-document-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /knowledge-customer-document-v1\.js/);
  });
});
