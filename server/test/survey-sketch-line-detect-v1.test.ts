/**
 * 間取り線検出 v1 のフォールバック・実検出試験
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  buildFallbackOuterFramePathsV1,
  detectSketchLinesFromImagePathV1,
  detectSketchLinesFromBase64V1,
  detectSketchLinesFromBufferV1,
} from "../src/survey/survey-sketch-line-detect-v1.js";
import {
  parseMultipartBufferV1,
  pickMultipartImageV1,
} from "../src/survey/multipart-image-v1.js";

describe("survey-sketch-line-detect-v1", () => {
  it("外枠フォールバックは常に4本返す", () => {
    const paths = buildFallbackOuterFramePathsV1(800, 600);
    assert.equal(paths.length, 4);
    assert.ok(paths.every((p) => p.points.length === 2));
  });

  it("画像パス無しでも sketch_not_found で正常着地", async () => {
    const result = await detectSketchLinesFromImagePathV1({
      imagePath: null,
      fileName: "image_23.png",
      canvasWidth: 800,
      canvasHeight: 600,
    });
    assert.equal(result.ok, true);
    assert.equal(result.usedFallback, true);
    assert.equal(result.reason, "sketch_not_found");
    assert.equal(result.paths.length, 4);
    assert.equal(result.fileName, "image_23.png");
  });

  it("空 Base64 でも外枠フォールバック", async () => {
    const result = await detectSketchLinesFromBase64V1({
      imageBase64: "data:image/png;base64,QQ==",
      fileName: "image_23.png",
      canvasWidth: 800,
      canvasHeight: 600,
    });
    assert.equal(result.ok, true);
    assert.equal(result.usedFallback, true);
    assert.ok(result.paths.length >= 4);
  });

  it("矩形の間取り線を実検出できる", async () => {
    // 白地に黒い矩形＋内壁を描画
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
        <rect width="400" height="300" fill="white"/>
        <rect x="40" y="30" width="320" height="240" fill="none" stroke="black" stroke-width="6"/>
        <line x1="200" y1="30" x2="200" y2="270" stroke="black" stroke-width="5"/>
        <line x1="40" y1="150" x2="200" y2="150" stroke="black" stroke-width="5"/>
      </svg>`
    );
    const png = await sharp(svg).png().toBuffer();
    const result = await detectSketchLinesFromBufferV1({
      buffer: png,
      fileName: "sketch.jpg",
      canvasWidth: 800,
      canvasHeight: 600,
    });
    assert.equal(result.ok, true);
    assert.equal(result.usedFallback, false);
    assert.ok(
      result.paths.length >= 2,
      `expected >=2 paths, got ${result.paths.length}`
    );
  });

  it("multipart file パートを name 付きで抽出できる", () => {
    const boundary = "----TislyBound123";
    const jpegish = Buffer.from([0xff, 0xd8, 0xff, 0xd9, ...Buffer.alloc(40, 1)]);
    const parts = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="canvasWidth"',
      "",
      "800",
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="sketch.jpg"',
      "Content-Type: image/jpeg",
      "",
    ];
    const head = Buffer.from(parts.join("\r\n") + "\r\n");
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const raw = Buffer.concat([head, jpegish, tail]);
    const parsed = parseMultipartBufferV1(
      raw,
      `multipart/form-data; boundary=${boundary}`
    );
    assert.equal(parsed.fields.canvasWidth, "800");
    const img = pickMultipartImageV1(parsed);
    assert.ok(img);
    assert.equal(img.fileName, "sketch.jpg");
    assert.equal(img.mimeType, "image/jpeg");
    assert.ok(img.data.length >= 40);
  });
});
