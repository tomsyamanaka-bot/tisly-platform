/**
 * 間取り線検出 v1 のフォールバック試験
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildFallbackOuterFramePathsV1,
  detectSketchLinesFromImagePathV1,
  detectSketchLinesFromBase64V1,
} from "../src/survey/survey-sketch-line-detect-v1.js";

describe("survey-sketch-line-detect-v1", () => {
  it("外枠フォールバックは常に4本返す", () => {
    const paths = buildFallbackOuterFramePathsV1(800, 600);
    assert.equal(paths.length, 4);
    assert.ok(paths.every((p) => p.points.length === 2));
  });

  it("画像パス無しでも sketch_not_found で正常着地", async () => {
    const result = await detectSketchLinesFromImagePathV1({
      imagePath: null,
      fileName: "image_22.png",
      canvasWidth: 800,
      canvasHeight: 600,
    });
    assert.equal(result.ok, true);
    assert.equal(result.usedFallback, true);
    assert.equal(result.reason, "sketch_not_found");
    assert.equal(result.paths.length, 4);
    assert.equal(result.fileName, "image_22.png");
  });

  it("空 Base64 でも外枠フォールバック", async () => {
    const result = await detectSketchLinesFromBase64V1({
      imageBase64: "data:image/png;base64,QQ==",
      fileName: "image_22.png",
      canvasWidth: 800,
      canvasHeight: 600,
    });
    assert.equal(result.ok, true);
    assert.equal(result.usedFallback, true);
    assert.ok(result.paths.length >= 4);
  });
});
