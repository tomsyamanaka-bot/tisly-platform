import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";

process.env.JWT_SECRET = "test-jwt-pwa-route-repair-v2";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-pwa-route-repair-v2.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();
const publicDir = path.join(process.cwd(), "public");

describe("PWA Route Repair Phase2", () => {
  it("legacy /estimate redirects to /estimate-v1", async () => {
    const res = await request(app).get("/estimate").redirects(0);
    assert.equal(res.status, 301);
    assert.match(String(res.headers.location), /\/estimate-v1/);
  });

  it("legacy /invoice redirects to /estimate-v1?tab=invoice", async () => {
    const res = await request(app).get("/invoice").redirects(0);
    assert.equal(res.status, 301);
    assert.match(String(res.headers.location), /\/estimate-v1/);
    assert.match(String(res.headers.location), /tab=invoice/);
  });

  it("estimate-v1 HTML includes fallback UI and invoice tab", async () => {
    const res = await request(app).get("/estimate-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /estimate-ui-v8/);
    assert.match(res.text, /btn-estimate-reload/);
    assert.match(res.text, /btn-new-standalone-invoice/);
    assert.match(res.text, /tab-invoices/);
    assert.match(res.text, /btn-manual-create-estimate/);
  });

  it("estimate-v1 JS has loading fallback and version constant", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/estimate-v1.js"), "utf-8");
    assert.match(js, /ESTIMATE_UI_VERSION = "estimate-ui-v8"/);
    assert.match(js, /INIT_LOAD_TIMEOUT_MS = DEFAULT_FETCH_TIMEOUT_MS/);
    assert.match(js, /forceClearAllListLoading/);
    assert.match(js, /resolveAuthSession/);
  });

  it("invoice tab query is recognized in estimate-v1 JS", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/estimate-v1.js"), "utf-8");
    assert.match(js, /tab === "invoice"/);
    assert.match(js, /billing_v1/);
  });

  it("survey-drawing-v1 route exists", async () => {
    const res = await request(app).get("/survey-drawing-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /survey-drawing-ui-v3/);
  });

  it("bottom nav links are valid in tisly-practical-nav.js", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/tisly-practical-nav.js"), "utf-8");
    assert.match(js, /href: "\/schedule-v1"/);
    assert.match(js, /href: "\/survey-v1"/);
    assert.match(js, /href: "\/estimate-v1"/);
    assert.match(js, /href: "\/estimate-v1\?tab=invoice"/);
    assert.match(js, /href: "\/projects-v1"/);
    assert.match(js, /field_site_v1.*href: "\/field-checklist-v1"/s);
    assert.match(js, /field_check_v1.*href: "\/field-check-v1"/s);
    assert.match(js, /purchase_v1.*href: "\/field-check-v1\?tab=orders"/s);
    assert.doesNotMatch(js, /project-dashboard-v1/);
    assert.doesNotMatch(js, /href: "\/purchase-v1"/);
  });

  it("survey drawing editor passes surveyId in query builder", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/survey-v1.js"), "utf-8");
    assert.match(js, /surveyId/);
    assert.match(js, /survey-drawing-v1/);
  });

  it("field-check-v1 redirects tab=orders to purchase-v1", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/field-check-v1.js"), "utf-8");
    assert.match(js, /get\("tab"\) === "orders"/);
    assert.match(js, /\/purchase-v1/);
  });

  it("route-health displays estimate/invoice status", async () => {
    const html = await request(app).get("/route-health");
    assert.equal(html.status, 200);
    assert.match(html.text, /Route Health/);
    assert.match(html.text, /checked-at/);
    assert.match(html.text, /btn-sw-update/);

    const js = fs.readFileSync(path.join(publicDir, "js/route-health.js"), "utf-8");
    assert.match(js, /checkEstimateUiVersion/);
    assert.match(js, /checkInvoiceTabHtml/);
    assert.match(js, /BOTTOM_NAV_LINKS/);
    assert.match(js, /readServiceWorkerVersion/);
  });

  it("service worker cache version bumped for route repair", () => {
    const sw = fs.readFileSync(path.join(publicDir, "service-worker.js"), "utf-8");
    assert.match(sw, /v2397-production/);
    assert.match(sw, /survey-drawing-v1/);
  });
});

after(async () => {
  await closeDatabase();
});
