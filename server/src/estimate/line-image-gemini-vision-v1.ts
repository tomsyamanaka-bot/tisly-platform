/**
 * LINE見積スクショ向け Gemini Vision OCR。
 * 画像から文字を読み取り、明細 JSON 候補も返す。
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import sharp from "sharp";

/** 解析用最大辺（トークン・帯域節約） */
const ANALYZE_MAX = 1600;

/** 既定モデル（軽量 Vision） */
const DEFAULT_MODEL = "gemini-2.0-flash";

export const LINE_IMAGE_GEMINI_PROMPT_V1 = [
  "あなたは電気・空調・防犯工事の見積明細OCRアシスタントです。",
  "入力画像は LINE トークや手書きメモ、見積スクショです。",
  "",
  "【厳守】",
  "・画像内の品名・数量・単価・金額を正確に読み取れ。",
  "・推測で存在しない品目を追加しない。",
  "・説明文や Markdown は出さず、JSON のみ返す。",
  "・出力形式:",
  '{ "rawText": "改行区切りの全文", "items": [',
  '  { "name": "品名", "quantity": 1, "unit": "式", "unitPrice": 0 }',
  "] }",
  "・円表記（例: 105,000円）は unitPrice に数値で入れる。",
  "・「×3台」「3台」は quantity / unit に反映する。",
  "・金額が総額で数量がある場合は単価=金額÷数量を優先。",
  "・品名に [LINE画像解析] 等のタグを付けない。",
].join("\n");

export interface LineImageGeminiVisionItemV1 {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

export interface LineImageGeminiVisionResultV1 {
  ok: boolean;
  provider: "gemini";
  rawText: string;
  items: LineImageGeminiVisionItemV1[];
  reason: string | null;
  rawResponseLength: number;
}

function envTrim(key: string, fallback = ""): string {
  return (process.env[key] ?? fallback).trim();
}

/**
 * GEMINI_API_KEY を環境変数から取得
 */
export function getLineImageGeminiApiKeyV1(): string {
  return envTrim("GEMINI_API_KEY");
}

/**
 * 見積LINE画像用モデル名
 */
export function getLineImageGeminiModelV1(): string {
  return envTrim(
    "GEMINI_ESTIMATE_LINE_MODEL",
    envTrim("GEMINI_SKETCH_MODEL", DEFAULT_MODEL)
  );
}

/**
 * data URL / 生 base64 を Buffer 化
 */
export function decodeLineImageBase64V1(
  imageBase64: string
): Buffer | null {
  const raw = String(imageBase64 || "")
    .replace(/^data:[^;]+;base64,/, "")
    .trim();
  if (!raw || raw.length < 32) return null;
  try {
    const buf = Buffer.from(raw, "base64");
    return buf.length >= 32 ? buf : null;
  } catch {
    return null;
  }
}

/**
 * 送信前に長辺を制限し JPEG 化
 */
async function prepareImageForGeminiV1(
  buffer: Buffer
): Promise<{ data: Buffer; mimeType: string }> {
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

  return {
    data: resized,
    mimeType: "image/jpeg",
  };
}

/**
 * Gemini 生テキストから JSON を抽出
 */
export function parseLineImageGeminiJsonV1(
  raw: string
): { rawText: string; items: LineImageGeminiVisionItemV1[] } | null {
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
      items?: unknown;
    };
    const rawText = String(parsed.rawText ?? "").trim();
    const items: LineImageGeminiVisionItemV1[] = [];
    if (Array.isArray(parsed.items)) {
      for (const row of parsed.items) {
        if (!row || typeof row !== "object") continue;
        const r = row as Record<string, unknown>;
        const name = String(r.name ?? "")
          .replace(/\[LINE画像解析\]/gi, "")
          .replace(/\[写真見積解析\]/gi, "")
          .trim();
        if (!name) continue;
        const quantity = Number(r.quantity);
        const unitPrice = Number(
          String(r.unitPrice ?? r.amount ?? "0").replace(/[,￥¥円\s]/g, "")
        );
        const unit = String(r.unit || "式").trim() || "式";
        items.push({
          name,
          quantity:
            Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
          unit,
          unitPrice:
            Number.isFinite(unitPrice) && unitPrice >= 0
              ? Math.round(unitPrice)
              : 0,
        });
      }
    }
    return { rawText: rawText || items.map((i) => i.name).join("\n"), items };
  } catch {
    return null;
  }
}

export interface LineImageGeminiVisionOptionsV1 {
  apiKey: string;
  model?: string;
}

/**
 * Gemini Vision で見積スクショを OCR / 構造化
 */
export async function runLineImageGeminiVisionV1(
  input: {
    imageBuffer: Buffer;
    fileName?: string | null;
  },
  options: LineImageGeminiVisionOptionsV1
): Promise<LineImageGeminiVisionResultV1> {
  if (!input.imageBuffer?.length || input.imageBuffer.length < 32) {
    return {
      ok: false,
      provider: "gemini",
      rawText: "",
      items: [],
      reason: "empty_image",
      rawResponseLength: 0,
    };
  }

  const prepared = await prepareImageForGeminiV1(input.imageBuffer);
  const base64 = prepared.data.toString("base64");
  const modelName = options.model || DEFAULT_MODEL;

  const genAI = new GoogleGenerativeAI(options.apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const result = await model.generateContent([
    { text: LINE_IMAGE_GEMINI_PROMPT_V1 },
    {
      inlineData: {
        mimeType: prepared.mimeType,
        data: base64,
      },
    },
  ]);

  const rawResponse = result.response.text() ?? "";
  const parsed = parseLineImageGeminiJsonV1(rawResponse);

  if (!parsed) {
    // JSON 失敗時は生文を OCR テキストとして返す
    return {
      ok: true,
      provider: "gemini",
      rawText: rawResponse.trim(),
      items: [],
      reason: "json_parse_fallback_raw",
      rawResponseLength: rawResponse.length,
    };
  }

  return {
    ok: true,
    provider: "gemini",
    rawText: parsed.rawText,
    items: parsed.items,
    reason: null,
    rawResponseLength: rawResponse.length,
  };
}
