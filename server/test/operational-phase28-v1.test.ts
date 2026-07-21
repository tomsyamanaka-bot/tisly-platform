import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const publicDir = path.join(process.cwd(), "public");

describe("Operational Phase28 — PWA speed & drawing assets", () => {
  it("service worker has field-ops cache and drawing/voice-nav shells", () => {
    const sw = fs.readFileSync(path.join(publicDir, "service-worker.js"), "utf-8");
    assert.ok(sw.includes("tisly-pwa-v2417-module-fix"));
    assert.ok(sw.includes("FIELD_OPS_CACHE"));
    assert.ok(sw.includes("cacheFirstStaleWhileRevalidate"));
    assert.ok(sw.includes("isFieldOpsFastAsset"));
    assert.ok(sw.includes("/js/features/drawing/drawing-editor-v1.js"));
    assert.ok(sw.includes("/voice-nav-v1.html"));
    assert.ok(sw.includes("/js/features/voice-nav/voice-nav-v1.js"));
  });

  it("survey-drawing UI version v9 aligned in HTML and JS", () => {
    const html = fs.readFileSync(path.join(publicDir, "survey-drawing-v1.html"), "utf-8");
    const js = fs.readFileSync(path.join(publicDir, "js/survey-drawing-v1.js"), "utf-8");
    assert.match(html, /survey-drawing-ui-v38/);
    assert.match(js, /SURVEY_DRAWING_UI_VERSION = "survey-drawing-ui-v38"/);
    assert.ok(js.includes("releaseBgObjectUrl"));
    assert.ok(js.includes("withDrawingBgCacheBust"));
    assert.ok(js.includes("ensureSurveyBgPhotoLayer"));
    assert.ok(html.includes('id="survey-bg-photo-layer"'));
  });

  it("drawing canvas releases blob memory on background swap", () => {
    const canvas = fs.readFileSync(
      path.join(publicDir, "js/features/drawing/drawing-editor-canvas-v1.js"),
      "utf-8"
    );
    assert.ok(canvas.includes("releaseBgImageMemory"));
    assert.ok(canvas.includes("withBgCacheBust"));
    assert.ok(canvas.includes("URL.revokeObjectURL"));
  });
});
