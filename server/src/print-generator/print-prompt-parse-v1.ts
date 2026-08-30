/**
 * 自然言語プロンプト → 3D パラメータ抽出
 * Gemini 優先、失敗時はルールベース
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

const DEFAULT_MODEL = "gemini-2.0-flash";

export type PrintShapeIdV1 =
  | "l_bracket"
  | "u_channel"
  | "box"
  | "plate"
  | "mount"
  | "din_rail";

export type PrintTemplateIdV1 =
  | "din_rail_bracket"
  | "iot_box"
  | "camera_mount"
  | "sensor_l_bracket";

export interface PrintPromptFeaturesV1 {
  tubeGroove: boolean;
  insertNut: boolean;
  packingGroove: boolean;
  cornerFillet: boolean;
  holeCount: number;
}

export interface PrintPromptDimsV1 {
  width: number | null;
  depth: number | null;
  height: number | null;
  thickness: number | null;
  hole: number | null;
  holePitch: number | null;
}

export interface PrintPromptParseResultV1 {
  ok: true;
  provider: "gemini" | "rule_based";
  shape: PrintShapeIdV1;
  templateId: PrintTemplateIdV1;
  dims: PrintPromptDimsV1;
  features: PrintPromptFeaturesV1;
  /** テンプレート keys へ写像した寸法 */
  params: Record<string, number>;
  summary: string;
  rawText?: string;
}

export interface PrintPromptParseErrorV1 {
  ok: false;
  error: string;
}

function envTrim(key: string, fallback = ""): string {
  return (process.env[key] ?? fallback).trim();
}

export function getPrintPromptGeminiApiKeyV1(): string {
  return envTrim("GEMINI_API_KEY");
}

export function getPrintPromptGeminiModelV1(): string {
  return envTrim(
    "GEMINI_PRINT_PROMPT_MODEL",
    envTrim("GEMINI_SKETCH_MODEL", DEFAULT_MODEL)
  );
}

const EXTRACT_PROMPT = [
  "あなたは現場向け3Dプリント部品の寸法抽出AIです。",
  "説明や Markdown は出さず、JSON のみ返す。",
  "単位は mm。不明な数値は null。",
  "shape は次のいずれか:",
  "l_bracket | u_channel | box | plate | mount | din_rail",
  "features は boolean と holeCount(number)。",
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
  '  "summary": "短い日本語要約"',
  "}",
].join("\n");

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** M ねじ呼び径 → 通し穴径(mm) 概算 */
export function metricClearanceHoleMmV1(m: number): number {
  const table: Record<number, number> = {
    3: 3.4,
    4: 4.5,
    5: 5.5,
    6: 6.6,
    8: 9.0,
    10: 11.0,
  };
  if (table[m]) return table[m];
  return Math.round((m + 0.5) * 10) / 10;
}

export function mapShapeToTemplateIdV1(
  shape: PrintShapeIdV1
): PrintTemplateIdV1 {
  switch (shape) {
    case "l_bracket":
      return "sensor_l_bracket";
    case "u_channel":
    case "din_rail":
      return "din_rail_bracket";
    case "box":
      return "iot_box";
    case "plate":
    case "mount":
      return "camera_mount";
    default:
      return "sensor_l_bracket";
  }
}

export function detectShapeFromTextV1(text: string): PrintShapeIdV1 {
  const t = text.toLowerCase();
  if (/din|ディーアイエヌ|レールブラケット/.test(t)) return "din_rail";
  if (/コの字|ｕ字|u字|channel|チャンネル/.test(t)) return "u_channel";
  if (/ボックス|筐体|ケース|enclosure|box/.test(t)) return "box";
  if (/マウント|アーム|カメラ取付/.test(t)) return "mount";
  if (/プレート|板金|flat\s*plate|平板/.test(t)) return "plate";
  if (
    /[lｌＬL]字|エル字|アングル|ステー|ブラケット|angle\s*bracket/i.test(
      text
    )
  ) {
    return "l_bracket";
  }
  return "l_bracket";
}

