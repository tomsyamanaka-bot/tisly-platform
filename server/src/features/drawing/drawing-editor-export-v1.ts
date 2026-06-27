/**
 * 図面エディタ v1 — PDF ペイロード組み立て
 * フロントのプロット状態から
 * DrawingEditorPdfPayloadV1 を生成
 */
import {
  DRAWING_EDITOR_PAYLOAD_SCHEMA_VERSION,
  type DrawingEditorPdfPayloadV1,
  type DrawingEditorSymbolPlotV1,
} from "./drawing-editor-payload-v1.js";

export interface BuildDrawingEditorPdfPayloadInputV1 {
  backgroundImageUrl: string;
  canvasWidth: number;
  canvasHeight: number;
  symbols: DrawingEditorSymbolPlotV1[];
  exportedAt?: string;
}

/**
 * pdf-base-template 連携前の
 * 正規化ペイロードを組み立て
 */
export function buildDrawingEditorPdfPayloadV1(
  input: BuildDrawingEditorPdfPayloadInputV1
): DrawingEditorPdfPayloadV1 {
  const w = Math.max(1, Math.round(input.canvasWidth));
  const h = Math.max(1, Math.round(input.canvasHeight));
  const symbols = input.symbols.map((s) => ({
    ...s,
    x: clamp01(s.x),
    y: clamp01(s.y),
  }));

  return {
    schemaVersion: DRAWING_EDITOR_PAYLOAD_SCHEMA_VERSION,
    backgroundImageUrl: input.backgroundImageUrl.trim(),
    canvasWidth: w,
    canvasHeight: h,
    symbols,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
  };
}

/** 0〜1 にクランプ */
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
