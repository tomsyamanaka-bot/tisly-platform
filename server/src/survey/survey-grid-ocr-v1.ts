/**
 * 方眼紙 OCR v1 — 手書きメモ · 記号検出
 * rule_based_v1（将来 Vision API 差し替え可能）
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { v4 as uuid } from "uuid";
import {
  SURVEY_DRAWING_SYMBOL_PALETTE,
  type SurveyDrawingPlacedSymbol,
  type SurveyDrawingTextMemo,
} from "./survey-drawing-v1-types.js";
import { appendSurveyProjectNotesV1 } from "./survey-v1-store.js";

function surveyImageFullPath(imagePath: string): string {
  const base =
    process.env.TISLY_UPLOADS_DIR || path.join(process.cwd(), "uploads");
  return path.join(base, "survey", imagePath);
}

export const SURVEY_GRID_OCR_V1_SCHEMA = 1 as const;
export const SURVEY_GRID_OCR_PROVIDER = "rule_based_v1" as const;

/** 余白 OCR で拾う設備キーワード */
const MARGIN_KEYWORD_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /エアコン|air\s*con|ac位置/i, label: "エアコン位置" },
  { re: /分電盤|ブレーカ|配電盤/i, label: "分電盤" },
  { re: /コンセント|outlet/i, label: "コンセント" },
  { re: /照明|ライト|light/i, label: "照明" },
  { re: /カメラ|camera|防犯/i, label: "防犯カメラ" },
  { re: /lan|ネット|hub|スイッチ/i, label: "LAN" },
  { re: /nvr|録画/i, label: "NVR" },
  { re: /インターホン|intercom/i, label: "インターホン" },
  { re: /玄関|勝手口|リビング|和室|洋室|2階|1階/i, label: "部屋メモ" },
];

/** 手書き記号形状 → symbolType */
const SHAPE_SYMBOL_MAP: Record<string, string> = {
  circle: "outlet",
  square: "light",
  triangle: "switch",
  diamond: "distribution_panel",
  cross: "junction",
};

export interface SurveyGridOcrMarginMemoV1 {
  id: string;
  text: string;
  /** 正規化座標 0–1（余白推定位置） */
  x: number;
  y: number;
  region: "top" | "bottom" | "left" | "right";
  confidence: number;
}

export interface SurveyGridOcrDetectedSymbolV1 {
  id: string;
  symbolType: string;
  label: string;
  icon: string;
  /** 正規化座標 0–1 */
  x: number;
  y: number;
  shape: "circle" | "square" | "triangle" | "diamond" | "cross" | "unknown";
  confidence: number;
  /** 自動プロット由来フラグ */
  autoPlot: true;
}

export interface SurveyGridOcrInputV1 {
  /** uploads/survey からの相対パス */
  imagePath?: string | null;
  fileName?: string | null;
  canvasWidth?: number;
  canvasHeight?: number;
  /** 既存スケッチメモ（デジタル入力分） */
  sketchNotes?: string | null;
  /** テスト用ヒント（本番 API では無視） */
  testHints?: {
    marginTexts?: string[];
    symbols?: Array<{ symbolType: string; x: number; y: number }>;
  };
}

export interface SurveyGridOcrResultV1 {
  schemaVersion: typeof SURVEY_GRID_OCR_V1_SCHEMA;
  provider: typeof SURVEY_GRID_OCR_PROVIDER;
  placeholder: boolean;
  marginMemos: SurveyGridOcrMarginMemoV1[];
  detectedSymbols: SurveyGridOcrDetectedSymbolV1[];
  rawText: string;
  meta: {
    fileName: string | null;
    processedAt: string;
    imageWidth: number | null;
    imageHeight: number | null;
  };
}

export interface SurveyGridOcrSurveyMemoMappingV1 {
  projectId: string;
  appendedLines: string[];
  mergedNotes: string;
}

export interface SurveyGridOcrAutoPlotPayloadV1 {
  symbols: SurveyDrawingPlacedSymbol[];
  notes: SurveyDrawingTextMemo[];
  marginSummary: string | null;
}

function paletteMeta(symbolType: string): { label: string; icon: string; color: string; svg?: string } {
  const hit =
    SURVEY_DRAWING_SYMBOL_PALETTE.find((s) => s.symbolType === symbolType) ??
    SURVEY_DRAWING_SYMBOL_PALETTE.find((s) => s.symbolType === "memo_pin");
  return hit ?? { label: symbolType, icon: "📍", color: "#64748b" };
}

