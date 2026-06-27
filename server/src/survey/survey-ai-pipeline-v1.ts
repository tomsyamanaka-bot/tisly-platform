/**
 * 現調 AI パイプライン v1
 * 図面データ · 音声ログ → 見積候補 · PDF 図面
 * SURVEY_AI_PIPELINE_V1 / AI_ESTIMATE_ENGINE_V2 接続
 */
import path from "path";
import {
  buildAiEstimateCandidatesV2,
  buildAiEstimateDocumentSourcesV2,
  postSymbolCountsToAiEstimateEngineV2,
  type PostSymbolCountsToAiEstimateEngineV2Result,
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
import {
  mapGridOcrMemosToSurveyNotesV1,
  mapGridOcrToDrawingAutoPlotV1,
  runSurveyGridOcrV1,
  type SurveyGridOcrResultV1,
} from "./survey-grid-ocr-v1.js";

export const SURVEY_AI_PIPELINE_V1_SCHEMA = 1 as const;

/** パイプライン既定タイムアウト（ミリ秒） */
export const SURVEY_AI_PIPELINE_TIMEOUT_MS = 25_000;

/** 職人向けエラーコード */
export type SurveyAiPipelineErrorCode =
  | "SKETCH_NOT_FOUND"
  | "ESTIMATE_UNAVAILABLE"
  | "PDF_PAYLOAD_FAILED"
  | "TIMEOUT"
  | "UNKNOWN";

/** 職人向けに安全なパイプラインエラー */
export class SurveyAiPipelineError extends Error {
  readonly code: SurveyAiPipelineErrorCode;
  readonly userMessage: string;

  constructor(code: SurveyAiPipelineErrorCode, userMessage: string, detail?: string) {
    super(detail ?? userMessage);
    this.name = "SurveyAiPipelineError";
    this.code = code;
    this.userMessage = userMessage;
  }
}

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
  /** 方眼紙 OCR を実行する */
  runGridOcr?: boolean;
  /** OCR 結果を現調メモへ反映 */
  applyOcrToSurveyNotes?: boolean;
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
  /** 方眼紙 OCR 結果（任意） */
  gridOcr: SurveyGridOcrResultV1 | null;
  /** 自動プロット用ペイロード */
  autoPlot: ReturnType<typeof mapGridOcrToDrawingAutoPlotV1> | null;
  /** 現調メモ反映結果 */
  surveyNotesMapping: ReturnType<typeof mapGridOcrMemosToSurveyNotesV1> | null;
  /** 記号集計 → 見積 v2 */
  symbolCountHandoff: PostSymbolCountsToAiEstimateEngineV2Result | null;
  processedAt: string;
}

export interface SurveyAiPipelineSafeResultV1 {
  ok: true;
  pipeline: SurveyAiPipelineResultV1;
}

export interface SurveyAiPipelineSafeErrorV1 {
  ok: false;
  error: string;
  userMessage: string;
  code: SurveyAiPipelineErrorCode;
}

export type SurveyAiPipelineSafeResponseV1 =
  | SurveyAiPipelineSafeResultV1
  | SurveyAiPipelineSafeErrorV1;

/**
 * 任意の Error を
 * 職人向けメッセージへ変換
 */
export function toSurveyAiPipelineUserError(error: unknown): SurveyAiPipelineSafeErrorV1 {
  if (error instanceof SurveyAiPipelineError) {
    return {
      ok: false,
      error: error.message,
      userMessage: error.userMessage,
      code: error.code,
    };
  }
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return {
      ok: false,
      error: msg,
      userMessage:
        "処理がタイムアウトしました。電波状況を確認して再試行してください。",
      code: "TIMEOUT",
    };
  }
  if (lower.includes("sketch not found") || lower.includes("not found")) {
    return {
      ok: false,
      error: msg,
      userMessage: "図面データが見つかりません。保存後にもう一度お試しください。",
      code: "SKETCH_NOT_FOUND",
    };
  }
  return {
    ok: false,
    error: msg,
    userMessage:
      "AI処理中にエラーが発生しました。電波状況を確認して再試行してください。",
    code: "UNKNOWN",
  };
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

function runSurveyAiPipelineCoreV1(
  input: SurveyAiPipelineInputV1
): Promise<SurveyAiPipelineResultV1> {
  return runSurveyAiPipelineCoreV1Async(input);
}

