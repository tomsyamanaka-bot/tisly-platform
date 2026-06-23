import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";

process.env.JWT_SECRET = "test-jwt-operational-phase18";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-operational-phase18.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const { shareIdFromRef, buildCustomerProjectViewV1 } = await import(
  "../src/shared/customer/customer-portal-data-v1.js"
);
const { resolveDocumentReturnUrlV1 } = await import(
  "../src/shared/navigation/document-return-v1.js"
);
const { resolveCustomerBackUrlV1 } = await import(
  "../src/shared/navigation/customer-nav-v1.js"
);
const {
  TISLY_INTERNAL_ROUTES_V1,
  TISLY_CUSTOMER_ROUTES_V1,
  TISLY_LEGACY_REDIRECTS_V1,
} = await import("../src/shared/routes/tisly-routes-v1.js");

const app = createApp();
const publicDir = path.join(process.cwd(), "public");
const repoRoot = path.join(process.cwd(), "..");

describe("Operational Phase18 — URL contract", () => {
  const pageRoutes = [
    "/app",
    "/customer",
    "/estimate-v1",
    "/estimate-v1?tab=invoice",
    "/survey-drawing-v1",
    "/route-health",
    "/document-center-v1",
  ];

  for (const p of pageRoutes) {
    it(`${p} returns 200`, async () => {
      const res = await request(app).get(p);
      assert.equal(res.status, 200, `${p} should be 200`);
    });
  }

  const legacyRedirects: Array<{ from: string; expect: RegExp }> = [
    { from: "/estimate", expect: /\/estimate-v1/ },
    { from: "/invoice", expect: /tab=invoice/ },
    { from: "/drawing-editor", expect: /\/survey-drawing-v1/ },
    { from: "/survey", expect: /\/survey-v1/ },
    { from: "/projects", expect: /\/projects-v1/ },
    { from: "/materials", expect: /\/field-check-v1/ },
    { from: "/purchase", expect: /tab=orders/ },
    { from: "/customer-portal", expect: /\/customer/ },
  ];

  for (const r of legacyRedirects) {
    it(`${r.from} redirects permanently`, async () => {
      const res = await request(app).get(r.from).redirects(0);
      assert.equal(res.status, 301);
      assert.match(String(res.headers.location), r.expect);
    });
  }
});

