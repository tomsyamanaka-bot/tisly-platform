/**
 * 方眼紙間取り — rule_based_v1（Vision 未設定 / 失敗時フォールバック）
 * 手書き平屋図面に近い既知レイアウトを返す。既存プリセットは非破壊。
 */

import type { FloorplanOpeningV1, FloorplanRoomV1 } from "./floorplan-types-v1.js";

export const FLOORPLAN_ROOM_PRESETS_V1 = [
  "玄関",
  "LDK",
  "リビング",
  "リビング洋",
  "キッチン",
  "勝手口",
  "勝手口キッチン",
  "台所",
  "和室",
  "和10畳",
  "和8畳",
  "洋室",
  "洋6畳",
  "寝室",
  "廊下",
  "土間",
  "風呂",
  "浴室",
  "洗面",
  "便所",
  "トイレ",
  "WC",
  "押入",
  "納戸",
  "階段",
  "メーター",
] as const;

export type FloorplanDetectedRoomV1 = FloorplanRoomV1 & {
  confidence?: number;
};

export interface FloorplanDetectRuleResultV1 {
  ok: true;
  provider: "rule_based_v1";
  rooms: FloorplanDetectedRoomV1[];
  openings: FloorplanOpeningV1[];
  labelsFound: string[];
  reason: string;
}

/** ユーザー提供の手書き方眼紙に近い平屋レイアウト（%座標） */
export function buildHandplanRoomsRuleV1(): FloorplanDetectedRoomV1[] {
  return [
    { id: "det-katte", label: "勝手口キッチン", x: 4, y: 4, w: 18, h: 18, confidence: 0.72 },
    { id: "det-living", label: "リビング洋", x: 4, y: 24, w: 28, h: 22, confidence: 0.78 },
    { id: "det-yo6a", label: "洋6畳", x: 4, y: 48, w: 20, h: 16, confidence: 0.75 },
    { id: "det-yo6b", label: "洋6畳", x: 4, y: 66, w: 20, h: 16, confidence: 0.75 },
    { id: "det-toilet", label: "便所", x: 34, y: 4, w: 12, h: 10, confidence: 0.7 },
    { id: "det-bath", label: "風呂", x: 46, y: 4, w: 14, h: 12, confidence: 0.7 },
    { id: "det-wc", label: "WC", x: 46, y: 16, w: 14, h: 8, confidence: 0.68 },
    { id: "det-stairs", label: "階段", x: 34, y: 16, w: 12, h: 14, confidence: 0.65 },
    { id: "det-doma", label: "土間", x: 36, y: 48, w: 22, h: 28, confidence: 0.74 },
    { id: "det-oshiire", label: "押入", x: 62, y: 4, w: 34, h: 18, confidence: 0.7 },
    { id: "det-wa10", label: "和10畳", x: 62, y: 28, w: 22, h: 30, confidence: 0.76 },
    { id: "det-wa8", label: "和8畳", x: 84, y: 28, w: 12, h: 30, confidence: 0.74 },
    { id: "det-hall", label: "廊下", x: 62, y: 72, w: 34, h: 14, confidence: 0.72 },
  ];
}

export function buildHandplanOpeningsRuleV1(): FloorplanOpeningV1[] {
  return [
    { id: "det-ent", kind: "entrance", label: "玄関", x: 48, y: 92 },
    { id: "det-back", kind: "backdoor", label: "勝手口", x: 8, y: 12 },
    { id: "det-meter", kind: "door", label: "メーター", x: 2, y: 28 },
  ];
}

/** OCR 風テキストから部屋名候補を拾う（Gemini rawText 再利用） */
export function extractRoomLabelsFromTextV1(rawText: string): string[] {
  const text = String(rawText || "");
  const found: string[] = [];
  for (const label of FLOORPLAN_ROOM_PRESETS_V1) {
    if (text.includes(label) && !found.includes(label)) found.push(label);
  }
  const extra = text.match(
    /(?:和|洋)\s*\d+\s*畳|LDK|リビング|キッチン|勝手口|土間|廊下|押入|便所|風呂|洗面|玄関|メーター/g
  );
  if (extra) {
    for (const e of extra) {
      const t = e.replace(/\s+/g, "");
      if (!found.includes(t)) found.push(t);
    }
  }
  return found;
}

/**
 * Vision 結果の部屋配列を正規化（0–100%、最小サイズ保証）
 */
export function normalizeDetectedRoomsV1(
  rooms: Array<Partial<FloorplanDetectedRoomV1> & { label?: string }>
): FloorplanDetectedRoomV1[] {
  const out: FloorplanDetectedRoomV1[] = [];
  let i = 0;
  for (const r of rooms) {
    const label = String(r.label || "").trim() || `部屋${i + 1}`;
    let x = Number(r.x);
    let y = Number(r.y);
    let w = Number(r.w);
    let h = Number(r.h);
    if (![x, y, w, h].every((n) => Number.isFinite(n))) continue;
    w = Math.max(6, Math.min(96, w));
    h = Math.max(6, Math.min(96, h));
    x = Math.max(0, Math.min(100 - w, x));
    y = Math.max(0, Math.min(100 - h, y));
    const id =
      String(r.id || "").trim() ||
      `det-${Date.now().toString(36)}-${i}`;
    out.push({
      id,
      label,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      w: Math.round(w * 10) / 10,
      h: Math.round(h * 10) / 10,
      confidence:
        typeof r.confidence === "number" && Number.isFinite(r.confidence)
          ? r.confidence
          : undefined,
    });
    i += 1;
  }
  return out;
}

/**
 * rule_based_v1: 手書き平屋テンプレを返す（デモ・オフライン）
 */
export function runFloorplanDetectRuleV1(options?: {
  rawTextHint?: string;
}): FloorplanDetectRuleResultV1 {
  const labelsFound = extractRoomLabelsFromTextV1(options?.rawTextHint || "");
  const rooms = buildHandplanRoomsRuleV1();
  // ヒントに含まれるラベルがあれば対応部屋名を寄せる
  if (labelsFound.length) {
    for (const room of rooms) {
      const hit = labelsFound.find(
        (l) => room.label.includes(l) || l.includes(room.label.slice(0, 2))
      );
      if (hit && hit.length >= 2) room.label = hit;
    }
  }
  return {
    ok: true,
    provider: "rule_based_v1",
    rooms,
    openings: buildHandplanOpeningsRuleV1(),
    labelsFound,
    reason: labelsFound.length
      ? "handplan_template_with_ocr_hints"
      : "handplan_template_fallback",
  };
}
