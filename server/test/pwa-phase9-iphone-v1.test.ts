import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";

process.env.JWT_SECRET = "test-jwt-pwa-phase9-iphone-v1";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-pwa-phase9-iphone-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const {
  resolveDrawingIds,
  buildLocalDrawingPayload,
  drawingLocalStorageKey,
  isTempDrawingId,
} = await import("../public/js/survey-drawing-local-v1.js");
const {
  DEFAULT_FIELD_CHECKLIST_ITEMS,
  buildDefaultChecklistItems,
  checklistStatusFromItems,
  fieldChecklistStorageKey,
  TEMP_FIELD_PROJECT_ID,
} = await import("../public/js/field-checklist-defaults-v1.js");

const app = createApp();
const publicDir = path.join(process.cwd(), "public");

describe("PWA Phase9 iPhone — survey-drawing direct launch", () => {
  it("resolveDrawingIds generates TEMP IDs when params missing", () => {
    const ids = resolveDrawingIds({});
    assert.match(ids.projectId, /^TEMP-PROJECT-\d+$/);
    assert.match(ids.sketchId, /^TEMP-SKETCH-\d+$/);
    assert.equal(ids.siteId, "TEMP-SITE");
    assert.equal(ids.customerId, "TEMP-CUSTOMER");
    assert.equal(ids.isLocalOnly, true);
    assert.equal(ids.isTempMode, true);
  });

  it("isTempDrawingId detects TEMP prefix", () => {
    assert.equal(isTempDrawingId("TEMP-PROJECT-1"), true);
    assert.equal(isTempDrawingId("MO-26-0709"), false);
  });

  it("buildLocalDrawingPayload stores lines/symbols/memos", () => {
    const payload = buildLocalDrawingPayload({
      projectId: "TEMP-PROJECT-1",
      sketchId: "TEMP-SKETCH-1",
      siteId: "TEMP-SITE",
      customerId: "TEMP-CUSTOMER",
      layers: {
        paths: [{ id: "p1", points: [{ x: 0, y: 0 }] }],
        symbols: [{ id: "s1", symbolType: "camera" }],
        notes: [{ id: "n1", text: "メモ" }],
      },
    });
    assert.equal(payload.lines.length, 1);
    assert.equal(payload.symbols.length, 1);
    assert.equal(payload.memos.length, 1);
    assert.ok(payload.updatedAt);
    assert.equal(drawingLocalStorageKey("A", "B"), "tisly:survey-drawing:A:B");
  });

  it("survey-drawing-v1 opens without projectId/sketchId (no error throw in JS)", async () => {
    const res = await request(app).get("/survey-drawing-v1");
    assert.equal(res.status, 200);
    const js = fs.readFileSync(path.join(publicDir, "js/survey-drawing-v1.js"), "utf-8");
    assert.match(js, /survey-drawing-ui-v4/);
    assert.match(js, /resolveDrawingIds/);
    assert.match(js, /saveDrawingToLocalStorage/);
    assert.doesNotMatch(js, /projectId または sketchId が必要です/);
    assert.match(res.text, /survey-drawing-ui-v4/);
  });

  it("survey-drawing-local-v1.js is served", async () => {
    const res = await request(app).get("/js/survey-drawing-local-v1.js");
    assert.equal(res.status, 200);
    assert.match(res.text, /tisly:survey-drawing:/);
  });
});

describe("PWA Phase9 iPhone — field checklist defaults", () => {
  it("DEFAULT_FIELD_CHECKLIST_ITEMS has 持ち物 and 現場確認", () => {
    assert.equal(DEFAULT_FIELD_CHECKLIST_ITEMS.length, 18);
    const tools = DEFAULT_FIELD_CHECKLIST_ITEMS.filter((i) => i.category === "持ち物");
    const site = DEFAULT_FIELD_CHECKLIST_ITEMS.filter((i) => i.category === "現場確認");
    assert.equal(tools.length, 9);
    assert.equal(site.length, 9);
    assert.ok(tools.some((i) => i.label === "工具一式"));
    assert.ok(site.some((i) => i.label === "お客様確認"));
  });

  it("buildDefaultChecklistItems restores checked state", () => {
    const items = buildDefaultChecklistItems([{ id: "def-持ち物-工具一式", checked: true, memo: "OK" }]);
    const tool = items.find((i) => i.label === "工具一式");
    assert.equal(tool?.checked, true);
    assert.equal(tool?.memo, "OK");
    const status = checklistStatusFromItems(items);
    assert.equal(status.total, 18);
    assert.equal(status.checked, 1);
    assert.equal(status.unchecked, 17);
  });

  it("field-checklist storage key uses TEMP-SITE fallback", () => {
    assert.equal(fieldChecklistStorageKey(""), `tisly:field-checklist:${TEMP_FIELD_PROJECT_ID}`);
  });

  it("field-checklist-v1?temp=1 page loads", async () => {
    const res = await request(app).get("/field-checklist-v1?temp=1");
    assert.equal(res.status, 200);
    const js = fs.readFileSync(path.join(publicDir, "js/field-checklist-v1.js"), "utf-8");
    assert.match(js, /openTempSite/);
    assert.match(js, /field-checklist-defaults-v1/);
  });

  it("field-checklist-ui applies default items when API empty", () => {
    const ui = fs.readFileSync(path.join(publicDir, "js/field-checklist-ui.js"), "utf-8");
    assert.match(ui, /buildDefaultChecklistItems/);
    assert.match(ui, /localOnly/);
    assert.match(ui, /saveFieldChecklistLocal/);
  });
});

describe("PWA Phase9 iPhone — bottom nav separation", () => {
  it("現場 → field-checklist-v1 · 材料 → field-check-v1 · 発注 → orders tab", () => {
    const nav = fs.readFileSync(path.join(publicDir, "js/tisly-practical-nav.js"), "utf-8");
    assert.match(nav, /field_site_v1.*field-checklist-v1/s);
    assert.match(nav, /field_check_v1.*field-check-v1/s);
    assert.match(nav, /purchase_v1.*tab=orders/s);
    const fieldCheckCount = (nav.match(/href: "\/field-check-v1"/g) || []).length;
    assert.equal(fieldCheckCount, 1);
  });

  it("field-check-v1 and field-checklist-v1 are different pages", async () => {
    const [a, b] = await Promise.all([
      request(app).get("/field-check-v1"),
      request(app).get("/field-checklist-v1"),
    ]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.match(a.text, /field-check-v1\.js/);
    assert.match(b.text, /field-checklist-v1\.js/);
  });
});

describe("PWA Phase9 iPhone — route-health", () => {
  it("route-health v8 includes Phase9 checks", async () => {
    const html = await request(app).get("/route-health");
    assert.equal(html.status, 200);
    assert.match(html.text, /route-health-v8/);
    assert.match(html.text, /iphone-verify-links/);
    assert.match(html.text, /Phase9/);

    const js = fs.readFileSync(path.join(publicDir, "js/route-health.js"), "utf-8");
    assert.match(js, /checkDrawingDirectLaunch/);
    assert.match(js, /checkFieldChecklistDefaults/);
    assert.match(js, /checkFieldChecklistSave/);
    assert.match(js, /v2399/);
    assert.match(js, /survey-drawing-ui-v4/);
  });

  it("service worker cache version bumped to v2399", () => {
    const sw = fs.readFileSync(path.join(publicDir, "service-worker.js"), "utf-8");
    assert.match(sw, /v2399-production/);
    assert.match(sw, /survey-drawing-local-v1\.js/);
    assert.match(sw, /field-checklist-defaults-v1\.js/);
  });
});

after(async () => {
  await closeDatabase();
});
