/**
 * 方眼紙スケッチ（最大4枚）→ 寸法抽出
 * Gemini Vision 優先、失敗時はヒューリスティック
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  detectShapeFromTextV1,
  getPrintPromptGeminiApiKeyV1,
  getPrintPromptGeminiModelV1,
  mapDimsToTemplateParamsV1,
  mapShapeToTemplateIdV1,
  type PrintPromptDimsV1,
  type PrintPromptFeaturesV1,
  type PrintPromptParseResultV1,
  type PrintShapeIdV1,
} from "./print-prompt-parse-v1.js";

export const PRINT_SKETCH_MAX_IMAGES_V1 = 4;

export interface PrintSketchImageInputV1 {
  dataUrl?: string;
  base64?: string;
  mimeType?: string;
}

const VISION_PROMPT = [
  "あなたは現場向け3Dプリント部品の寸法抽出AIです。",
  "複数枚の方眼紙スケッチ（正面・側面・平面・斜め）を",
  "三面図として整合させ、遠近歪みや影を補正する。",
  "説明や Markdown は出さず、JSON のみ返す。",
  "単位は mm。不明な数値は null。",
  "shape は次のいずれか:",
  "l_bracket | u_channel | box | plate | mount | din_rail",
  "出力形式:",
  "{",
  '  "shape": "l_bracket",',
  '  "dims": {',
  '    "width": 50, "depth": 30, "height": 30,',
  '    "thickness": 3, "hole": 5.2, "holePitch": 25',
  "  },",
  '  "features": {',
  '    "tubeGroove": false, "insertNut": false,',
  '    "packingGroove": false, "cornerFillet": false,',
  '    "holeCount": 2',
  "  },",
  '  "summary": "短い日本語要約",',
  '  "confidence": 0.0',
  "}",
].join("\n");

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 10) / 10;
}

function safeParseJson(raw: string): Record<string, unknown> | null {
  const text = String(raw || "").trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

function normalizeShape(raw: unknown): PrintShapeIdV1 {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "u_channel" || s === "u" || s === "channel") return "u_channel";
  if (s === "box" || s === "enclosure") return "box";
  if (s === "plate") return "plate";
  if (s === "mount" || s === "camera_mount") return "mount";
  if (s === "din_rail" || s === "din") return "din_rail";
  return "l_bracket";
}

/**
 * data URL / base64 を Gemini inlineData 用に正規化
 */
export function normalizeSketchImagePartsV1(
  images: PrintSketchImageInputV1[]
): Array<{ mimeType: string; data: string }> {
  const out: Array<{ mimeType: string; data: string }> = [];
  for (const img of images.slice(0, PRINT_SKETCH_MAX_IMAGES_V1)) {
    const rawUrl = String(img?.dataUrl || "").trim();
    if (rawUrl.startsWith("data:")) {
      const m = rawUrl.match(
        /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/
      );
      if (m) {
        out.push({ mimeType: m[1], data: m[2] });
        continue;
      }
    }
    const b64 = String(img?.base64 || "").replace(/\s+/g, "");
    if (b64.length < 32) continue;
    const mime = String(img?.mimeType || "image/jpeg").trim() || "image/jpeg";
    out.push({
      mimeType: mime.startsWith("image/") ? mime : "image/jpeg",
      data: b64,
    });
  }
  return out;
}

/**
 * 画像サイズから概寸を推定（API 無しフォールバック）
 * 複数枚は平均して遠近歪みを緩和する
 */
export function estimateDimsFromImageMetaV1(
  metas: Array<{ width: number; height: number }>
): PrintPromptDimsV1 {
  if (!metas.length) {
    return {
      width: 40,
      depth: 25,
      height: 20,
      thickness: 3,
      hole: 4.2,
      holePitch: 20,
    };
  }
  let sumW = 0;
  let sumD = 0;
  let sumH = 0;
  for (const m of metas) {
    const short = Math.min(m.width, m.height);
    const long = Math.max(m.width, m.height);
    const mmPerPx = 40 / Math.max(short * 0.55, 1);
    sumW += long * mmPerPx * 0.42;
    sumD += short * mmPerPx * 0.38;
    sumH += (long * mmPerPx * 0.42 + short * mmPerPx * 0.38) / 6;
  }
  const n = metas.length;
  // 枚数が多いほど厚み推定をやや安定化
  const tBoost = n >= 2 ? 0.15 : 0;
  return {
    width: Math.round(sumW / n),
    depth: Math.round(sumD / n),
    height: Math.max(15, Math.round(sumH / n)),
    thickness: Math.round((2.8 + tBoost) * 10) / 10,
    hole: n >= 2 ? 4.5 : 4.2,
    holePitch: n >= 3 ? 22 : 20,
  };
}

function emptyFeatures(): PrintPromptFeaturesV1 {
  return {
    tubeGroove: false,
    insertNut: false,
    packingGroove: false,
    cornerFillet: false,
    holeCount: 0,
  };
}

