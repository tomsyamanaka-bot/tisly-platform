/**
 * print-prompt-parse-v1 — 自然言語→3Dパラメータ
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectShapeFromTextV1,
  mapShapeToTemplateIdV1,
  metricClearanceHoleMmV1,
  parsePrintPromptRuleBasedV1,
  parsePrintPromptV1,
} from "../src/print-generator/print-prompt-parse-v1.js";

describe("print-prompt-parse-v1", () => {
  it("maps L bracket prompt to sensor_l_bracket params", () => {
    const prompt =
      "幅50mm、高さ30mm、M5のビス穴を2箇所あけたL字ステー";
    const r = parsePrintPromptRuleBasedV1(prompt);
    assert.equal(r.ok, true);
    assert.equal(r.provider, "rule_based");
    assert.equal(r.shape, "l_bracket");
    assert.equal(r.templateId, "sensor_l_bracket");
    assert.equal(r.dims.width, 50);
    assert.equal(r.dims.height, 30);
    assert.equal(r.dims.hole, metricClearanceHoleMmV1(5));
    assert.equal(r.features.holeCount, 2);
    assert.equal(r.params.base, 50);
    assert.equal(r.params.upright, 30);
    assert.ok(r.params.hole != null);
  });

  it("detects box / din / mount shapes", () => {
    assert.equal(detectShapeFromTextV1("IoTボックス筐体 90mm"), "box");
    assert.equal(
      mapShapeToTemplateIdV1("box"),
      "iot_box"
    );
    assert.equal(detectShapeFromTextV1("DINレールブラケット"), "din_rail");
    assert.equal(
      detectShapeFromTextV1("カメラマウント プレート幅60"),
      "mount"
    );
  });

  it("detects RP2350 cover and maps measured defaults", () => {
    assert.equal(
      detectShapeFromTextV1("RP2350-POE用 保護カバー クリアランス+0.5mm"),
      "rp2350_cover"
    );
    assert.equal(
      mapShapeToTemplateIdV1("rp2350_cover"),
      "rp2350_poe_cover"
    );
    const r = parsePrintPromptRuleBasedV1(
      "RP2350 端子フード クリアランス +0.6mm"
    );
    assert.equal(r.templateId, "rp2350_poe_cover");
    assert.equal(r.params.length, 154.2);
    assert.equal(r.params.outerWidth, 88.1);
    assert.equal(r.params.depth, 15.5);
    assert.equal(r.params.innerWidth, 69.5);
    assert.equal(r.params.bossH, 11.4);
    assert.equal(r.params.clearance, 0.6);
    assert.equal(r.params.holePitchLong ?? 145, 145);
    assert.equal(r.params.slitLeftLen ?? 115, 115);
    assert.equal(r.params.topThickness ?? 2, 2);
  });

  it("extracts special features flags", () => {
    const r = parsePrintPromptRuleBasedV1(
      "単管R溝とインサートナット、角R面取りのL字"
    );
    assert.equal(r.features.tubeGroove, true);
    assert.equal(r.features.insertNut, true);
    assert.equal(r.features.cornerFillet, true);
  });

  it("parsePrintPromptV1 falls back without API key", async () => {
    const prev = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const r = await parsePrintPromptV1(
        "幅40mm 奥行20mm 高さ25mm 板厚3mm のコの字"
      );
      assert.equal(r.ok, true);
      if (r.ok) {
        assert.equal(r.provider, "rule_based");
        assert.equal(r.templateId, "din_rail_bracket");
        assert.equal(r.params.width, 40);
      }
    } finally {
      if (prev != null) process.env.GEMINI_API_KEY = prev;
    }
  });

  it("rejects empty prompt", async () => {
    const r = await parsePrintPromptV1("   ");
    assert.equal(r.ok, false);
  });
});
