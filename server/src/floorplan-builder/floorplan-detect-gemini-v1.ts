/**
 * 方眼紙間取り — Gemini Vision 解析
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import sharp from "sharp";
import {
  normalizeDetectedRoomsV1,
  type FloorplanDetectedRoomV1,
} from "./floorplan-detect-rule-v1.js";
import type { FloorplanOpeningV1 } from "./floorplan-types-v1.js";
import {
  decodeLineImageBase64V1,
  getLineImageGeminiApiKeyV1,
  getLineImageGeminiModelV1,
} from "../estimate/line-image-gemini-vision-v1.js";

const ANALYZE_MAX = 1600;

export const FLOORPLAN_DETECT_GEMINI_PROMPT_V1 = [
  "あなたは日本の住宅間取り図（方眼紙の手書きスケッチ）を解析するアシスタントです。",
  "画像内の部屋枠（黒線の矩形）と手書きラベル（和室・洋室・リビング・廊下等）を読み取り、",
  "各部屋の位置を 0〜100 の正規化パーセント座標で返す。",
  "",
  "【座標系】左上が (0,0)、右下が (100,100)。x/y は左上、w/h は幅・高さ。",
  "【厳守】説明文や Markdown は出さず JSON のみ。推測で存在しない大きな部屋を増やしすぎない。",
  "【出力形式】",
  '{ "rawText": "読めた文字を改行区切り", "rooms": [',
  '  { "id": "r1", "label": "リビング洋", "x": 4, "y": 24, "w": 28, "h": 22, "confidence": 0.8 }',
  '], "openings": [',
  '  { "id": "o1", "kind": "entrance", "label": "玄関", "x": 50, "y": 92 }',
  "] }",
  "kind は entrance / backdoor / window / door のいずれか。",
  "ラベル例: 玄関, LDK, リビング, キッチン, 勝手口, 和室, 洋室, 寝室, 廊下, 土間, 風呂, 洗面, 便所, 押入, 階段。",
].join("\n");

export interface FloorplanDetectGeminiResultV1 {
  ok: boolean;
  provider: "gemini";
  rawText: string;
  rooms: FloorplanDetectedRoomV1[];
  openings: FloorplanOpeningV1[];
  reason: string | null;
}

function clamp01to100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export function parseFloorplanDetectGeminiJsonV1(raw: string): {
  rawText: string;
  rooms: FloorplanDetectedRoomV1[];
  openings: FloorplanOpeningV1[];
} | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] || text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as {
      rawText?: unknown;
      rooms?: unknown;
      openings?: unknown;
    };
    const rawText = String(parsed.rawText ?? "").trim();
    const roomRows = Array.isArray(parsed.rooms) ? parsed.rooms : [];
    const rooms = normalizeDetectedRoomsV1(
      roomRows.map((row, idx) => {
        const r = (row && typeof row === "object" ? row : {}) as Record<
          string,
          unknown
        >;
        return {
          id: String(r.id || `g-${idx}`),
          label: String(r.label || r.name || "").trim(),
          x: Number(r.x),
          y: Number(r.y),
          w: Number(r.w),
          h: Number(r.h),
          confidence: Number(r.confidence),
        };
      })
    );
    const openings: FloorplanOpeningV1[] = [];
    if (Array.isArray(parsed.openings)) {
      let oi = 0;
      for (const row of parsed.openings) {
        if (!row || typeof row !== "object") continue;
        const o = row as Record<string, unknown>;
        const kindRaw = String(o.kind || "door");
        const kind =
          kindRaw === "entrance" ||
          kindRaw === "backdoor" ||
          kindRaw === "window" ||
          kindRaw === "door"
            ? kindRaw
            : "door";
        openings.push({
          id: String(o.id || `go-${oi}`),
          kind,
          label: String(o.label || kind).trim() || kind,
          x: clamp01to100(Number(o.x)),
          y: clamp01to100(Number(o.y)),
        });
        oi += 1;
      }
    }
    if (!rooms.length) return null;
    return { rawText, rooms, openings };
  } catch {
    return null;
  }
}

async function prepareImage(buffer: Buffer): Promise<{
  data: Buffer;
  mimeType: string;
}> {
  const resized = await sharp(buffer)
    .rotate()
    .resize({
      width: ANALYZE_MAX,
      height: ANALYZE_MAX,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 88 })
    .toBuffer();
  return { data: resized, mimeType: "image/jpeg" };
}

export async function runFloorplanDetectGeminiV1(input: {
  imageBase64: string;
  apiKey?: string;
  model?: string;
}): Promise<FloorplanDetectGeminiResultV1> {
  const apiKey = (input.apiKey || getLineImageGeminiApiKeyV1()).trim();
  if (!apiKey) {
    return {
      ok: false,
      provider: "gemini",
      rawText: "",
      rooms: [],
      openings: [],
      reason: "missing_api_key",
    };
  }
  const buf = decodeLineImageBase64V1(input.imageBase64);
  if (!buf) {
    return {
      ok: false,
      provider: "gemini",
      rawText: "",
      rooms: [],
      openings: [],
      reason: "invalid_image",
    };
  }

  try {
    const prepared = await prepareImage(buf);
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: input.model || getLineImageGeminiModelV1(),
    });
    const result = await model.generateContent([
      { text: FLOORPLAN_DETECT_GEMINI_PROMPT_V1 },
      {
        inlineData: {
          mimeType: prepared.mimeType,
          data: prepared.data.toString("base64"),
        },
      },
    ]);
    const rawResponse = result.response.text() ?? "";
    const parsed = parseFloorplanDetectGeminiJsonV1(rawResponse);
    if (!parsed) {
      return {
        ok: false,
        provider: "gemini",
        rawText: rawResponse.trim(),
        rooms: [],
        openings: [],
        reason: "json_parse_failed",
      };
    }
    return {
      ok: true,
      provider: "gemini",
      rawText: parsed.rawText,
      rooms: parsed.rooms,
      openings: parsed.openings,
      reason: null,
    };
  } catch (err) {
    return {
      ok: false,
      provider: "gemini",
      rawText: "",
      rooms: [],
      openings: [],
      reason: err instanceof Error ? err.message : "gemini_error",
    };
  }
}

export { decodeLineImageBase64V1, getLineImageGeminiApiKeyV1 };
