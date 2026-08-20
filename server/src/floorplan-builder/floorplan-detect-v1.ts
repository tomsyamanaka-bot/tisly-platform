/**
 * 方眼紙間取り Auto-Detect オーケストレータ
 * Gemini Vision → 失敗時 rule_based_v1
 */

import {
  runFloorplanDetectGeminiV1,
  getLineImageGeminiApiKeyV1,
} from "./floorplan-detect-gemini-v1.js";
import {
  runFloorplanDetectRuleV1,
  type FloorplanDetectedRoomV1,
} from "./floorplan-detect-rule-v1.js";
import type { FloorplanOpeningV1 } from "./floorplan-types-v1.js";

export interface FloorplanDetectRequestV1 {
  imageBase64?: string;
  /** true のとき Vision を使わず rule_based のみ */
  forceRuleBased?: boolean;
}

export interface FloorplanDetectResponseV1 {
  ok: true;
  provider: "gemini" | "rule_based_v1";
  rooms: FloorplanDetectedRoomV1[];
  openings: FloorplanOpeningV1[];
  rawText: string;
  labelsFound: string[];
  reason: string | null;
  fallbackUsed: boolean;
}

export async function detectFloorplanFromImageV1(
  req: FloorplanDetectRequestV1
): Promise<FloorplanDetectResponseV1> {
  const forceRule = Boolean(req.forceRuleBased);
  const hasKey = Boolean(getLineImageGeminiApiKeyV1());
  const imageBase64 = String(req.imageBase64 || "").trim();

  if (!forceRule && hasKey && imageBase64.length > 64) {
    const gemini = await runFloorplanDetectGeminiV1({ imageBase64 });
    if (gemini.ok && gemini.rooms.length > 0) {
      return {
        ok: true,
        provider: "gemini",
        rooms: gemini.rooms,
        openings: gemini.openings,
        rawText: gemini.rawText,
        labelsFound: gemini.rooms.map((r) => r.label),
        reason: null,
        fallbackUsed: false,
      };
    }
    // Vision 失敗 → rule_based（OCR ヒント付き）
    const rule = runFloorplanDetectRuleV1({
      rawTextHint: gemini.rawText || "",
    });
    return {
      ok: true,
      provider: "rule_based_v1",
      rooms: rule.rooms,
      openings: rule.openings,
      rawText: gemini.rawText || "",
      labelsFound: rule.labelsFound,
      reason: gemini.reason || rule.reason,
      fallbackUsed: true,
    };
  }

  const rule = runFloorplanDetectRuleV1();
  return {
    ok: true,
    provider: "rule_based_v1",
    rooms: rule.rooms,
    openings: rule.openings,
    rawText: "",
    labelsFound: rule.labelsFound,
    reason: forceRule
      ? "force_rule_based"
      : !hasKey
        ? "no_gemini_key"
        : !imageBase64
          ? "no_image"
          : rule.reason,
    fallbackUsed: false,
  };
}