function extractKeywordsFromText(text: string): SurveyGridOcrMarginMemoV1[] {
  const memos: SurveyGridOcrMarginMemoV1[] = [];
  const regions: Array<SurveyGridOcrMarginMemoV1["region"]> = ["top", "right", "bottom", "left"];
  let idx = 0;
  for (const { re, label } of MARGIN_KEYWORD_PATTERNS) {
    if (!re.test(text)) continue;
    const region = regions[idx % regions.length];
    const pos = marginAnchor(region, idx);
    memos.push({
      id: uuid(),
      text: label,
      x: pos.x,
      y: pos.y,
      region,
      confidence: 0.72,
    });
    idx += 1;
  }
  return memos;
}

function marginAnchor(
  region: SurveyGridOcrMarginMemoV1["region"],
  offset: number
): { x: number; y: number } {
  const bump = (offset % 3) * 0.04;
  switch (region) {
    case "top":
      return { x: 0.12 + bump, y: 0.04 };
    case "bottom":
      return { x: 0.12 + bump, y: 0.96 };
    case "left":
      return { x: 0.04, y: 0.15 + bump };
    default:
      return { x: 0.96, y: 0.15 + bump };
  }
}

/**
 * sharp で簡易コントラストブロブ検出
 * （本番 OCR 前の rule_based 仮検出）
 */