describe("Operational Phase18 — customer separation", () => {
  it("customer landing has no /app links", async () => {
    const res = await request(app).get("/customer");
    assert.equal(res.status, 200);
    assert.match(res.text, /customer-v1\.js/);
    assert.doesNotMatch(res.text, /href="\/app"/);
    assert.doesNotMatch(res.text, /見積作成/);
    assert.doesNotMatch(res.text, /projectId/);
  });

  it("customer project route serves page", async () => {
    const shareId = shareIdFromRef("DEMO-HOME-001");
    const res = await request(app).get(`/customer/project/${shareId}`);
    assert.equal(res.status, 200);
    assert.match(res.text, /customer-project-v1\.js/);
  });

  it("customer API returns sanitized project view", async () => {
    const shareId = shareIdFromRef("DEMO-HOME-001");
    const res = await request(app).get(`/api/customer-portal/v1/project/${shareId}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
    assert.ok(res.body.propertyName);
    assert.ok(Array.isArray(res.body.sitePhotos));
    const json = JSON.stringify(res.body);
    assert.doesNotMatch(json, /QNAP|WebDAV|projectId|usage-log|粗利/);
    assert.doesNotMatch(json, /invoice_pdf/);
  });

  it("customer nav never returns /app", () => {
    const back = resolveCustomerBackUrlV1({ referrerPath: "/app" });
    assert.equal(back, "/customer");
    const fromCustomer = resolveCustomerBackUrlV1({
      referrerPath: "/customer/project/abc",
    });
    assert.match(fromCustomer, /^\/customer/);
  });

  it("route contract API lists separation", async () => {
    const res = await request(app).get("/api/customer-portal/v1/route-contract");
    assert.equal(res.status, 200);
    assert.ok(res.body.separation?.crossNavigationBlocked);
    assert.ok(Array.isArray(res.body.internalRoutes));
    assert.ok(Array.isArray(res.body.customerRoutes));
  });
});

describe("Operational Phase18 — shared logic", () => {
  it("shared routes module has internal and customer zones", () => {
    assert.ok(TISLY_INTERNAL_ROUTES_V1.some((r) => r.path === "/app"));
    assert.ok(TISLY_CUSTOMER_ROUTES_V1.some((r) => r.path === "/customer"));
    assert.ok(TISLY_LEGACY_REDIRECTS_V1.some((r) => r.from === "/estimate"));
  });

  it("document return prefers returnUrl over history", () => {
    const url = resolveDocumentReturnUrlV1({
      returnUrl: "/document-center-v1?projectId=MO-1",
      projectId: "other",
    });
    assert.equal(url, "/document-center-v1?projectId=MO-1");
    const fallback = resolveDocumentReturnUrlV1({ projectId: "MO-1" });
    assert.match(fallback, /document-center-v1\?projectId=MO-1/);
  });

  it("customer project view builds from shareId", () => {
    const view = buildCustomerProjectViewV1(shareIdFromRef("DEMO-HOME-001"));
    assert.ok(view);
    assert.ok(view!.propertyName);
    assert.ok(view!.contact.companyName.includes("TOMS"));
  });
});

describe("Operational Phase18 — PDF & drawing (Phase17 carry-over)", () => {
  it("document-viewer has no LINE button", async () => {
    const html = fs.readFileSync(path.join(publicDir, "document-viewer-v1.html"), "utf-8");
    assert.doesNotMatch(html, /LINEで送る/);
    assert.match(html, /PDFにする/);
    assert.match(html, /id="btn-save"/);
  });

  it("document-viewer JS uses document-center fallback", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/document-viewer-v1.js"), "utf-8");
    assert.match(js, /DOCUMENT_CENTER_FALLBACK/);
    assert.match(js, /resolveDocumentReturn/);
    assert.doesNotMatch(js, /history\.back/);
  });

  it("PDF v2 meta rows include underline markup", () => {
    const ts = fs.readFileSync(
      path.join(process.cwd(), "src/business/pdf/toms-excel-doc-layout-v2.ts"),
      "utf-8"
    );
    const company = fs.readFileSync(
      path.join(process.cwd(), "src/business/pdf/company.ts"),
      "utf-8"
    );
    const diag = fs.readFileSync(
      path.join(process.cwd(), "src/business/pdf/pdf-diagnostics-v1.ts"),
      "utf-8"
    );
    assert.match(ts, /toms-v2-meta-underline/);
    assert.match(company, /株式会社TOMS/);
    assert.match(diag, /トムズ/);
  });

  it("survey-drawing syncGridStageSize for full canvas", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/survey-drawing-v1.js"), "utf-8");
    assert.match(js, /syncGridStageSize/);
    assert.match(js, /getBoundingClientRect/);
  });

  it("service worker bumped to v2400-phase18", () => {
    const sw = fs.readFileSync(path.join(publicDir, "service-worker.js"), "utf-8");
    assert.match(sw, /v2400-phase18/);
    assert.match(sw, /customer-v1\.html/);
  });

  it("route contract doc updated for Phase18", () => {
    const contract = path.join(repoRoot, "docs/routes/ROUTE_CONTRACT.md");
    assert.ok(fs.existsSync(contract));
    const text = fs.readFileSync(contract, "utf-8");
    assert.match(text, /\/customer/);
    assert.match(text, /phase18/i);
  });

  it("shared/ directory exists", () => {
    assert.ok(fs.existsSync(path.join(process.cwd(), "src/shared/routes/tisly-routes-v1.ts")));
    assert.ok(fs.existsSync(path.join(process.cwd(), "src/shared/customer/customer-portal-data-v1.ts")));
  });
});

after(async () => {
  await closeDatabase();
});