async function runSurveyAiPipelineCoreV1Async(
  input: SurveyAiPipelineInputV1
): Promise<SurveyAiPipelineResultV1> {
  const sketch = getSurveyDrawingSketchV1(input.sketchId);
  if (!sketch) {
    throw new SurveyAiPipelineError(
      "SKETCH_NOT_FOUND",
      "図面データが見つかりません。保存後にもう一度お試しください。",
      "sketch not found"
    );
  }

  let drawingExport: ReturnType<typeof exportSurveyDrawingAiJsonV1>;
  try {
    drawingExport = exportSurveyDrawingAiJsonV1(input.sketchId);
  } catch (e) {
    throw new SurveyAiPipelineError(
      "UNKNOWN",
      "AI処理中にエラーが発生しました。電波状況を確認して再試行してください。",
      String(e)
    );
  }

  let drawingPdfPayload: DrawingEditorPdfPayloadV1;
  try {
    drawingPdfPayload = sketchToDrawingPdfPayloadV1(sketch);
  } catch (e) {
    throw new SurveyAiPipelineError(
      "PDF_PAYLOAD_FAILED",
      "PDF図面の生成に失敗しました。図面を保存してから再試行してください。",
      String(e)
    );
  }

  const businessProjectId =
    input.businessProjectId ?? sketch.businessProjectId ?? null;

  let estimatePreview: MasterV1EstimatePreviewEnrichedV2 | null;
  try {
    estimatePreview = buildAiEstimateCandidatesV2({
      sketchId: input.sketchId,
      projectId: sketch.projectId,
      businessProjectId: businessProjectId ?? undefined,
    });
  } catch (e) {
    throw new SurveyAiPipelineError(
      "ESTIMATE_UNAVAILABLE",
      "見積候補の生成に失敗しました。電波状況を確認して再試行してください。",
      String(e)
    );
  }

  if (!estimatePreview) {
    throw new SurveyAiPipelineError(
      "ESTIMATE_UNAVAILABLE",
      "見積候補を取得できませんでした。図面に記号を追加して再試行してください。",
      "estimate preview unavailable for sketch"
    );
  }

  let documentSources: ReturnType<typeof buildAiEstimateDocumentSourcesV2>;
  try {
    documentSources = buildAiEstimateDocumentSourcesV2({
      projectId: sketch.projectId,
      sketchId: input.sketchId,
      businessProjectId,
    });
  } catch (e) {
    throw new SurveyAiPipelineError(
      "UNKNOWN",
      "AI処理中にエラーが発生しました。電波状況を確認して再試行してください。",
      String(e)
    );
  }

  let gridOcr: SurveyGridOcrResultV1 | null = null;
  let autoPlot: ReturnType<typeof mapGridOcrToDrawingAutoPlotV1> | null = null;
  let surveyNotesMapping: ReturnType<typeof mapGridOcrMemosToSurveyNotesV1> | null = null;

  if (input.runGridOcr !== false && sketch.backgroundImagePath) {
    gridOcr = await runSurveyGridOcrV1({
      imagePath: sketch.backgroundImagePath,
      fileName: path.basename(sketch.backgroundImagePath),
      canvasWidth: sketch.layers.canvasWidth,
      canvasHeight: sketch.layers.canvasHeight,
      sketchNotes: sketch.notes,
    });
    autoPlot = mapGridOcrToDrawingAutoPlotV1(
      gridOcr,
      sketch.layers.canvasWidth,
      sketch.layers.canvasHeight
    );
    if (input.applyOcrToSurveyNotes !== false && gridOcr.marginMemos.length) {
      surveyNotesMapping = mapGridOcrMemosToSurveyNotesV1(sketch.projectId, gridOcr);
    }
  }

  const allSymbols = [
    ...(sketch.layers.symbols ?? []),
    ...(autoPlot?.symbols ?? []),
    ...(sketch.layers.editorV1?.symbols ?? []).map((s) => ({
      symbolType: s.symbolType,
      label: s.label,
      id: s.id,
    })),
  ];

  let symbolCountHandoff: PostSymbolCountsToAiEstimateEngineV2Result | null = null;
  if (allSymbols.length) {
    symbolCountHandoff = postSymbolCountsToAiEstimateEngineV2({
      sketchId: input.sketchId,
      projectId: sketch.projectId,
      businessProjectId,
      symbols: allSymbols.map((s) => ({
        symbolType: s.symbolType,
        label: "label" in s ? s.label : undefined,
        id: "id" in s ? s.id : undefined,
      })),
      paths: sketch.layers.paths,
    });
  }

  return {
    schemaVersion: SURVEY_AI_PIPELINE_V1_SCHEMA,
    sketchId: input.sketchId,
    businessProjectId,
    drawingExport,
    drawingPdfPayload,
    estimatePreview,
    documentSources,
    voiceLogSummary: summarizeVoiceLog(input.voiceLog ?? []),
    gridOcr,
    autoPlot,
    surveyNotesMapping,
    symbolCountHandoff,
    processedAt: new Date().toISOString(),
  };
}

/**
 * 現調図面 + 音声ログから
 * 見積候補 · PDF ペイロードを一括生成
 */
export async function runSurveyAiPipelineV1(
  input: SurveyAiPipelineInputV1
): Promise<SurveyAiPipelineResultV1> {
  return runSurveyAiPipelineCoreV1Async(input);
}

/**
 * タイムアウト付きで安全実行
 * クラッシュせず職人向けメッセージを返す
 */
export async function runSurveyAiPipelineV1Safe(
  input: SurveyAiPipelineInputV1
): Promise<SurveyAiPipelineSafeResponseV1> {
  try {
    const pipeline = await runSurveyAiPipelineCoreV1Async(input);
    return { ok: true, pipeline };
  } catch (error) {
    return toSurveyAiPipelineUserError(error);
  }
}

/** 非同期タイムアウトラッパー（将来の外部 AI 呼び出し用） */
export async function runSurveyAiPipelineV1SafeAsync(
  input: SurveyAiPipelineInputV1,
  opts?: { timeoutMs?: number }
): Promise<SurveyAiPipelineSafeResponseV1> {
  const timeoutMs = opts?.timeoutMs ?? SURVEY_AI_PIPELINE_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const pipeline = await Promise.race([
      runSurveyAiPipelineCoreV1Async(input),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new SurveyAiPipelineError(
              "TIMEOUT",
              "処理がタイムアウトしました。電波状況を確認して再試行してください。",
              "pipeline timeout"
            )
          );
        }, timeoutMs);
      }),
    ]);
    return { ok: true, pipeline };
  } catch (error) {
    return toSurveyAiPipelineUserError(error);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