async function detectSymbolBlobsV1(
  imagePath: string,
  canvasW: number,
  canvasH: number
): Promise<SurveyGridOcrDetectedSymbolV1[]> {
  const full = surveyImageFullPath(imagePath);
  if (!fs.existsSync(full)) return [];

  const { data, info } = await sharp(full)
    .resize(320, 240, { fit: "inside" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const marginX = Math.floor(w * 0.08);
  const marginY = Math.floor(h * 0.08);
  const cell = 24;
  const hits: Array<{ cx: number; cy: number; score: number; shape: keyof typeof SHAPE_SYMBOL_MAP }> = [];

  for (let y = marginY; y < h - marginY - cell; y += cell) {
    for (let x = marginX; x < w - marginX - cell; x += cell) {
      let dark = 0;
      let edge = 0;
      for (let dy = 0; dy < cell; dy++) {
        for (let dx = 0; dx < cell; dx++) {
          const px = data[(y + dy) * w + (x + dx)] ?? 255;
          if (px < 120) dark += 1;
          if (dx > 0 && dy > 0) {
            const prev = data[(y + dy - 1) * w + (x + dx - 1)] ?? 255;
            if (Math.abs(px - prev) > 40) edge += 1;
          }
        }
      }
      const ratio = dark / (cell * cell);
      if (ratio < 0.08 || ratio > 0.55) continue;
      if (edge < 12) continue;
      const cx = (x + cell / 2) / w;
      const cy = (y + cell / 2) / h;
      const shape =
        ratio > 0.35 ? "square" : edge > 28 ? "triangle" : ratio > 0.2 ? "circle" : "cross";
      hits.push({ cx, cy, score: ratio + edge / 100, shape });
    }
  }

  hits.sort((a, b) => b.score - a.score);
  const picked = hits.slice(0, 12);
  return picked.map((h) => {
    const symbolType = SHAPE_SYMBOL_MAP[h.shape] ?? "outlet";
    const meta = paletteMeta(symbolType);
    const shape = h.shape as SurveyGridOcrDetectedSymbolV1["shape"];
    return {
      id: uuid(),
      symbolType,
      label: meta.label,
      icon: meta.icon,
      x: Math.min(0.95, Math.max(0.05, h.cx)),
      y: Math.min(0.95, Math.max(0.05, h.cy)),
      shape,
      confidence: Math.min(0.92, 0.45 + h.score),
      autoPlot: true as const,
    };
  });
}

function hintsToResult(
  hints: NonNullable<SurveyGridOcrInputV1["testHints"]>,
  canvasW: number,
  canvasH: number
): Pick<SurveyGridOcrResultV1, "marginMemos" | "detectedSymbols" | "rawText"> {
  const marginMemos = (hints.marginTexts ?? []).map((text, i) => {
    const region: SurveyGridOcrMarginMemoV1["region"] =
      i % 4 === 0 ? "top" : i % 4 === 1 ? "right" : i % 4 === 2 ? "bottom" : "left";
    const pos = marginAnchor(region, i);
    return {
      id: uuid(),
      text,
      x: pos.x,
      y: pos.y,
      region,
      confidence: 0.95,
    };
  });
  const detectedSymbols = (hints.symbols ?? []).map((s) => {
    const meta = paletteMeta(s.symbolType);
    return {
      id: uuid(),
      symbolType: s.symbolType,
      label: meta.label,
      icon: meta.icon,
      x: s.x,
      y: s.y,
      shape: "unknown" as const,
      confidence: 0.95,
      autoPlot: true as const,
    };
  });
  return {
    marginMemos,
    detectedSymbols,
    rawText: [...(hints.marginTexts ?? []), ...(hints.symbols ?? []).map((s) => s.symbolType)].join(
      " "
    ),
  };
}

/**
 * 方眼紙画像から手書きメモ · 記号候補を抽出
 */
export async function runSurveyGridOcrV1(
  input: SurveyGridOcrInputV1
): Promise<SurveyGridOcrResultV1> {
  const canvasW = input.canvasWidth ?? 800;
  const canvasH = input.canvasHeight ?? 600;
  const corpus = [input.fileName ?? "", input.sketchNotes ?? ""].join(" ");

  if (input.testHints) {
    const fromHints = hintsToResult(input.testHints, canvasW, canvasH);
    return {
      schemaVersion: SURVEY_GRID_OCR_V1_SCHEMA,
      provider: SURVEY_GRID_OCR_PROVIDER,
      placeholder: true,
      ...fromHints,
      meta: {
        fileName: input.fileName ?? null,
        processedAt: new Date().toISOString(),
        imageWidth: canvasW,
        imageHeight: canvasH,
      },
    };
  }

  const marginMemos = extractKeywordsFromText(corpus);
  let detectedSymbols: SurveyGridOcrDetectedSymbolV1[] = [];

  if (input.imagePath) {
    try {
      detectedSymbols = await detectSymbolBlobsV1(input.imagePath, canvasW, canvasH);
    } catch {
      detectedSymbols = [];
    }
  }

  if (!detectedSymbols.length && marginMemos.length) {
    detectedSymbols = marginMemos.slice(0, 4).map((m, i) => {
      const types = ["outlet", "light", "outlet", "light"];
      const symbolType = types[i % types.length];
      const meta = paletteMeta(symbolType);
      return {
        id: uuid(),
        symbolType,
        label: meta.label,
        icon: meta.icon,
        x: 0.25 + (i % 2) * 0.35,
        y: 0.35 + Math.floor(i / 2) * 0.25,
        shape: "circle" as const,
        confidence: 0.55,
        autoPlot: true as const,
      };
    });
  }

  const rawText = marginMemos.map((m) => m.text).join(" · ");

  return {
    schemaVersion: SURVEY_GRID_OCR_V1_SCHEMA,
    provider: SURVEY_GRID_OCR_PROVIDER,
    placeholder: true,
    marginMemos,
    detectedSymbols,
    rawText,
    meta: {
      fileName: input.fileName ?? null,
      processedAt: new Date().toISOString(),
      imageWidth: canvasW,
      imageHeight: canvasH,
    },
  };
}

/**
 * OCR 余白メモを
 * survey-v1 現調メモへ追記
 */
export function mapGridOcrMemosToSurveyNotesV1(
  projectId: string,
  ocr: Pick<SurveyGridOcrResultV1, "marginMemos" | "rawText">
): SurveyGridOcrSurveyMemoMappingV1 {
  const lines = ocr.marginMemos.map((m) => `[OCR] ${m.text}`);
  const mergedNotes = appendSurveyProjectNotesV1(projectId, lines);
  return { projectId, appendedLines: lines, mergedNotes };
}

/**
 * 検出記号を図面レイヤー形式へ変換
 * （Canvas 自動プロット用）
 */
export function mapGridOcrToDrawingAutoPlotV1(
  ocr: Pick<SurveyGridOcrResultV1, "detectedSymbols" | "marginMemos">,
  canvasWidth: number,
  canvasHeight: number
): SurveyGridOcrAutoPlotPayloadV1 {
  const symbols: SurveyDrawingPlacedSymbol[] = ocr.detectedSymbols.map((s) => {
    const meta = paletteMeta(s.symbolType);
    return {
      id: s.id,
      symbolType: s.symbolType,
      label: s.label,
      icon: s.icon,
      svg: meta.svg,
      color: meta.color,
      x: s.x * canvasWidth,
      y: s.y * canvasHeight,
      rotation: 0,
      scale: 1,
      memo: "自動プロット",
    };
  });

  const notes: SurveyDrawingTextMemo[] = ocr.marginMemos.map((m) => ({
    id: m.id,
    text: m.text,
    x: m.x * canvasWidth,
    y: m.y * canvasHeight,
    fontSize: 13,
    color: "#0f172a",
  }));

  const marginSummary =
    ocr.marginMemos.length > 0
      ? ocr.marginMemos.map((m) => m.text).join(" / ")
      : null;

  return { symbols, notes, marginSummary };
}
