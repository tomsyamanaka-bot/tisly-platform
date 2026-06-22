import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";

process.env.JWT_SECRET = "test-jwt-pwa-route-repair-v3";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-pwa-route-repair-v3.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();
const publicDir = path.join(process.cwd(), "public");

describe("PWA Route Repair Phase3", () => {
  it("estimate-v1 HTML includes PDF quick bar and bank panel", async () => {
    const res = await request(app).get("/estimate-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /estimate-ui-v8/);
    assert.match(res.text, /btn-pdf-quick-generate/);
    assert.match(res.text, /btn-pdf-quick-save/);
    assert.match(res.text, /btn-pdf-quick-share/);
    assert.match(res.text, /invoice-bank-panel/);
    assert.match(res.text, /btn-new-standalone-estimate/);
    assert.match(res.text, /btn-new-standalone-invoice/);
  });

  it("estimate-v1 JS has localStorage fallback and TOMS bank labels", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/estimate-v1.js"), "utf-8");
    assert.match(js, /ESTIMATE_UI_VERSION = "estimate-ui-v8"/);
    assert.match(js, /LOCAL_DRAFTS_KEY/);
    assert.match(js, /createLocalDraftFromStandalone/);
    assert.match(js, /resolveTomsBankInfoClient/);
    assert.match(js, /株式会社TOMS/);
    assert.match(js, /TOMS_DEFAULT_BANK_INFO = ".*トムズ/s);
  });

  it("invoice tab query is recognized in estimate-v1 JS", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/estimate-v1.js"), "utf-8");
    assert.match(js, /tab === "invoice"/);
    assert.match(js, /billing_v1/);
  });

  it("survey drawing editor passes surveyId in query builder", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/survey-v1.js"), "utf-8");
    assert.match(js, /SURVEY_UI_VERSION = "survey-ui-v4"/);
    assert.match(js, /surveyId/);
    assert.match(js, /survey-drawing-v1/);
    assert.match(js, /survey-pdf-actions-v1/);
  });

  it("bottom nav links are valid in tisly-practical-nav.js", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/tisly-practical-nav.js"), "utf-8");
    assert.match(js, /href: "\/schedule-v1"/);
    assert.match(js, /href: "\/survey-v1"/);
    assert.match(js, /href: "\/estimate-v1"/);
    assert.match(js, /href: "\/estimate-v1\?tab=invoice"/);
    assert.match(js, /href: "\/projects-v1"/);
    assert.match(js, /href: "\/field-check-v1"/);
    assert.match(js, /href: "\/field-check-v1\?tab=orders"/);
  });

  it("route-health includes operational checks", async () => {
    const html = await request(app).get("/route-health");
    assert.equal(html.status, 200);
    assert.match(html.text, /Route Health/);
    assert.match(html.text, /checked-at/);

    const js = fs.readFileSync(path.join(publicDir, "js/route-health.js"), "utf-8");
    assert.match(js, /checkEstimateOperational/);
    assert.match(js, /checkDrawingOperational/);
    assert.match(js, /checkBottomNavJs/);
    assert.match(js, /checkFieldChecklistJs/);
    assert.match(html.text, /verify-steps-list/);
    assert.match(html.text, /route-health-v7/);
  });

  it("service worker cache version bumped for PDF restore Phase4", () => {
    const sw = fs.readFileSync(path.join(publicDir, "service-worker.js"), "utf-8");
    assert.match(sw, /v2397-production/);
    assert.match(sw, /survey-drawing-v1/);
    assert.match(sw, /estimate-v1/);
  });

  it("survey-drawing-v1 route exists with grid and tools", async () => {
    const res = await request(app).get("/survey-drawing-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /survey-drawing-ui-v3/);
    assert.match(res.text, /drawing-svg/);
    assert.match(res.text, /btn-save/);
    assert.match(res.text, /btn-back/);
    assert.match(res.text, /btn-drawing-pdf-create/);
  });

  it("survey-v1 includes specification PDF action buttons", async () => {
    const res = await request(app).get("/survey-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /btn-survey-pdf-create/);
    assert.match(res.text, /btn-survey-pdf-preview/);
  });
});

after(async () => {
  await closeDatabase();
});
