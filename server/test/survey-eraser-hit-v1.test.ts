/**
 * 消しゴム Hit Testing — 最短1本だけ削除の回帰テスト
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";

const publicDir = path.join(process.cwd(), "public");
const eraserModPath = path.join(
  publicDir,
  "js/features/drawing/survey-eraser-hit-v1.js"
);

describe("survey eraser hit testing v1", () => {
  it("module exports single-path erase helpers", async () => {
    const mod = await import(pathToFileURL(eraserModPath).href);
    assert.equal(mod.ERASER_HIT_TOLERANCE_PX, 10);
    assert.ok(typeof mod.findClosestEraserHitIndex === "function");
    assert.ok(typeof mod.eraseClosestPathOnly === "function");
    assert.ok(typeof mod.minDistPathToEraser === "function");
    assert.ok(typeof mod.buildEraserSegments === "function");
  });

  it("erases only the closest path within 10px", async () => {
    const {
      eraseClosestPathOnly,
      findClosestEraserHitIndex,
    } = await import(pathToFileURL(eraserModPath).href);

    const paths = [
      {
        id: "far",
        tool: "pen",
        width: 3,
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
      },
      {
        id: "near",
        tool: "pen",
        width: 3,
        points: [
          { x: 0, y: 50 },
          { x: 100, y: 50 },
        ],
      },
      {
        id: "mid",
        tool: "pen",
        width: 3,
        points: [
          { x: 0, y: 20 },
          { x: 100, y: 20 },
        ],
      },
    ];
    const eraser = {
      tool: "eraser",
      width: 14,
      points: [{ x: 50, y: 51 }],
    };

    const hit = findClosestEraserHitIndex(paths, eraser);
    assert.equal(paths[hit].id, "near");

    const result = eraseClosestPathOnly(paths, eraser);
    assert.equal(result.removed, 1);
    assert.equal(result.paths.length, 2);
    assert.ok(result.paths.every((p) => p.id !== "near"));
    assert.ok(result.paths.some((p) => p.id === "far"));
    assert.ok(result.paths.some((p) => p.id === "mid"));
  });

  it("does not erase distant paths", async () => {
    const { eraseClosestPathOnly } = await import(
      pathToFileURL(eraserModPath).href
    );
    const paths = [
      {
        id: "a",
        tool: "pen",
        width: 3,
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
      },
      {
        id: "b",
        tool: "pen",
        width: 3,
        points: [
          { x: 0, y: 200 },
          { x: 10, y: 200 },
        ],
      },
    ];
    const eraser = {
      tool: "eraser",
      width: 14,
      points: [{ x: 5, y: 100 }],
    };
    const result = eraseClosestPathOnly(paths, eraser);
    assert.equal(result.removed, 0);
    assert.equal(result.paths.length, 2);
  });

  it("frontend wires module and cache versions", () => {
    const js = fs.readFileSync(
      path.join(publicDir, "js/survey-drawing-v1.js"),
      "utf-8"
    );
    const html = fs.readFileSync(
      path.join(publicDir, "survey-drawing-v1.html"),
      "utf-8"
    );
    const sw = fs.readFileSync(
      path.join(publicDir, "service-worker.js"),
      "utf-8"
    );
    const eraserSrc = fs.readFileSync(eraserModPath, "utf-8");

    assert.match(js, /survey-eraser-hit-v1\.js/);
    assert.match(js, /eraseClosestPathOnly/);
    assert.match(js, /applyEraserPhysicalDelete/);
    assert.match(js, /SURVEY_DRAWING_UI_VERSION = "survey-drawing-ui-v38"/);
    assert.match(html, /survey-drawing-ui-v38/);
    assert.ok(sw.includes("tisly-pwa-v2419-offline-voice"));
    assert.ok(sw.includes("survey-eraser-hit-v1.js"));
    assert.ok(eraserSrc.includes("cleaned.splice(hitIndex, 1)"));
    assert.doesNotMatch(js, /destination-out/);
    assert.doesNotMatch(js, /drawing-draw-mask-v1/);
  });
});
