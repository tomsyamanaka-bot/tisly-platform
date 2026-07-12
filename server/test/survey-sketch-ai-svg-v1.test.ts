/**
 * 壁輪郭 SVG Vision（Gemini）v1 — サニタイズ / mock 試験
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractSvgElementV1,
  sanitizeAiWallSvgResponseV1,
  stripMarkdownCodeFencesV1,
} from "../src/survey/survey-sketch-ai-svg-sanitize.js";
import {
  buildMockAiWallSvgV1,
  MOCK_AI_WALL_SVG_V1,
} from "../src/survey/survey-sketch-ai-svg-mock-provider.js";
import {
  extractAiWallSvgFromBufferV1,
  resolveSurveySketchAiSvgProviderV1,
  SURVEY_SKETCH_AI_SVG_PROMPT_V1,
} from "../src/survey/survey-sketch-ai-svg-v1.js";

describe("survey-sketch-ai-svg-sanitize", () => {
  it("Markdown フェンスから SVG を抽出できる", () => {
    const raw = [
      "以下が結果です:",
      "```svg",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">',
      '<path d="M1 1 H9 V9 H1 Z"/>',
      "</svg>",
      "```",
    ].join("\n");
    const svg = sanitizeAiWallSvgResponseV1(raw);
    assert.ok(svg);
    assert.match(svg!, /^<svg\b/i);
    assert.match(svg!, /<\/svg>$/i);
    assert.match(svg!, /<path\b/i);
  });

  it("script とイベント属性を除去する", () => {
    const raw = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"',
      ' onclick="alert(1)">',
      "<script>alert(1)</script>",
      '<path d="M1 1 L9 9"/>',
      "</svg>",
    ].join("");
    const svg = sanitizeAiWallSvgResponseV1(raw);
    assert.ok(svg);
    assert.doesNotMatch(svg!, /script/i);
    assert.doesNotMatch(svg!, /onclick/i);
    assert.match(svg!, /<path\b/i);
  });

  it("フェンス除去ヘルパーが動作する", () => {
    const inner = stripMarkdownCodeFencesV1(
      "```xml\n<svg></svg>\n```"
    );
    assert.equal(inner, "<svg></svg>");
    assert.equal(
      extractSvgElementV1("no svg here"),
      null
    );
  });
});

describe("survey-sketch-ai-svg-mock", () => {
  it("固定ダミー SVG は有効な svg タグを含む", () => {
    assert.match(MOCK_AI_WALL_SVG_V1, /^<svg\b/);
    assert.match(MOCK_AI_WALL_SVG_V1, /<\/svg>$/);
    const sized = buildMockAiWallSvgV1(640, 480);
    assert.match(sized, /viewBox="0 0 640 480"/);
  });

  it("キー未設定時は mock プロバイダを選ぶ", () => {
    const prevKey = process.env.GEMINI_API_KEY;
    const prevMode = process.env.SURVEY_SKETCH_AI_SVG_PROVIDER;
    try {
      delete process.env.GEMINI_API_KEY;
      process.env.SURVEY_SKETCH_AI_SVG_PROVIDER = "auto";
      const resolved = resolveSurveySketchAiSvgProviderV1();
      assert.equal(resolved.resolvedId, "mock");
      assert.ok(resolved.reason);
    } finally {
      if (prevKey == null) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prevKey;
      if (prevMode == null) {
        delete process.env.SURVEY_SKETCH_AI_SVG_PROVIDER;
      } else {
        process.env.SURVEY_SKETCH_AI_SVG_PROVIDER = prevMode;
      }
    }
  });

  it("空バッファでも aiWallSvg を返す", async () => {
    const prevMode = process.env.SURVEY_SKETCH_AI_SVG_PROVIDER;
    try {
      process.env.SURVEY_SKETCH_AI_SVG_PROVIDER = "mock";
      const result = await extractAiWallSvgFromBufferV1({
        buffer: Buffer.alloc(0),
        fileName: "sketch.jpg",
        canvasWidth: 800,
        canvasHeight: 600,
      });
      assert.equal(result.ok, true);
      assert.equal(result.usedMock, true);
      assert.match(result.aiWallSvg, /^<svg\b/);
      assert.equal(result.reason, "empty_blob");
    } finally {
      if (prevMode == null) {
        delete process.env.SURVEY_SKETCH_AI_SVG_PROVIDER;
      } else {
        process.env.SURVEY_SKETCH_AI_SVG_PROVIDER = prevMode;
      }
    }
  });

  it("プロンプトに方眼紙無視の指示が含まれる", () => {
    assert.match(
      SURVEY_SKETCH_AI_SVG_PROMPT_V1,
      /方眼紙のマス目や影/
    );
    assert.match(
      SURVEY_SKETCH_AI_SVG_PROMPT_V1,
      /クリーンな SVG/
    );
  });
});