function extractMmPair(
  text: string,
  labels: RegExp
): number | null {
  const m = text.match(
    new RegExp(
      `(?:${labels.source})\\s*[=:：]?\\s*([0-9]+(?:\\.[0-9]+)?)\\s*(?:mm|㎜)?`,
      "i"
    )
  );
  return m ? Number(m[1]) : null;
}

function parseFeaturesFromText(text: string): PrintPromptFeaturesV1 {
  const holeCountMatch = text.match(
    /(?:穴|ビス穴|通し穴|ねじ穴)\s*(?:を)?\s*([0-9]+)\s*(?:箇所|個|本)/
  );
  const holeCount = holeCountMatch
    ? Math.max(1, Number(holeCountMatch[1]) || 1)
    : /穴|ビス|ねじ/.test(text)
      ? 2
      : 0;
  return {
    tubeGroove: /単管|パイプ溝|Ｒ溝|R溝|tube\s*groove/i.test(text),
    insertNut: /インサート|ヒートセット|insert\s*nut/i.test(text),
    packingGroove: /パッキン|ガスケット|packing/i.test(text),
    cornerFillet: /角Ｒ|角R|面取り|フィレット|fillet/i.test(text),
    holeCount,
  };
}

function parseDimsFromText(text: string): PrintPromptDimsV1 {
  let width =
    extractMmPair(text, /幅|Ｗ|W|横/) ??
    (() => {
      const m = text.match(
        /([0-9]+(?:\.[0-9]+)?)\s*[x×✖]\s*([0-9]+(?:\.[0-9]+)?)/i
      );
      return m ? Number(m[1]) : null;
    })();
  let depth =
    extractMmPair(text, /奥行[きき]?|奥行き|Ｄ|D|深さ/) ?? null;
  let height =
    extractMmPair(text, /高[ささ]|Ｈ|H|立上[がり]|立上り/) ?? null;
  const thickness =
    extractMmPair(text, /板厚|肉厚|厚[ささ]|ｔ|t(?![a-z])/) ?? null;

  const mThread = text.match(/M\s*([0-9]{1,2})(?:\s*[×x]\s*[0-9.]+)?/i);
  let hole: number | null = extractMmPair(
    text,
    /穴径|孔径|Ø|φ|Φ|直径/
  );
  if (hole == null && mThread) {
    hole = metricClearanceHoleMmV1(Number(mThread[1]));
  }

  const holePitch =
    extractMmPair(text, /穴ピッチ|ピッチ|穴間|ピッチ間隔/) ?? null;

  // 「幅50mm、高さ30mm」だけで奥行が無い場合は幅の半分を仮置き
  if (width != null && depth == null && height != null) {
    depth = Math.round(width * 0.45 * 10) / 10;
  }
  if (width != null && height == null && depth != null) {
    height = Math.round(width * 0.7 * 10) / 10;
  }

  return { width, depth, height, thickness, hole, holePitch };
}

/**
 * 汎用寸法 → テンプレート固有 params
 */
