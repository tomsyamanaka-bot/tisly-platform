import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";

process.env.JWT_SECRET = "test-jwt-pwa-route-repair-v4";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-pwa-route-repair-v4.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();
const publicDir = path.join(process.cwd(), "public");

describe("PWA Route Repair Phase7 — bottom nav", () => {
  it("現場 tab links to field-checklist-v1 (not field-check-v1)", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/tisly-practical-nav.js"), "utf-8");
    assert.match(js, /field_site_v1.*field-checklist-v1/s);
    assert.match(js, /field_check_v1.*field-check-v1/s);
    const fieldCheckHrefCount = (js.match(/href: "\/field-check-v1"/g) || []).length;
    assert.equal(fieldCheckHrefCount, 1, "材料のみ field-check-v1 へ");
  });

  it("field-checklist-v1 uses field_site_v1 appId for nav highlight", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/field-checklist-v1.js"), "utf-8");
    assert.match(js, /appId: "field_site_v1"/);
  });

  it("all bottom nav target pages return 200", async () => {
    const paths = [
      "/schedule-v1",
      "/survey-v1",
      "/estimate-v1",
      "/estimate-v1?tab=invoice",
      "/projects-v1",
      "/field-checklist-v1",
      "/field-check-v1",
      "/purchase-v1",
    ];
    for (const p of paths) {
      const res = await request(app).get(p);
      assert.equal(res.status, 200, `${p} should be 200`);
    }
  });

  it("field-check-v1?tab=orders HTML loads purchase redirect script", async () => {
    const res = await request(app).get("/field-check-v1");
    assert.equal(res.status, 200);
    const js = fs.readFileSync(path.join(publicDir, "js/field-check-v1.js"), "utf-8");
    assert.match(js, /get\("tab"\) === "orders"/);
    assert.match(js, /\/purchase-v1/);
  });

  it("legacy /invoice redirects to estimate invoice tab", async () => {
    const res = await request(app).get("/invoice").redirects(0);
    assert.equal(res.status, 301);
    assert.match(String(res.headers.location), /tab=invoice/);
  });
});

describe("PWA Route Repair Phase8 — route-health & cache", () => {
  it("route-health includes bottom nav quick links and v7", async () => {
    const html = await request(app).get("/route-health");
    assert.equal(html.status, 200);
    assert.match(html.text, /route-health-v10/);
    assert.match(html.text, /bottom-nav-quick/);
    assert.match(html.text, /nav-quick-grid/);

    const js = fs.readFileSync(path.join(publicDir, "js/route-health.js"), "utf-8");
    assert.match(js, /renderBottomNavQuickLinks/);
    assert.match(js, /checkOldJsVersions/);
    assert.match(js, /checkBottomNavPages/);
    assert.match(js, /field-checklist-v1/);
    assert.match(js, /v2400/);
  });

  it("estimate-ui-v13 is referenced in estimate HTML", async () => {
    const res = await request(app).get("/estimate-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /estimate-ui-v13/);
    assert.doesNotMatch(res.text, /estimate-ui-v7/);
  });

  it("service worker cache version bumped to v2417 module-fix", () => {
    const sw = fs.readFileSync(path.join(publicDir, "service-worker.js"), "utf-8");
    assert.match(sw, /v2417-module-fix/);
    assert.match(sw, /field-checklist-v1\.html/);
    assert.match(sw, /purchase-v1\.html/);
    assert.match(sw, /schedule-v1\.html/);
  });

  it("projects-v1 JS has single workApi declaration", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/projects-v1.js"), "utf-8");
    const matches = js.match(/async function workApi/g) || [];
    assert.equal(matches.length, 1, "workApi must be declared once");
  });

  it("schedule-v1 binds UI handlers before async data load", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/schedule-v1.js"), "utf-8");
    const initBlock = js.slice(js.indexOf("async function init()"), js.indexOf("function bindScheduleUiHandlers()"));
    const bindCallIdx = initBlock.indexOf("bindScheduleUiHandlers()");
    const loadWeekIdx = initBlock.indexOf("await loadWeek()");
    assert.ok(bindCallIdx > 0 && bindCallIdx < loadWeekIdx, "bindScheduleUiHandlers called before loadWeek in init");
  });

  it("schedule-v1 JS has fallback and no infinite loading guard", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/schedule-v1.js"), "utf-8");
    assert.match(js, /DEFAULT_FETCH_TIMEOUT_MS/);
    assert.match(js, /forceClear|Load failed|renderFriendlyErrorHtml/s);
  });

  it("invoice tab active via tab=invoice query in estimate JS", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/estimate-v1.js"), "utf-8");
    assert.match(js, /tab === "invoice"/);
    assert.match(js, /estimate_billing_v1/);
    assert.match(js, /LOCAL_DRAFTS_KEY/);
  });
});

after(async () => {
  await closeDatabase();
});
