/**
 * Phase 3–5 — aiWallSvg 永続化 / フロント描画マーカー
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  emptySurveyDrawingLayersV2,
  migrateLayersToV2,
  normalizeAiWallSvgV1,
} from "../src/survey/survey-drawing-v1-types.js";

const publicDir = path.join(process.cwd(), "public");

describe("survey aiWallSvg Phase3–5", () => {
  it("normalizeAiWallSvgV1 accepts string and object", () => {
    const fromStr = normalizeAiWallSvgV1(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><path d="M0 0"/></svg>'
    );
    assert.ok(fromStr);
    assert.match(fromStr!.markup, /^<svg\b/);
    assert.equal(fromStr!.viewBox, "0 0 800 600");

    const fromObj = normalizeAiWallSvgV1({
      markup: fromStr!.markup,
      viewBox: "0 0 640 480",
      provider: "mock",
    });
    assert.equal(fromObj!.viewBox, "0 0 640 480");
    assert.equal(fromObj!.provider, "mock");
    assert.equal(normalizeAiWallSvgV1(null), null);
    assert.equal(normalizeAiWallSvgV1("<div/>"), null);
  });

  it("migrateLayersToV2 persists aiWallSvg", () => {
    const raw = {
      ...emptySurveyDrawingLayersV2(800, 600),
      aiWallSvg: {
        markup:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
        viewBox: "0 0 10 10",
      },
    };
    const migrated = migrateLayersToV2(raw);
    assert.ok(migrated.aiWallSvg);
    assert.match(migrated.aiWallSvg!.markup, /<rect\b/);
  });

  it("frontend has AI wall layer and no client Canny detect", () => {
    const html = fs.readFileSync(
      path.join(publicDir, "survey-drawing-v1.html"),
      "utf-8"
    );
    const js = fs.readFileSync(
      path.join(publicDir, "js/survey-drawing-v1.js"),
      "utf-8"
    );
    const autoDraw = fs.readFileSync(
      path.join(publicDir, "js/features/drawing/survey-sketch-auto-draw-v1.js"),
      "utf-8"
    );
    const wallJs = fs.readFileSync(
      path.join(publicDir, "js/features/drawing/survey-ai-wall-svg-v1.js"),
      "utf-8"
    );
    const sw = fs.readFileSync(
      path.join(publicDir, "service-worker.js"),
      "utf-8"
    );

    assert.match(html, /id="survey-ai-wall-svg-layer"/);
    assert.match(html, /survey-drawing-ui-v38/);
    assert.match(js, /SURVEY_DRAWING_UI_VERSION = "survey-drawing-ui-v38"/);
    assert.match(js, /applyAiWallSvgFromApi/);
    assert.match(js, /renderAiWallSvgLayerV1/);
    assert.doesNotMatch(js, /detectSketchLinesFromBlobV1/);
    assert.doesNotMatch(js, /lineDetect\?\.paths/);
    assert.doesNotMatch(autoDraw, /cannyEdgeDetect/);
    assert.match(wallJs, /DOMParser/);
    assert.match(wallJs, /mountSafeAiWallSvgV1/);
    assert.ok(sw.includes("tisly-pwa-v2416-freeze-fix"));
    assert.ok(sw.includes("survey-ai-wall-svg-v1.js"));
  });
});