function buildResult(
  shape: PrintShapeIdV1,
  dims: PrintPromptDimsV1,
  features: PrintPromptFeaturesV1,
  provider: "gemini" | "rule_based",
  summary: string,
  rawText?: string
): PrintPromptParseResultV1 {
  const templateId = mapShapeToTemplateIdV1(shape);
  const params = mapDimsToTemplateParamsV1(templateId, dims, features);
  return {
    ok: true,
    provider,
    shape,
    templateId,
    dims,
    features,
    params,
    summary,
    rawText,
  };
}

/**
 * メタ情報のみでのルールベース抽出
 */
export function parsePrintSketchRuleBasedV1(input: {
  imageMetas?: Array<{ width: number; height: number }>;
  hintText?: string;
}): PrintPromptParseResultV1 {
  const hint = String(input.hintText || "").trim();
  const shape = hint
    ? detectShapeFromTextV1(hint)
    : ("l_bracket" as PrintShapeIdV1);
  const dims = estimateDimsFromImageMetaV1(input.imageMetas || []);
  const features = emptyFeatures();
  if ((input.imageMetas?.length || 0) >= 2) {
    features.holeCount = 2;
  }
  const n = input.imageMetas?.length || 0;
  return buildResult(
    shape,
    dims,
    features,
    "rule_based",
    `マルチスケッチ推定(${n}枚) W${dims.width}×D${dims.depth}×H${dims.height}`
  );
}

function fromGeminiPayload(
  parsed: Record<string, unknown>,
  fallback: PrintPromptParseResultV1
): PrintPromptParseResultV1 {
  const shape = normalizeShape(parsed.shape ?? fallback.shape);
  const dimsRaw =
    parsed.dims && typeof parsed.dims === "object"
      ? (parsed.dims as Record<string, unknown>)
      : {};
  const featRaw =
    parsed.features && typeof parsed.features === "object"
      ? (parsed.features as Record<string, unknown>)
      : {};
  const dims: PrintPromptDimsV1 = {
    width: numOrNull(dimsRaw.width) ?? fallback.dims.width,
    depth: numOrNull(dimsRaw.depth) ?? fallback.dims.depth,
    height: numOrNull(dimsRaw.height) ?? fallback.dims.height,
    thickness: numOrNull(dimsRaw.thickness) ?? fallback.dims.thickness,
    hole: numOrNull(dimsRaw.hole) ?? fallback.dims.hole,
    holePitch: numOrNull(dimsRaw.holePitch) ?? fallback.dims.holePitch,
  };
  const features: PrintPromptFeaturesV1 = {
    tubeGroove: Boolean(featRaw.tubeGroove),
    insertNut: Boolean(featRaw.insertNut),
    packingGroove: Boolean(featRaw.packingGroove),
    cornerFillet: Boolean(featRaw.cornerFillet),
    holeCount: Math.max(
      0,
      Number(featRaw.holeCount) || fallback.features.holeCount || 0
    ),
  };
  const summary =
    String(parsed.summary || "").trim() ||
    `Gemini Vision 抽出 W${dims.width}×D${dims.depth}×H${dims.height}`;
  return buildResult(shape, dims, features, "gemini", summary);
}

/**
 * 複数スケッチ画像から寸法を抽出
 */
export async function parsePrintSketchImagesV1(input: {
  images: PrintSketchImageInputV1[];
  hintText?: string;
  imageMetas?: Array<{ width: number; height: number }>;
}): Promise<
  PrintPromptParseResultV1 | { ok: false; error: string }
> {
  const parts = normalizeSketchImagePartsV1(input.images || []);
  if (!parts.length) {
    return { ok: false, error: "images required (max 4)" };
  }

  const fallback = parsePrintSketchRuleBasedV1({
    imageMetas:
      input.imageMetas && input.imageMetas.length
        ? input.imageMetas
        : parts.map(() => ({ width: 800, height: 600 })),
    hintText: input.hintText,
  });

  const apiKey = getPrintPromptGeminiApiKeyV1();
  if (!apiKey) {
    return {
      ...fallback,
      summary: `${fallback.summary}（ルール・${parts.length}枚）`,
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: getPrintPromptGeminiModelV1(),
    });
    const content: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [
      { text: VISION_PROMPT },
      {
        text: `画像枚数: ${parts.length}（三面図として整合してください）\n補助ヒント: ${String(input.hintText || "").slice(0, 500)}`,
      },
    ];
    for (const p of parts) {
      content.push({
        inlineData: { mimeType: p.mimeType, data: p.data },
      });
    }
    const result = await model.generateContent(content);
    const rawText = result.response.text();
    const parsed = safeParseJson(rawText);
    if (!parsed) {
      return { ...fallback, rawText };
    }
    return { ...fromGeminiPayload(parsed, fallback), rawText };
  } catch {
    return fallback;
  }
}