export function mapDimsToTemplateParamsV1(
  templateId: PrintTemplateIdV1,
  dims: PrintPromptDimsV1,
  features: PrintPromptFeaturesV1
): Record<string, number> {
  const w = dims.width;
  const d = dims.depth;
  const h = dims.height;
  const t = dims.thickness;
  let hole = dims.hole;
  if (hole == null && features.insertNut) hole = 5.5;
  const pitch = dims.holePitch;

  /** @type {Record<string, number>} */
  const params: Record<string, number> = {};

  if (templateId === "sensor_l_bracket") {
    if (w != null) params.base = clamp(w, 20, 80);
    if (h != null) params.upright = clamp(h, 15, 70);
    if (d != null) params.width = clamp(d, 12, 40);
    else if (w != null) params.width = clamp(Math.round(w * 0.5), 12, 40);
    if (t != null) params.thickness = clamp(t, 1.5, 5);
    if (hole != null) params.hole = clamp(hole, 2.5, 6);
    if (pitch != null) params.holePitch = clamp(pitch, 10, 60);
  } else if (templateId === "din_rail_bracket") {
    if (w != null) params.width = clamp(w, 20, 80);
    if (d != null) params.depth = clamp(d, 12, 50);
    if (h != null) params.height = clamp(h, 10, 40);
    if (t != null) params.thickness = clamp(t, 1.5, 5);
    if (hole != null) params.hole = clamp(hole, 3, 6);
    if (pitch != null) params.holePitch = clamp(pitch, 10, 60);
  } else if (templateId === "iot_box") {
    if (w != null) params.width = clamp(w, 40, 160);
    if (d != null) params.depth = clamp(d, 30, 120);
    if (h != null) params.height = clamp(h, 20, 80);
    if (t != null) params.wall = clamp(t, 1.5, 4);
    if (features.packingGroove) params.lip = 2.2;
    if (pitch != null) params.holePitch = clamp(pitch, 10, 80);
  } else if (templateId === "camera_mount") {
    if (w != null) params.plateW = clamp(w, 30, 100);
    if (h != null) params.plateH = clamp(h, 25, 80);
    else if (d != null) params.plateH = clamp(d, 25, 80);
    if (t != null) params.plateT = clamp(t, 2, 6);
    if (d != null && h != null) params.armLen = clamp(d, 15, 60);
    if (hole != null) {
      params.armW = clamp(Math.max(hole * 2.2, 8), 8, 24);
    }
    if (pitch != null) params.holePitch = clamp(pitch, 10, 80);
  }

  if (features.cornerFillet && params.thickness == null && t == null) {
    // 面取り指定のみの場合は板厚をやや厚く
    if (templateId === "sensor_l_bracket") params.thickness = 3.2;
    if (templateId === "din_rail_bracket") params.thickness = 2.8;
  }
  if (features.tubeGroove && templateId === "sensor_l_bracket") {
    if (params.base == null) params.base = 48;
    if (params.upright == null) params.upright = 40;
  }

  return params;
}

