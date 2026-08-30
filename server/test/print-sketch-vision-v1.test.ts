/**
 * print-sketch-vision-v1 — マルチアングル寸法抽出
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PRINT_SKETCH_MAX_IMAGES_V1,
  estimateDimsFromImageMetaV1,
  normalizeSketchImagePartsV1,
  parsePrintSketchImagesV1,
  parsePrintSketchRuleBasedV1,
} from "../src/print-generator/print-sketch-vision-v1.js";

describe("print-sketch-vision-v1", () => {
  it("normalizes data URLs and caps at 4", () => {
    const tiny = Buffer.from("fakepngdata12345678901234567890").toString(
      "base64"
    );
    const images = Array.from({ length: 5 }, (_, i) => ({
      dataUrl: `data:image/png;base64,${tiny}${i}`,
    }));
    const parts = normalizeSketchImagePartsV1(images);
    assert.equal(parts.length, PRINT_SKETCH_MAX_IMAGES_V1);
    assert.equal(parts[0].mimeType, "image/png");
  });

  it("averages multi-angle metas for rule-based dims", () => {
    const one = estimateDimsFromImageMetaV1([{ width: 900, height: 600 }]);
    const multi = estimateDimsFromImageMetaV1([
      { width: 900, height: 600 },
      { width: 700, height: 700 },
      { width: 800, height: 500 },
    ]);
    assert.ok(one.width != null && multi.width != null);
    assert.ok(multi.thickness != null && multi.thickness >= (one.thickness || 0));
    const r = parsePrintSketchRuleBasedV1({
      imageMetas: [
        { width: 900, height: 600 },
        { width: 700, height: 700 },
      ],
      hintText: "L字ステー",
    });
    assert.equal(r.ok, true);
    assert.equal(r.provider, "rule_based");
    assert.equal(r.templateId, "sensor_l_bracket");
    assert.ok(Object.keys(r.params).length > 0);
  });

  it("parsePrintSketchImagesV1 falls back without API key", async () => {
    const prev = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const tiny = Buffer.from("x".repeat(40)).toString("base64");
      const r = await parsePrintSketchImagesV1({
        images: [
          { dataUrl: `data:image/jpeg;base64,${tiny}` },
          { dataUrl: `data:image/jpeg;base64,${tiny}yy` },
        ],
        imageMetas: [
          { width: 1000, height: 700 },
          { width: 800, height: 800 },
        ],
        hintText: "IoTボックス",
      });
      assert.equal(r.ok, true);
      if (r.ok) {
        assert.equal(r.provider, "rule_based");
        assert.equal(r.templateId, "iot_box");
      }
    } finally {
      if (prev != null) process.env.GEMINI_API_KEY = prev;
    }
  });

  it("rejects empty images", async () => {
    const r = await parsePrintSketchImagesV1({ images: [] });
    assert.equal(r.ok, false);
  });
});
