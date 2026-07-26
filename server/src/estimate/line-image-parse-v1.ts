/**
 * LINEメモ・画像から見積明細を抽出する v1。
 * Gemini Vision OCR + 円表記ルール解析。
 * 固定デモ明細は返さない。
 */
import { v4 as uuid } from "uuid";
import type { EstimateLineItem } from "../business/business-types.js";
import {
  decodeLineImageBase64V1,
  getLineImageGeminiApiKeyV1,
  getLineImageGeminiModelV1,
  runLineImageGeminiVisionV1,
  type LineImageGeminiVisionItemV1,
} from "./line-image-gemini-vision-v1.js";

export const LINE_IMAGE_PARSE_V1_SCHEMA = 1 as const;
export const LINE_IMAGE_PARSE_PROVIDER = "rule_based_v1" as const;

/**
 * テスト用サンプル OCR 文（本番フォールバックには使わない）
 */
export const SAMPLE_LINE_MEMO_OCR_TEXT = [
  "1F リビング 200V 4.0kw 105,000円",
  "FY-6V 14,000円 ×3台",
  "施工費 20,000円",
  "ケーブル VVF2.0mm-2C 41m",
].join("\n");

/** @deprecated 互換エイリアス — SAMPLE を使うこと */
export const DEMO_LINE_MEMO_OCR_TEXT = SAMPLE_LINE_MEMO_OCR_TEXT;

export interface ParsedLineImageItemV1 {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  category: string;
  confidence: number;
}

export type LineImageParseProviderV1 =
  | typeof LINE_IMAGE_PARSE_PROVIDER
  | "gemini_vision_v1"
  | "gemini_plus_rule_v1";

export type LineImageParseSourceV1 =
  | "ocrText"
  | "gemini_vision"
  | "filename_hint"
  | "empty";

export interface LineImageParseResultV1 {
  schemaVersion: typeof LINE_IMAGE_PARSE_V1_SCHEMA;
  provider: LineImageParseProviderV1;
  source: LineImageParseSourceV1;
  rawText: string;
  items: ParsedLineImageItemV1[];
  /** 見積明細へそのまま append 可能な形 */
  estimateItems: EstimateLineItem[];
  warnings: string[];
}

const UNIT_ALIASES: Record<string, string> = {
  台: "台",
  個: "個",
  本: "本",
  式: "式",
  セット: "式",
  m: "m",
  ｍ: "m",
  メートル: "m",
  枚: "枚",
  箇所: "箇所",
  口: "口",
  点: "点",
};

const UNIT_CHARS = "台個本式枚箇所口点ｍmメートルセット";

/**
 * 「品名 数量単位」行を正規表現で分解する。
 * 例: 防犯カメラ 3台 / ケーブル 41m
 */
const LINE_PATTERN = new RegExp(
  `^(.+?)\\s*[：:\\s]\\s*([\\d]+(?:\\.\\d+)?)\\s*([${UNIT_CHARS}]+)\\s*$`,
  "u"
);

const LINE_PATTERN_COMPACT = new RegExp(
  `^(.+?)\\s+([\\d]+(?:\\.\\d+)?)([${UNIT_CHARS}]+)\\s*$`,
  "u"
);

function normalizeUnit(raw: string): string {
  const key = raw.trim();
  if (UNIT_ALIASES[key]) return UNIT_ALIASES[key];
  if (/^m$/i.test(key) || key === "ｍ" || key === "メートル") return "m";
  return key || "式";
}

/**
 * 品名から不要タグ・ノイズを除去
 */
