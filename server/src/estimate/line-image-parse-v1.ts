/**
 * LINEメモ・画像から見積明細を抽出する v1。
 * Vision API 未接続時は rule_based /
 * mock OCR テキストで仮実装する。
 */
import { v4 as uuid } from "uuid";
import type { EstimateLineItem } from "../business/business-types.js";

export const LINE_IMAGE_PARSE_V1_SCHEMA = 1 as const;
export const LINE_IMAGE_PARSE_PROVIDER = "rule_based_v1" as const;

/** デモ用：典型的な LINE 見積メモ OCR 想定文 */
export const DEMO_LINE_MEMO_OCR_TEXT = [
  "ポールライト用ベース加工（塗装費込） 1台",
  "防犯カメラ（SDカード録画タイプ） 3台",
  "ケーブル VVF2.0mm-2C 41m",
  "カメラ取付ボックス 3個",
].join("\n");

export interface ParsedLineImageItemV1 {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  category: string;
  confidence: number;
}

export interface LineImageParseResultV1 {
  schemaVersion: typeof LINE_IMAGE_PARSE_V1_SCHEMA;
  provider: typeof LINE_IMAGE_PARSE_PROVIDER | "mock_vision_v1";
  source: "ocrText" | "mock_demo" | "filename_hint";
  rawText: string;
  items: ParsedLineImageItemV1[];
  /** 見積明細へそのまま append 可能な形 */
  estimateItems: EstimateLineItem[];
  warnings: string[];
}

/** 品名キーワード → 仮単価・カテゴリ（未設定は 0） */
const PRICE_HINTS: Array<{
  re: RegExp;
  unitPrice: number;
  category: string;
  defaultUnit?: string;
}> = [
  {
    re: /ポールライト|ベース加工/i,
    unitPrice: 18000,
    category: "lighting",
    defaultUnit: "台",
  },
  {
    re: /防犯カメラ|カメラ(?!取付)/i,
    unitPrice: 28000,
    category: "camera",
    defaultUnit: "台",
  },
  {
    re: /ケーブル|VVF|LAN/i,
    unitPrice: 450,
    category: "lan",
    defaultUnit: "m",
  },
  {
    re: /取付ボックス|ボックス/i,
    unitPrice: 3500,
    category: "camera",
    defaultUnit: "個",
  },
  {
    re: /NVR|録画/i,
    unitPrice: 85000,
    category: "camera",
    defaultUnit: "式",
  },
  {
    re: /工事|取付|設置/i,
    unitPrice: 12000,
    category: "other",
    defaultUnit: "式",
  },
];

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

/**
 * 「品名 数量単位」行を正規表現で分解する。
 * 例: 防犯カメラ 3台 / ケーブル 41m
 */
const LINE_PATTERN =
  /^(.+?)\s*[：:\s]\s*([\d]+(?:\.\d+)?)\s*([台個本式枚箇所口点ｍmメートルセット]+)\s*$/u;

const LINE_PATTERN_COMPACT =
  /^(.+?)\s+([\d]+(?:\.\d+)?)([台個本式枚箇所口点ｍmメートルセット]+)\s*$/u;

function normalizeUnit(raw: string): string {
  const key = raw.trim();
  if (UNIT_ALIASES[key]) return UNIT_ALIASES[key];
  if (/^m$/i.test(key) || key === "ｍ" || key === "メートル") return "m";
  return key || "式";
}

function hintPrice(name: string, unit: string): {
  unitPrice: number;
  category: string;
} {
  for (const h of PRICE_HINTS) {
    if (h.re.test(name)) {
      return {
        unitPrice: h.unitPrice,
        category: h.category,
      };
    }
  }
  // 単位だけでざっくりカテゴリ推定
  if (unit === "m") return { unitPrice: 500, category: "lan" };
  if (unit === "台") return { unitPrice: 15000, category: "other" };
  return { unitPrice: 0, category: "other" };
}

/**
 * 1行テキストから品名・数量・単位を抽出。
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
    const mx = line.match(/^(.+?)\s*[x×✕]\s*([\d]+(?:\.\d+)?)\s*([台個本式枚箇所口点ｍm]?)\s*$/iu);
    if (!mx) return null;
    name = mx[1].trim();
    qtyStr = mx[2];
    unitRaw = mx[3] || "式";
  }

  name = name
    .replace(/^[-・*●○]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name || name.length > 120) return null;

  const quantity = Number(qtyStr);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const unit = normalizeUnit(unitRaw);
  const { unitPrice, category } = hintPrice(name, unit);
  return {
    name,
    quantity,
    unit,
    unitPrice,
    category,
    confidence: 0.82,
  };
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
    const key = `${parsed.name}|${parsed.unit}|${parsed.quantity}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(parsed);
  }
  return items;
}

function toEstimateLineItem(item: ParsedLineImageItemV1): EstimateLineItem {
  const quantity = item.quantity;
  const unitPrice = Math.max(0, Math.round(item.unitPrice));
  return {
    id: uuid(),
    category: item.category,
    name: item.name,
    unit: item.unit,
    quantity,
    unitPrice,
    amount: Math.round(quantity * unitPrice),
    memo: "[LINE画像解析]",
    fromAiCandidate: true,
    orderTarget: false,
  };
}

export interface LineImageParseInputV1 {
  /** クライアント側で得た OCR テキスト（任意） */
  ocrText?: string | null;
  fileName?: string | null;
  /** true ならデモ文を必ず使う（テスト用） */
  forceDemo?: boolean;
  /** 画像 base64（将来 Vision 差し替え用・現状は未使用） */
  imageBase64?: string | null;
}

/**
 * 画像/テキストから見積明細を生成。
 * テキストが無い場合は DEMO OCR を mock Vision として返す。
 */
export function parseEstimateLinesFromImageV1(
  input: LineImageParseInputV1 = {}
): LineImageParseResultV1 {
  const warnings: string[] = [];
  const ocrText = String(input.ocrText || "").trim();
  let rawText = ocrText;
  let source: LineImageParseResultV1["source"] = "ocrText";
  let provider: LineImageParseResultV1["provider"] = LINE_IMAGE_PARSE_PROVIDER;

  if (input.forceDemo || !rawText) {
    rawText = DEMO_LINE_MEMO_OCR_TEXT;
    source = "mock_demo";
    provider = "mock_vision_v1";
    if (!ocrText) {
      warnings.push(
        "画像OCR未接続のためデモ抽出結果を返しました（Vision API差し替え可）"
      );
    }
  }

  let items = parseEstimateLinesFromTextV1(rawText);

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
    rawText = DEMO_LINE_MEMO_OCR_TEXT;
    items = parseEstimateLinesFromTextV1(rawText);
    source = "mock_demo";
    provider = "mock_vision_v1";
    warnings.push("解析0件のためデモ明細を返しました");
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
