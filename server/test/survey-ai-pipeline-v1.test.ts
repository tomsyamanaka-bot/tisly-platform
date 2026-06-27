import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDrawingEditorSvgMarkupV1 } from "../src/features/drawing/drawing-editor-pdf-render-v1.js";
import { buildDrawingEditorPdfPayloadV1 } from "../src/features/drawing/index.js";
import {
  toSurveyAiPipelineUserError,
  SurveyAiPipelineError,
  runSurveyAiPipelineV1Safe,
} from "../src/survey/survey-ai-pipeline-v1.js";
import { sketchToDrawingPdfPayloadV1 } from "../src/survey/survey-ai-pipeline-v1.js";
import type { SurveyDrawingSketchV1 } from "../src/survey/survey-drawing-v1-types.js";

describe("survey-ai-pipeline-v1", () => {
  it("sketchToDrawingPdfPayloadV1 は editorV1 を優先する", () => {
    const sketch = {
      backgroundImageUrl: "/uploads/bg.jpg",
      layers: {
        canvasWidth: 800,
        canvasHeight: 600,
        paths: [],
        symbols: [],
        notes: [],
        editorV1: {
          symbols: [
            {
              id: "s1",
              symbolType: "outlet",
              icon: "🔌",
              label: "コンセント",
              x: 0.5,
              y: 0.5,
            },
          ],
          routes: [
            {
              id: "r1",
              lineType: "generic",
              color: "#000",
              width: 3,
              points: [
                { x: 0.1, y: 0.1 },
                { x: 0.9, y: 0.9 },
              ],
            },
          ],
        },
      },
    } as unknown as SurveyDrawingSketchV1;

    const payload = sketchToDrawingPdfPayloadV1(sketch);
    assert.equal(payload.symbols.length, 1);
    assert.equal(payload.routes.length, 1);
  });

  it("buildDrawingEditorSvgMarkupV1 は SVG に path と text を含む", () => {
    const payload = buildDrawingEditorPdfPayloadV1({
      backgroundImageUrl: "https://example.com/bg.jpg",
      canvasWidth: 400,
      canvasHeight: 300,
      symbols: [
        {
          id: "s1",
          symbolType: "light",
          icon: "💡",
          label: "照明",
          x: 0.5,
          y: 0.5,
        },
      ],
      routes: [
        {
          id: "r1",
          lineType: "lan",
          color: "#2563eb",
          width: 3,
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
      ],
    });
    const svg = buildDrawingEditorSvgMarkupV1(payload);
    assert.match(svg, /<svg/);
    assert.match(svg, /<path/);
    assert.match(svg, /💡/);
    assert.match(svg, /example\.com\/bg\.jpg/);
  });

  it("runSurveyAiPipelineV1Safe は存在しない sketch で職人向けメッセージを返す", () => {
    const result = runSurveyAiPipelineV1Safe({ sketchId: "missing-sketch-id" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "SKETCH_NOT_FOUND");
      assert.match(result.userMessage, /図面データが見つかりません/);
    }
  });

  it("toSurveyAiPipelineUserError は TIMEOUT を日本語で案内する", () => {
    const mapped = toSurveyAiPipelineUserError(
      new SurveyAiPipelineError(
        "TIMEOUT",
        "処理がタイムアウトしました。電波状況を確認して再試行してください。",
        "timeout"
      )
    );
    assert.equal(mapped.code, "TIMEOUT");
    assert.match(mapped.userMessage, /電波状況/);
  });
});
