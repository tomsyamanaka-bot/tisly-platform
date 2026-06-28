import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const publicDir = path.join(process.cwd(), "public");

describe("Operational Phase30 — drawing editor zoom/pan UX", () => {
  it("survey-drawing has focal zoom and two-finger pan gesture", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/survey-drawing-v1.js"), "utf-8");
    assert.ok(js.includes("function zoomAt("));
    assert.ok(js.includes("touchGesture"));
    assert.ok(js.includes("touchMidpoint"));
    assert.ok(js.includes("setGestureActive"));
    assert.ok(js.includes("imageCoordsForPlot"));
    assert.ok(js.includes("PLOT_TOUCH_OFFSET_Y"));
  });

  it("survey-drawing HTML has collapsible tool strip toggle", () => {
    const html = fs.readFileSync(path.join(publicDir, "survey-drawing-v1.html"), "utf-8");
    assert.ok(html.includes('id="btn-toggle-tools"'));
    assert.ok(html.includes('id="drawing-tool-strip"'));
  });

  it("survey-drawing CSS has collapsed strip and plot preview", () => {
    const css = fs.readFileSync(path.join(publicDir, "css/survey-drawing-v1.css"), "utf-8");
    assert.ok(css.includes(".drawing-tool-strip.collapsed"));
    assert.ok(css.includes(".drawing-plot-preview"));
  });

  it("drawing canvas clientToNormalized accounts for transform rect", () => {
    const js = fs.readFileSync(
      path.join(publicDir, "js/features/drawing/drawing-editor-canvas-v1.js"),
      "utf-8"
    );
    assert.match(js, /getBoundingClientRect/);
    assert.match(js, /pointerType === "touch"/);
  });

  it("service worker bumped for phase30 drawing UX", () => {
    const sw = fs.readFileSync(path.join(publicDir, "service-worker.js"), "utf-8");
    assert.ok(sw.includes("tisly-pwa-v2408-phase30"));
  });
});
