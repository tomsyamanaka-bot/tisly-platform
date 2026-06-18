/** 現調図面 v1 — AI清書連携用レイヤー構造 */

export const SURVEY_DRAWING_SOURCE_TYPES = ["hand_sketch", "photo", "blank"] as const;
export type SurveyDrawingSourceType = (typeof SURVEY_DRAWING_SOURCE_TYPES)[number];

export const SURVEY_DRAWING_TOOLS = ["pen", "line", "symbol", "text", "pan"] as const;
export type SurveyDrawingTool = (typeof SURVEY_DRAWING_TOOLS)[number];

export interface SurveyDrawingPoint {
  x: number;
  y: number;
}

export interface SurveyDrawingViewport {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface SurveyDrawingStroke {
  id: string;
  tool: "pen" | "line" | "route";
  color: string;
  width: number;
  points: SurveyDrawingPoint[];
}

export interface SurveyDrawingPlacedSymbol {
  id: string;
  symbolType: string;
  label: string;
  icon: string;
  color: string;
  x: number;
  y: number;
  rotation: number;
  memo: string;
}

export interface SurveyDrawingTextMemo {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
}

/** 将来 AI 清書パイプラインへ渡す正規 JSON（version 固定） */
export interface SurveyDrawingLayersV1 {
  version: 1;
  strokes: SurveyDrawingStroke[];
  symbols: SurveyDrawingPlacedSymbol[];
  textMemos: SurveyDrawingTextMemo[];
  viewport: SurveyDrawingViewport;
}

export interface SurveyDrawingSketchV1 {
  id: string;
  projectId: string;
  businessProjectId: string | null;
  title: string;
  sourceType: SurveyDrawingSourceType;
  backgroundImagePath: string;
  backgroundImageUrl: string;
  layers: SurveyDrawingLayersV1;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export const SURVEY_DRAWING_SYMBOL_PALETTE: Array<{
  symbolType: string;
  label: string;
  icon: string;
  color: string;
}> = [
  { symbolType: "camera", label: "カメラ", icon: "📷", color: "#2563eb" },
  { symbolType: "sensor", label: "センサー", icon: "🔔", color: "#7c3aed" },
  { symbolType: "nvr", label: "NVR", icon: "🖥", color: "#0d9488" },
  { symbolType: "router", label: "ルータ", icon: "📡", color: "#ea580c" },
  { symbolType: "junction", label: "分岐", icon: "⊕", color: "#64748b" },
  { symbolType: "power", label: "電源", icon: "⚡", color: "#ca8a04" },
  { symbolType: "door", label: "ドア", icon: "🚪", color: "#dc2626" },
  { symbolType: "memo_pin", label: "メモ", icon: "📌", color: "#1565c0" },
];

export function emptySurveyDrawingLayersV1(): SurveyDrawingLayersV1 {
  return {
    version: 1,
    strokes: [],
    symbols: [],
    textMemos: [],
    viewport: { scale: 1, offsetX: 0, offsetY: 0 },
  };
}
