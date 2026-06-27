/**
 * 現調 AI パイプライン v1
 * 図面データ · 音声ログ → 見積候補 · PDF 図面
 * SURVEY_AI_PIPELINE_V1 / AI_ESTIMATE_ENGINE_V2 接続
 */
import {
  buildAiEstimateCandidatesV2,
  buildAiEstimateDocumentSourcesV2,
} from "../master/ai-estimate-engine-v2.js";
import type { MasterV1EstimatePreviewEnrichedV2 } from "../master/master-v1-types.js";
import { buildDrawingEditorPdfPayloadV1 } from "../features/drawing/drawing-editor-export-v1.js";
import type { DrawingEditorPdfPayloadV1 } from "../features/drawing/drawing-editor-payload-v1.js";
import type { DrawingEditorRouteV1, DrawingEditorSymbolPlotV1 } from "../features/drawing/drawing-editor-payload-v1.js";
import {
  exportSurveyDrawingAiJsonV1,
  getSurveyDrawingSketchV1,
} from "./survey-drawing-v1-store.js";
import type { SurveyDrawingSketchV1 } from "./survey-drawing-v1-types.js";

export const SURVEY_AI_PIPELINE_V1_SCHEMA = 1 as const;

/** 音声ナビログ 1 行 */
export interface SurveyAiPipelineVoiceLogEntryV1 {
  at: string;
  role: "system" | "user";
  text: string;
  circuitNumber?: number;
}

export interface SurveyAiPipelineInputV1 {
  sketchId: string;
  businessProjectId?: string | null;
  voiceLog?: SurveyAiPipelineVoiceLogEntryV1[];
}

export interface SurveyAiPipelineResultV1 {
  schemaVersion: typeof SURVEY_AI_PIPELINE_V1_SCHEMA;
  sketchId: string;
  businessProjectId: string | null;
  /** AI 清書用エクスポート JSON */
  drawingExport: ReturnType<typeof exportSurveyDrawingAiJsonV1>;
  /** PDF 埋め込み用デジタル図面ペイロード */
  drawingPdfPayload: DrawingEditorPdfPayloadV1;
  /** AI見積エンジン v2 見積候補 */
  estimatePreview: MasterV1EstimatePreviewEnrichedV2;
  /** Document Center ソース一覧 */
  documentSources: ReturnType<typeof buildAiEstimateDocumentSourcesV2>;
  /** 音声ログ要約（仕様書メモ用） */
  voiceLogSummary: string | null;
  processedAt: string;
}

/**
 * スケッチ layers を
 * DrawingEditorPdfPayloadV1 へ変換
 */
export function sketchToDrawingPdfPayloadV1(
  sketch: SurveyDrawingSketchV1
): DrawingEditorPdfPayloadV1 {
  const w = sketch.layers.canvasWidth || 800;
  const h = sketch.layers.canvasHeight || 600;
  const editor = sketch.layers.editorV1;

  if (editor?.symbols?.length || editor?.routes?.length) {
    return buildDrawingEditorPdfPayloadV1({
      backgroundImageUrl: editor.backgroundImageUrl || sketch.backgroundImageUrl || "",
      canvasWidth: editor.canvasWidth || w,
      canvasHeight: editor.canvasHeight || h,
      symbols: editor.symbols as DrawingEditorSymbolPlotV1[],
      routes: editor.routes as DrawingEditorRouteV1[],
    });
  }

  const symbols: DrawingEditorSymbolPlotV1[] = (sketch.layers.symbols ?? []).map((s) => ({
    id: s.id,
    symbolType: (s.symbolType === "outlet" || s.symbolType === "light" || s.symbolType === "switch"
      ? s.symbolType
      : "outlet") as DrawingEditorSymbolPlotV1["symbolType"],
    icon: s.icon || "📍",
    label: s.label || s.symbolType,
    x: w > 0 ? s.x / w : 0,
    y: h > 0 ? s.y / h : 0,
  }));

  const routes: DrawingEditorRouteV1[] = (sketch.layers.paths ?? [])
    .filter((p) => p.tool === "route" || p.tool === "line")
    .map((p) => ({
      id: p.id,
      lineType: p.lineType || "generic",
      color: p.color,
      width: p.width,
      points: (p.points ?? []).map((pt) => ({
        x: w > 0 ? pt.x / w : 0,
        y: h > 0 ? pt.y / h : 0,
      })),
    }));

  return buildDrawingEditorPdfPayloadV1({
    backgroundImageUrl: sketch.backgroundImageUrl || "",
    canvasWidth: w,
    canvasHeight: h,
    symbols,
    routes,
  });
}

function summarizeVoiceLog(entries: SurveyAiPipelineVoiceLogEntryV1[]): string | null {
  if (!entries?.length) return null;
  const lines = entries
    .filter((e) => e.text?.trim())
    .slice(-12)
    .map((e) => {
      const prefix = e.role === "user" ? "職人" : "ナビ";
      const circuit = e.circuitNumber ? `[${e.circuitNumber}番] ` : "";
      return `${prefix}: ${circuit}${e.text.trim()}`;
    });
  return lines.length ? lines.join("\n") : null;
}

/**
 * 現調図面 + 音声ログから
 * 見積候補 · PDF ペイロードを一括生成
 */
export function runSurveyAiPipelineV1(
  input: SurveyAiPipelineInputV1
): SurveyAiPipelineResultV1 {
  const sketch = getSurveyDrawingSketchV1(input.sketchId);
  if (!sketch) throw new Error("sketch not found");

  const drawingExport = exportSurveyDrawingAiJsonV1(input.sketchId);
  const drawingPdfPayload = sketchToDrawingPdfPayloadV1(sketch);
  const businessProjectId =
    input.businessProjectId ?? sketch.businessProjectId ?? null;

  const estimatePreview = buildAiEstimateCandidatesV2({
    sketchId: input.sketchId,
    projectId: sketch.projectId,
    businessProjectId: businessProjectId ?? undefined,
  });
  if (!estimatePreview) {
    throw new Error("estimate preview unavailable for sketch");
  }

  const documentSources = buildAiEstimateDocumentSourcesV2({
    projectId: sketch.projectId,
    sketchId: input.sketchId,
    businessProjectId,
  });

  return {
    schemaVersion: SURVEY_AI_PIPELINE_V1_SCHEMA,
    sketchId: input.sketchId,
    businessProjectId,
    drawingExport,
    drawingPdfPayload,
    estimatePreview,
    documentSources,
    voiceLogSummary: summarizeVoiceLog(input.voiceLog ?? []),
    processedAt: new Date().toISOString(),
  };
}