function buildSummary(
  shape: PrintShapeIdV1,
  templateId: PrintTemplateIdV1,
  dims: PrintPromptDimsV1,
  features: PrintPromptFeaturesV1
): string {
  const parts = [
    `形状=${shape}`,
    `tpl=${templateId}`,
  ];
  if (dims.width != null) parts.push(`W${dims.width}`);
  if (dims.depth != null) parts.push(`D${dims.depth}`);
  if (dims.height != null) parts.push(`H${dims.height}`);
  if (dims.thickness != null) parts.push(`t${dims.thickness}`);
  if (dims.hole != null) parts.push(`Ø${dims.hole}`);
  if (dims.holePitch != null) parts.push(`P${dims.holePitch}`);
  if (features.holeCount > 0) parts.push(`穴${features.holeCount}`);
  const flags = [
    features.tubeGroove && "単管R",
    features.insertNut && "インサート",
    features.packingGroove && "パッキン溝",
    features.cornerFillet && "角R",
  ].filter(Boolean);
  if (flags.length) parts.push(flags.join("/"));
  return parts.join(" · ");
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

function safeParseJson(raw: string): Record<string, unknown> | null {
  const text = String(raw || "").trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function parsePrintPromptRuleBasedV1(
  prompt: string
): PrintPromptParseResultV1 {
  const text = String(prompt ?? "").trim();
  const shape = detectShapeFromTextV1(text || "L字ステー");
  const templateId = mapShapeToTemplateIdV1(shape);
  const dims = parseDimsFromText(text);
  const features = parseFeaturesFromText(text);
  // 寸法ゼロ件でもデフォルト形状で返す
  if (
    dims.width == null &&
    dims.depth == null &&
    dims.height == null &&
    dims.thickness == null &&
    dims.hole == null
  ) {
    if (/ｌ字|l字|L字|エル字|ステー|ブラケット/i.test(text)) {
      dims.width = 50;
      dims.height = 30;
      dims.hole = 5.5;
      features.holeCount = Math.max(features.holeCount, 2);
    }
  }
  const params = mapDimsToTemplateParamsV1(templateId, dims, features);
  return {
    ok: true,
    provider: "rule_based",
    shape,
    templateId,
    dims,
    features,
    params,
    summary: buildSummary(shape, templateId, dims, features),
  };
}

function fromGeminiPayload(
  parsed: Record<string, unknown>,
  fallbackText: string
): PrintPromptParseResultV1 {
  const shape = normalizeShape(parsed.shape);
  const templateId = mapShapeToTemplateIdV1(shape);
  const dimsRaw =
    parsed.dims && typeof parsed.dims === "object"
      ? (parsed.dims as Record<string, unknown>)
      : {};
  const featRaw =
    parsed.features && typeof parsed.features === "object"
      ? (parsed.features as Record<string, unknown>)
      : {};
  const dims: PrintPromptDimsV1 = {
    width: numOrNull(dimsRaw.width),
    depth: numOrNull(dimsRaw.depth),
    height: numOrNull(dimsRaw.height),
    thickness: numOrNull(dimsRaw.thickness),
    hole: numOrNull(dimsRaw.hole),
    holePitch: numOrNull(dimsRaw.holePitch),
  };
  const rule = parsePrintPromptRuleBasedV1(fallbackText);
  // Gemini 欠損はルールで補完
  const mergedDims: PrintPromptDimsV1 = {
    width: dims.width ?? rule.dims.width,
    depth: dims.depth ?? rule.dims.depth,
    height: dims.height ?? rule.dims.height,
    thickness: dims.thickness ?? rule.dims.thickness,
    hole: dims.hole ?? rule.dims.hole,
    holePitch: dims.holePitch ?? rule.dims.holePitch,
  };
  const features: PrintPromptFeaturesV1 = {
    tubeGroove: Boolean(featRaw.tubeGroove) || rule.features.tubeGroove,
    insertNut: Boolean(featRaw.insertNut) || rule.features.insertNut,
    packingGroove:
      Boolean(featRaw.packingGroove) || rule.features.packingGroove,
    cornerFillet:
      Boolean(featRaw.cornerFillet) || rule.features.cornerFillet,
    holeCount: Math.max(
      0,
      Number(featRaw.holeCount) || rule.features.holeCount || 0
    ),
  };
  const params = mapDimsToTemplateParamsV1(
    templateId,
    mergedDims,
    features
  );
  const summary =
    String(parsed.summary || "").trim() ||
    buildSummary(shape, templateId, mergedDims, features);
  return {
    ok: true,
    provider: "gemini",
    shape,
    templateId,
    dims: mergedDims,
    features,
    params,
    summary,
  };
}

/**
 * 自然言語プロンプトを 3D パラメータへ変換
 */
export async function parsePrintPromptV1(
  prompt: string
): Promise<PrintPromptParseResultV1 | PrintPromptParseErrorV1> {
  const text = String(prompt ?? "").trim();
  if (!text) {
    return { ok: false, error: "prompt is required" };
  }
  const apiKey = getPrintPromptGeminiApiKeyV1();
  if (!apiKey) {
    return parsePrintPromptRuleBasedV1(text);
  }
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: getPrintPromptGeminiModelV1(),
    });
    const result = await model.generateContent([
      { text: EXTRACT_PROMPT },
      { text: `現場プロンプト:\n${text.slice(0, 4000)}` },
    ]);
    const rawText = result.response.text();
    const parsed = safeParseJson(rawText);
    if (!parsed) {
      const fallback = parsePrintPromptRuleBasedV1(text);
      return { ...fallback, rawText };
    }
    const out = fromGeminiPayload(parsed, text);
    return { ...out, rawText };
  } catch {
    return parsePrintPromptRuleBasedV1(text);
  }
}