export function cleanEstimateLineNameV1(name: string): string {
  return String(name || "")
    .replace(/\[LINE画像解析\]/gi, "")
    .replace(/\[写真見積解析\]/gi, "")
    .replace(/\[音声入力\]/gi, "")
    .replace(/^[-・*●○]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 円金額を数値化（カンマ・¥対応）
 */
export function parseYenAmountV1(raw: string): number | null {
  const m = String(raw || "").match(/(?:¥|￥)?\s*([\d,]+)\s*円/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/**
 * カテゴリを品名からざっくり推定（単価は推測しない）
 */
function inferCategoryV1(name: string, unit: string): string {
  if (/カメラ|NVR|録画/i.test(name)) return "camera";
  if (/ケーブル|VVF|LAN/i.test(name)) return "lan";
  if (/ライト|照明|LED/i.test(name)) return "lighting";
  if (/エアコン|空調|kw|kW/i.test(name)) return "other";
  if (/工事|施工|取付|設置/i.test(name)) return "other";
  if (unit === "m") return "lan";
  return "other";
}

function buildParsedItemV1(input: {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  confidence?: number;
}): ParsedLineImageItemV1 | null {
  const name = cleanEstimateLineNameV1(input.name);
  if (!name || name.length > 120) return null;
  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const unit = normalizeUnit(input.unit || "式");
  const unitPrice = Math.max(0, Math.round(Number(input.unitPrice) || 0));
  return {
    name,
    quantity,
    unit,
    unitPrice,
    category: inferCategoryV1(name, unit),
    confidence: input.confidence ?? 0.88,
  };
}

/**
 * 1行テキストから品名・数量・単位・単価を抽出。
 * マッチしなければ null。
 */
export function parseEstimateLineTextRowV1(
  rawLine: string
): ParsedLineImageItemV1 | null {
  const line = rawLine
    .replace(/[\u200b\ufeff]/g, "")
    .replace(/[・･]/g, " ")
    .trim();
  if (!line || line.length < 2) return null;
  // 見出し・日付っぽい行は除外
  if (/^(品名|数量|合計|小計|税|見積|メモ|LINE)/i.test(line)) return null;

  const yen = parseYenAmountV1(line);

  // 例: FY-6V 14,000円 ×3台 / 施工費 20,000円
  if (yen != null) {
    let work = line
      .replace(/(?:¥|￥)?\s*[\d,]+\s*円/u, " ")
      .replace(/\s+/g, " ")
      .trim();

    let quantity = 1;
    let unit = "式";

    const mul = work.match(
      new RegExp(
        `[x×✕]\\s*([\\d]+(?:\\.\\d+)?)\\s*([${UNIT_CHARS}]*)\\s*$`,
        "iu"
      )
    );
    if (mul) {
      quantity = Number(mul[1]);
      unit = normalizeUnit(mul[2] || "式");
      work = work.slice(0, mul.index).trim();
    } else {
      const trail = work.match(
        new RegExp(
          `\\s+([\\d]+(?:\\.\\d+)?)([${UNIT_CHARS}]+)\\s*$`,
          "u"
        )
      );
      if (trail) {
        quantity = Number(trail[1]);
        unit = normalizeUnit(trail[2]);
        work = work.slice(0, trail.index).trim();
      }
    }

    // 「14,000円 ×3台」で金額が総額っぽい場合は単価化
    // ここでは OCR の「単価×数量」表記を優先し、
    // yen を単価として扱う（例の FY-6V 14,000円 ×3）
    return buildParsedItemV1({
      name: work,
      quantity,
      unit,
      unitPrice: yen,
      confidence: 0.92,
    });
  }

  let name = "";
  let qtyStr = "";
  let unitRaw = "";

  const m1 = line.match(LINE_PATTERN);
  const m2 = !m1 ? line.match(LINE_PATTERN_COMPACT) : null;
  if (m1) {
    name = m1[1].trim();
    qtyStr = m1[2];
    unitRaw = m1[3];
  } else if (m2) {
    name = m2[1].trim();
    qtyStr = m2[2];
    unitRaw = m2[3];
  } else {
    // 「品名×3」形式
    const mx = line.match(
      new RegExp(
        `^(.+?)\\s*[x×✕]\\s*([\\d]+(?:\\.\\d+)?)\\s*([${UNIT_CHARS}]?)\\s*$`,
        "iu"
      )
    );
    if (!mx) return null;
    name = mx[1].trim();
    qtyStr = mx[2];
    unitRaw = mx[3] || "式";
  }

  return buildParsedItemV1({
    name,
    quantity: Number(qtyStr),
    unit: unitRaw,
    unitPrice: 0,
    confidence: 0.82,
  });
}

/** 複数行 OCR テキストを明細配列へ */
export function parseEstimateLinesFromTextV1(
  text: string
): ParsedLineImageItemV1[] {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const items: ParsedLineImageItemV1[] = [];
  const seen = new Set<string>();
  for (const row of lines) {
    const parsed = parseEstimateLineTextRowV1(row);
    if (!parsed) continue;
    const key = `${parsed.name}|${parsed.unit}|${parsed.quantity}|${parsed.unitPrice}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(parsed);
  }
  return items;
}

/**
 * Gemini 構造化 items を Parsed へ変換
 */
export function mapGeminiItemsToParsedV1(
  items: LineImageGeminiVisionItemV1[]
): ParsedLineImageItemV1[] {
  const out: ParsedLineImageItemV1[] = [];
  const seen = new Set<string>();
  for (const it of items || []) {
    const parsed = buildParsedItemV1({
      name: it.name,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
      confidence: 0.95,
    });
    if (!parsed) continue;
    const key = `${parsed.name}|${parsed.unit}|${parsed.quantity}|${parsed.unitPrice}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed);
  }
  return out;
}

function toEstimateLineItem(item: ParsedLineImageItemV1): EstimateLineItem {
  const quantity = item.quantity;
  const unitPrice = Math.max(0, Math.round(item.unitPrice));
  return {
    id: uuid(),
    category: item.category,
    name: cleanEstimateLineNameV1(item.name),
    unit: item.unit,
    quantity,
    unitPrice,
    amount: Math.round(quantity * unitPrice),
    memo: "",
    fromAiCandidate: true,
    orderTarget: false,
  };
}

export interface LineImageParseInputV1 {
  /** クライアント側で得た OCR テキスト（任意） */
  ocrText?: string | null;
  fileName?: string | null;
  /**
   * @deprecated デモ強制は廃止。互換のため無視する。
   */
  forceDemo?: boolean;
  /** 画像 base64（Gemini Vision へ送信） */
  imageBase64?: string | null;
  /**
   * テスト用: Gemini を呼ばず画像 OCR 結果を差し込む
   */
  visionOverride?: {
    rawText?: string;
    items?: LineImageGeminiVisionItemV1[];
    reason?: string | null;
  } | null;
}

/**
 * 画像/テキストから見積明細を生成（非同期）。
 * 画像あり → Gemini Vision。固定デモ明細は返さない。
 */
export async function parseEstimateLinesFromImageV1(
  input: LineImageParseInputV1 = {}
): Promise<LineImageParseResultV1> {
  const warnings: string[] = [];
  const ocrText = String(input.ocrText || "").trim();
  let rawText = ocrText;
  let source: LineImageParseSourceV1 = ocrText ? "ocrText" : "empty";
  let provider: LineImageParseProviderV1 = LINE_IMAGE_PARSE_PROVIDER;
  let items: ParsedLineImageItemV1[] = [];

  const imageBuf = input.imageBase64
    ? decodeLineImageBase64V1(input.imageBase64)
    : null;

  // テスト差し込み or 本番 Gemini
  if (input.visionOverride) {
    rawText = String(input.visionOverride.rawText || ocrText || "").trim();
    const geminiItems = mapGeminiItemsToParsedV1(
      input.visionOverride.items || []
    );
    const fromText = rawText ? parseEstimateLinesFromTextV1(rawText) : [];
    items = geminiItems.length ? geminiItems : fromText;
    source = "gemini_vision";
    provider = geminiItems.length
      ? "gemini_vision_v1"
      : "gemini_plus_rule_v1";
    if (input.visionOverride.reason) {
      warnings.push(String(input.visionOverride.reason));
    }
  } else if (imageBuf) {
    const apiKey = getLineImageGeminiApiKeyV1();
    if (!apiKey) {
      warnings.push(
        "GEMINI_API_KEY 未設定のため画像OCRを実行できません"
      );
      if (ocrText) {
        items = parseEstimateLinesFromTextV1(ocrText);
        source = "ocrText";
      }
    } else {
      try {
        const vision = await runLineImageGeminiVisionV1(
          {
            imageBuffer: imageBuf,
            fileName: input.fileName,
          },
          {
            apiKey,
            model: getLineImageGeminiModelV1(),
          }
        );
        rawText = vision.rawText || ocrText;
        const geminiItems = mapGeminiItemsToParsedV1(vision.items);
        const fromText = rawText
          ? parseEstimateLinesFromTextV1(rawText)
          : [];
        // Gemini 構造化を優先、無ければ OCR 文をルール解析
        items = geminiItems.length ? geminiItems : fromText;
        source = "gemini_vision";
        provider = geminiItems.length
          ? "gemini_vision_v1"
          : "gemini_plus_rule_v1";
        if (vision.reason) warnings.push(vision.reason);
        if (!vision.ok) {
          warnings.push("Gemini Vision の解析に失敗しました");
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "vision failed";
        warnings.push(`Gemini Vision エラー: ${msg}`);
        if (ocrText) {
          items = parseEstimateLinesFromTextV1(ocrText);
          source = "ocrText";
          provider = LINE_IMAGE_PARSE_PROVIDER;
        }
      }
    }
  } else if (ocrText) {
    items = parseEstimateLinesFromTextV1(ocrText);
    source = "ocrText";
    provider = LINE_IMAGE_PARSE_PROVIDER;
  }

  // ファイル名ヒント（例: camera-3.png）で1件補完
  if (!items.length && input.fileName) {
    const hint = String(input.fileName)
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[_-]+/g, " ");
    const fromName = parseEstimateLineTextRowV1(`${hint} 1式`);
    if (fromName) {
      items = [fromName];
      source = "filename_hint";
      warnings.push("OCR失敗のためファイル名から仮明細を生成しました");
    }
  }

  if (!items.length) {
    source = source === "empty" && !rawText ? "empty" : source;
    if (!warnings.some((w) => /抽出|解析|OCR|GEMINI/i.test(w))) {
      warnings.push("画像から見積明細を抽出できませんでした");
    }
  }

  if (input.forceDemo) {
    warnings.push(
      "forceDemo は廃止されました（固定デモ明細は返しません）"
    );
  }

  return {
    schemaVersion: LINE_IMAGE_PARSE_V1_SCHEMA,
    provider,
    source,
    rawText,
    items,
    estimateItems: items.map(toEstimateLineItem),
    warnings,
  };
}
