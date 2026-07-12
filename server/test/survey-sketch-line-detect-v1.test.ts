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

  it("方眼紙＋影ムラでも手書き壁を実検出できる", async () => {
    // 細い方眼 + グラデーション影 + 太い手書き矩形
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360">
        <defs>
          <linearGradient id="shade" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f8f8f8"/>
            <stop offset="100%" stop-color="#d0d0d0"/>
          </linearGradient>
        </defs>
        <rect width="480" height="360" fill="url(#shade)"/>
        ${Array.from({ length: 24 }, (_, i) => {
          const x = 20 + i * 18;
          return `<line x1="${x}" y1="10" x2="${x}" y2="350" stroke="#c8c8c8" stroke-width="1"/>`;
        }).join("")}
        ${Array.from({ length: 18 }, (_, i) => {
          const y = 20 + i * 18;
          return `<line x1="10" y1="${y}" x2="470" y2="${y}" stroke="#c8c8c8" stroke-width="1"/>`;
        }).join("")}
        <rect x="60" y="50" width="340" height="250" fill="none" stroke="#222" stroke-width="7"/>
        <line x1="230" y1="50" x2="230" y2="300" stroke="#222" stroke-width="6"/>
        <line x1="60" y1="170" x2="230" y2="170" stroke="#333" stroke-width="5"/>
      </svg>`
    );
    const png = await sharp(svg).png().toBuffer();
    const result = await detectSketchLinesFromBufferV1({
      buffer: png,
      fileName: "grid-sketch.jpg",
      canvasWidth: 800,
      canvasHeight: 600,
    });
    assert.equal(result.ok, true);
    assert.equal(
      result.usedFallback,
      false,
      `grid sketch should not fallback, got reason=${result.reason} paths=${result.paths.length}`
    );
    assert.ok(
      result.paths.length >= 2,
      `expected >=2 paths on grid paper, got ${result.paths.length}`
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
