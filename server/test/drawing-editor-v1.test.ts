import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DRAWING_EDITOR_PAYLOAD_SCHEMA_VERSION,
  DRAWING_EDITOR_SYMBOL_CATALOG_V1,
  buildDrawingEditorPdfPayloadV1,
} from "../src/features/drawing/index.js";

describe("drawing-editor-v1 基盤", () => {
  it("記号カタログに 3 種が定義されている", () => {
    assert.equal(DRAWING_EDITOR_SYMBOL_CATALOG_V1.length, 3);
    assert.deepEqual(
      DRAWING_EDITOR_SYMBOL_CATALOG_V1.map((s) => s.symbolType),
      ["outlet", "light", "switch"]
    );
  });

  it("PDF ペイロードを組み立てられる", () => {
    const payload = buildDrawingEditorPdfPayloadV1({
      backgroundImageUrl: "https://example.com/grid.jpg",
      canvasWidth: 1200,
      canvasHeight: 800,
      symbols: [
        {
          id: "s1",
          symbolType: "outlet",
          icon: "🔌",
          label: "コンセント",
          x: 0.25,
          y: 0.5,
        },
      ],
      exportedAt: "2026-06-27T00:00:00.000Z",
    });

    assert.equal(payload.schemaVersion, DRAWING_EDITOR_PAYLOAD_SCHEMA_VERSION);
    assert.equal(payload.backgroundImageUrl, "https://example.com/grid.jpg");
    assert.equal(payload.canvasWidth, 1200);
    assert.equal(payload.canvasHeight, 800);
    assert.equal(payload.symbols.length, 1);
    assert.equal(payload.symbols[0].symbolType, "outlet");
    assert.equal(payload.exportedAt, "2026-06-27T00:00:00.000Z");
  });

  it("座標は 0〜1 にクランプされる", () => {
    const payload = buildDrawingEditorPdfPayloadV1({
      backgroundImageUrl: "/dummy.png",
      canvasWidth: 100,
      canvasHeight: 100,
      symbols: [
        {
          id: "x",
          symbolType: "light",
          icon: "💡",
          label: "照明",
          x: 1.5,
          y: -0.2,
        },
      ],
    });
    assert.equal(payload.symbols[0].x, 1);
    assert.equal(payload.symbols[0].y, 0);
  });
});
