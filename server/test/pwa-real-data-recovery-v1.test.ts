import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";

process.env.JWT_SECRET = "test-jwt-real-data-recovery-v1";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-real-data-recovery-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();
const publicDir = path.join(process.cwd(), "public");

describe("PWA real data recovery v1", () => {
  it("tisly-fetch-v1 has 30s timeout and Safari error normalization", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/tisly-fetch-v1.js"), "utf-8");
    assert.match(js, /DEFAULT_FETCH_TIMEOUT_MS = 30_000/);
    assert.match(js, /load failed/i);
    assert.match(js, /AbortController/);
    assert.match(js, /createLoadWatchdog/);
  });

  it("schedule-v1 uses shared fetch and specific schedule errors", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/schedule-v1.js"), "utf-8");
    assert.match(js, /tisly-fetch-v1\.js/);
    assert.match(js, /tisly-data-cache-v1\.js/);
    assert.match(js, /scheduleErrorHtml/);
    assert.match(js, /予定取得に失敗しました/);
    assert.match(js, /Google同期未設定/);
  });

  it("estimate-v1 uses bootstrap watchdog and load stage debug", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/estimate-v1.js"), "utf-8");
    assert.match(js, /ESTIMATE_UI_VERSION = "estimate-ui-v14"/);
    assert.match(js, /setLoadStage/);
    assert.match(js, /BOOTSTRAP_WATCHDOG_MS/);
    assert.match(js, /ENABLE_HEADER_DATE_AUTOSAVE = false/);
    assert.match(js, /tisly-fetch-v1\.js/);
    assert.match(js, /cacheSet\("estimate"/);
    assert.match(js, /field-checklist-ui\.js\?v=fc-ui-v3/);
    assert.match(js, /__estimateBootOk/);
    assert.match(js, /forceClearAllListLoading/);
  });

  it("estimate-v1 HTML exposes load debug element", async () => {
    const res = await request(app).get("/estimate-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /estimate-ui-v14/);
    assert.match(res.text, /estimate-load-debug/);
    assert.match(res.text, /HTML watchdog/);
  });

  it("pdf-share-v1 has no duplicate clearPrefetchPdfCache export", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/pdf-share-v1.js"), "utf-8");
    const exportFn = (js.match(/export\s+function\s+clearPrefetchPdfCache/g) || []).length;
    assert.equal(exportFn, 1);
    // export { ... } ブロック内に識別子として再登場していないこと（コメント行は除外）
    const exportBlock = js.match(/export\s*\{([\s\S]*?)\n\};/)?.[1] || "";
    const codeLines = exportBlock
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, "").trim())
      .filter(Boolean);
    assert.equal(
      codeLines.filter((l) => /\bclearPrefetchPdfCache\b/.test(l)).length,
      0,
      "must not re-export clearPrefetchPdfCache in export { } list"
    );
  });

  it("route-health checks data APIs with timing and diagnostics", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/route-health.js"), "utf-8");
    const html = fs.readFileSync(path.join(publicDir, "route-health.html"), "utf-8");
    assert.match(js, /probeDataApi/);
    assert.match(js, /checkAuthState/);
    assert.match(js, /checkGoogleCalendarState/);
    assert.match(js, /checkFieldChecklistJs/);
    assert.match(js, /Schedule API/);
    assert.match(js, /Invoice API/);
    assert.match(js, /estimate-ui-v14/);
    assert.match(js, /checkOldJsVersions/);
    assert.match(html, /verify-steps-list/);
    assert.match(html, /btn-iphone-refresh/);
    assert.match(html, /route-health-v\d+/);
  });

  it("field-checklist-ui.js has single escapeHtml declaration", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/field-checklist-ui.js"), "utf-8");
    const count = (js.match(/function escapeHtml/g) || []).length;
    assert.equal(count, 1, "duplicate escapeHtml breaks estimate-v1 module load");
  });

  it("friendly errors map Load failed to network message", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/tisly-friendly-errors.js"), "utf-8");
    assert.match(js, /load failed/i);
  });

  it("service worker cache bumped for recovery deploy", () => {
    const sw = fs.readFileSync(path.join(publicDir, "service-worker.js"), "utf-8");
    assert.match(sw, /v2418-pdf-share-bust/);
  });
});

after(async () => {
  await closeDatabase();
});
