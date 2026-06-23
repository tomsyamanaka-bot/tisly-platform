import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";

process.env.JWT_SECRET = "test-jwt-operational-phase17";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-operational-phase17.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();
const publicDir = path.join(process.cwd(), "public");
const repoRoot = path.join(process.cwd(), "..");

describe("Operational Phase17 — legacy redirects", () => {
  const redirects: Array<{ from: string; expect: RegExp }> = [
    { from: "/estimate", expect: /\/estimate-v1/ },
    { from: "/invoice", expect: /tab=invoice/ },
    { from: "/drawing-editor", expect: /\/survey-drawing-v1/ },
    { from: "/survey", expect: /\/survey-v1/ },
    { from: "/projects", expect: /\/projects-v1/ },
    { from: "/materials", expect: /\/field-check-v1/ },
    { from: "/materials-v1", expect: /\/field-check-v1/ },
    { from: "/purchase", expect: /tab=orders/ },
  ];

  for (const r of redirects) {
    it(`${r.from} redirects permanently`, async () => {
      const res = await request(app).get(r.from).redirects(0);
      assert.equal(res.status, 301);
      assert.match(String(res.headers.location), r.expect);
    });
  }
});

describe("Operational Phase17 — document viewer & PDF UI", () => {
  it("document-viewer has no LINE button", async () => {
    const html = fs.readFileSync(path.join(publicDir, "document-viewer-v1.html"), "utf-8");
    assert.doesNotMatch(html, /LINEで送る/);
    assert.doesNotMatch(html, /id="btn-share"/);
    assert.match(html, /PDFにする/);
    assert.match(html, /id="btn-save"/);
  });

  it("document-viewer JS uses document-center fallback", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/document-viewer-v1.js"), "utf-8");
    assert.match(js, /DOCUMENT_CENTER_FALLBACK/);
    assert.match(js, /resolveDocumentReturn/);
    assert.doesNotMatch(js, /btn-share/);
  });

  it("estimate-v1 removed quick share button", async () => {
    const res = await request(app).get("/estimate-v1");
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /btn-pdf-quick-share/);
    assert.match(res.text, /doc-meta-underline-label/);
  });

  it("PDF v2 meta rows include underline markup", () => {
    const ts = fs.readFileSync(
      path.join(process.cwd(), "src/business/pdf/toms-excel-doc-layout-v2.ts"),
      "utf-8"
    );
    assert.match(ts, /toms-v2-meta-underline/);
    assert.match(ts, /metaCell\("担当"/);
  });
});

describe("Operational Phase17 — routes & SW", () => {
  it("document-center-v1 serves documents page", async () => {
    const res = await request(app).get("/document-center-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /Document Center/);
  });

  it("service worker bumped to v2400-phase17", () => {
    const sw = fs.readFileSync(path.join(publicDir, "service-worker.js"), "utf-8");
    assert.match(sw, /v2400-phase17/);
    assert.match(sw, /document-viewer-v1\.html/);
  });

  it("route contract doc exists", () => {
    const contract = path.join(repoRoot, "docs/routes/ROUTE_CONTRACT.md");
    assert.ok(fs.existsSync(contract));
    const text = fs.readFileSync(contract, "utf-8");
    assert.match(text, /document-center-v1/);
    assert.match(text, /\/purchase/);
  });

  it("survey-drawing syncGridStageSize for full canvas", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/survey-drawing-v1.js"), "utf-8");
    assert.match(js, /syncGridStageSize/);
    assert.match(js, /survey-drawing-ui-v5/);
  });

  it("regression routes return 200", async () => {
    const paths = [
      "/route-health",
      "/schedule-v1",
      "/survey-v1",
      "/survey-drawing-v1",
      "/estimate-v1",
      "/estimate-v1?tab=invoice",
      "/projects-v1",
      "/project-dashboard-v1",
      "/field-checklist-v1",
      "/field-check-v1",
      "/field-check-v1?tab=orders",
      "/document-center-v1",
      "/document-viewer-v1.html",
    ];
    for (const p of paths) {
      const res = await request(app).get(p);
      assert.equal(res.status, 200, `${p} should be 200`);
    }
  });
});

after(async () => {
  await closeDatabase();
});
