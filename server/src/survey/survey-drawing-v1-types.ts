/** 現調図面 v1/v2 — AI清書連携用レイヤー構造 */

export const SURVEY_DRAWING_SCHEMA_VERSION = 2;
export const SURVEY_DRAWING_DRAWING_VERSION = 2;

export const SURVEY_DRAWING_SOURCE_TYPES = ["hand_sketch", "photo", "blank"] as const;
export type SurveyDrawingSourceType = (typeof SURVEY_DRAWING_SOURCE_TYPES)[number];

export const SURVEY_DRAWING_TOOLS = ["pen", "line", "route", "symbol", "text", "pan", "select"] as const;
export type SurveyDrawingTool = (typeof SURVEY_DRAWING_TOOLS)[number];

export const SURVEY_DRAWING_LINE_TYPES = [
  "lan",
  "power100v",
  "power24v",
  "rs485",
  "coax",
  "phone",
  "generic",
] as const;
export type SurveyDrawingLineType = (typeof SURVEY_DRAWING_LINE_TYPES)[number];

export const SURVEY_DRAWING_LINE_TYPE_META: Record<
  SurveyDrawingLineType,
  { label: string; color: string; dash?: string }
> = {
  lan: { label: "LAN", color: "#2563eb" },
  power100v: { label: "100V", color: "#dc2626" },
  power24v: { label: "24V", color: "#ca8a04" },
  rs485: { label: "RS485", color: "#7c3aed", dash: "6 4" },
  coax: { label: "同軸", color: "#64748b" },
  phone: { label: "電話", color: "#059669", dash: "4 3" },
  generic: { label: "一般", color: "#0f172a" },
};

export interface SurveyDrawingPoint {
  x: number;
  y: number;
}

export interface SurveyDrawingViewport {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** v1 互換ストローク */
export interface SurveyDrawingStroke {
  id: string;
  tool: "pen" | "line" | "route";
  color: string;
  width: number;
  points: SurveyDrawingPoint[];
  lineType?: SurveyDrawingLineType;
  lengthPx?: number;
}

/** v2 正規パス（strokes の後継） */
export interface SurveyDrawingPath {
  id: string;
  tool: "pen" | "line" | "route";
  lineType: SurveyDrawingLineType;
  color: string;
  width: number;
  points: SurveyDrawingPoint[];
  /** 距離計算の下準備（ピクセル単位） */
  lengthPx: number;
}

export interface SurveyDrawingPlacedSymbol {
  id: string;
  symbolType: string;
  label: string;
  icon: string;
  svg?: string;
  color: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
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

/** v1 レイヤー（後方互換） */
export interface SurveyDrawingLayersV1 {
  version: 1;
  strokes: SurveyDrawingStroke[];
  symbols: SurveyDrawingPlacedSymbol[];
  textMemos: SurveyDrawingTextMemo[];
  viewport: SurveyDrawingViewport;
}

/** v2 正規レイヤー — AI清書パイプライン入力 */
export interface SurveyDrawingLayersV2 {
  schemaVersion: typeof SURVEY_DRAWING_SCHEMA_VERSION;
  drawingVersion: typeof SURVEY_DRAWING_DRAWING_VERSION;
  canvasWidth: number;
  canvasHeight: number;
  paths: SurveyDrawingPath[];
  symbols: SurveyDrawingPlacedSymbol[];
  notes: SurveyDrawingTextMemo[];
  viewport: SurveyDrawingViewport;
}

export type SurveyDrawingLayers = SurveyDrawingLayersV2;

export interface SurveyDrawingBackgroundImage {
  path: string;
  url: string;
  width: number;
  height: number;
}

export interface SurveyDrawingSketchV1 {
  id: string;
  projectId: string;
  businessProjectId: string | null;
  title: string;
  sourceType: SurveyDrawingSourceType;
  backgroundImagePath: string;
  backgroundImageUrl: string;
  backgroundImage: SurveyDrawingBackgroundImage | null;
  layers: SurveyDrawingLayersV2;
  notes: string;
  createdAt: string;
  updatedAt: string;
  schemaVersion: typeof SURVEY_DRAWING_SCHEMA_VERSION;
  drawingVersion: typeof SURVEY_DRAWING_DRAWING_VERSION;
}

/** AI清書用エクスポート JSON */
export interface SurveyDrawingAiExportV1 {
  schemaVersion: typeof SURVEY_DRAWING_SCHEMA_VERSION;
  drawingVersion: typeof SURVEY_DRAWING_DRAWING_VERSION;
  exportedAt: string;
  projectId: string;
  sketchId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  canvas: { width: number; height: number };
  backgroundImage: SurveyDrawingBackgroundImage | null;
  viewport: SurveyDrawingViewport;
  paths: SurveyDrawingPath[];
  symbols: SurveyDrawingPlacedSymbol[];
  notes: SurveyDrawingTextMemo[];
  sketchNotes: string;
}

export interface SurveyDrawingSymbolDef {
  symbolType: string;
  label: string;
  icon: string;
  color: string;
  category?: string;
  svg: string;
}

function symSvg(inner: string, viewBox = "0 0 32 32"): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

/** 設備記号ライブラリ v1 — SVG */
export const SURVEY_DRAWING_SYMBOL_PALETTE: SurveyDrawingSymbolDef[] = [
  {
    symbolType: "dome_camera",
    label: "ドームカメラ",
    icon: "📷",
    color: "#2563eb",
    category: "防犯カメラ",
    svg: symSvg(
      '<circle cx="16" cy="16" r="11" fill="currentColor" fill-opacity="0.15"/><path d="M8 20 Q16 8 24 20" stroke-width="2"/><circle cx="16" cy="17" r="4" fill="currentColor" fill-opacity="0.35"/>'
    ),
  },
  {
    symbolType: "bullet_camera",
    label: "バレットカメラ",
    icon: "📹",
    color: "#1d4ed8",
    category: "防犯カメラ",
    svg: symSvg(
      '<rect x="6" y="12" width="18" height="8" rx="2" fill="currentColor" fill-opacity="0.2"/><path d="M24 16 L28 14 L28 18 Z" fill="currentColor"/><circle cx="12" cy="16" r="3" fill="currentColor" fill-opacity="0.4"/>'
    ),
  },
  {
    symbolType: "pir_sensor",
    label: "人感センサー",
    icon: "🔔",
    color: "#7c3aed",
    svg: symSvg(
      '<rect x="10" y="8" width="12" height="16" rx="3" fill="currentColor" fill-opacity="0.15"/><path d="M16 12 v4 M13 14 h6"/><path d="M6 20 Q16 26 26 20" stroke-dasharray="3 2"/>'
    ),
  },
  {
    symbolType: "beam_sensor",
    label: "ビームセンサー",
    icon: "〰",
    color: "#6d28d9",
    svg: symSvg(
      '<rect x="4" y="12" width="6" height="8" rx="1" fill="currentColor" fill-opacity="0.25"/><rect x="22" y="12" width="6" height="8" rx="1" fill="currentColor" fill-opacity="0.25"/><path d="M10 16 L22 16" stroke-dasharray="4 3"/>'
    ),
  },
  {
    symbolType: "magnet_contact",
    label: "マグネット",
    icon: "🧲",
    color: "#9333ea",
    svg: symSvg(
      '<rect x="8" y="10" width="6" height="12" rx="1" fill="#dc2626" fill-opacity="0.5" stroke="#dc2626"/><rect x="18" y="10" width="6" height="12" rx="1" fill="#2563eb" fill-opacity="0.5" stroke="#2563eb"/>'
    ),
  },
  {
    symbolType: "speaker",
    label: "スピーカー",
    icon: "🔊",
    color: "#0d9488",
    svg: symSvg(
      '<path d="M10 12 h4 l6-4 v16 l-6-4 h-4 z" fill="currentColor" fill-opacity="0.2"/><path d="M22 12 Q26 16 22 20"/><path d="M24 10 Q29 16 24 22"/>'
    ),
  },
  {
    symbolType: "lan_port",
    label: "LAN",
    icon: "🔌",
    color: "#2563eb",
    svg: symSvg(
      '<rect x="8" y="10" width="16" height="14" rx="2" fill="currentColor" fill-opacity="0.12"/><rect x="11" y="14" width="3" height="5" fill="currentColor" fill-opacity="0.5"/><rect x="15" y="14" width="3" height="5" fill="currentColor" fill-opacity="0.5"/><rect x="19" y="14" width="3" height="5" fill="currentColor" fill-opacity="0.5"/>'
    ),
  },
  {
    symbolType: "access_point",
    label: "AP",
    icon: "📶",
    color: "#0284c7",
    svg: symSvg(
      '<circle cx="16" cy="22" r="2" fill="currentColor"/><path d="M16 18 Q20 14 24 18"/><path d="M16 14 Q22 8 28 14"/><path d="M16 10 Q24 2 32 10" transform="translate(-4 0)"/>'
    ),
  },
  {
    symbolType: "monitor",
    label: "モニター",
    icon: "🖥",
    color: "#0369a1",
    svg: symSvg(
      '<rect x="6" y="8" width="20" height="14" rx="2" fill="currentColor" fill-opacity="0.15"/><path d="M12 26 h8 M16 22 v4"/>'
    ),
  },
  {
    symbolType: "nvr",
    label: "NVR",
    icon: "💾",
    color: "#0d9488",
    svg: symSvg(
      '<rect x="5" y="10" width="22" height="12" rx="2" fill="currentColor" fill-opacity="0.15"/><circle cx="10" cy="16" r="1.5" fill="currentColor"/><circle cx="14" cy="16" r="1.5" fill="currentColor"/><path d="M18 14 h8 M18 18 h6"/>'
    ),
  },
  {
    symbolType: "router",
    label: "ルーター",
    icon: "📡",
    color: "#ea580c",
    svg: symSvg(
      '<rect x="6" y="14" width="20" height="10" rx="2" fill="currentColor" fill-opacity="0.15"/><path d="M10 10 Q16 4 22 10"/><circle cx="10" cy="19" r="1.5" fill="currentColor"/><circle cx="16" cy="19" r="1.5" fill="currentColor"/><circle cx="22" cy="19" r="1.5" fill="currentColor"/>'
    ),
  },
  {
    symbolType: "network_switch",
    label: "スイッチ",
    icon: "🔀",
    color: "#c2410c",
    svg: symSvg(
      '<rect x="4" y="12" width="24" height="10" rx="2" fill="currentColor" fill-opacity="0.15"/><circle cx="9" cy="17" r="1.5" fill="currentColor"/><circle cx="14" cy="17" r="1.5" fill="currentColor"/><circle cx="19" cy="17" r="1.5" fill="currentColor"/><circle cx="24" cy="17" r="1.5" fill="currentColor"/>'
    ),
  },
  {
    symbolType: "outlet",
    label: "コンセント",
    icon: "🔌",
    color: "#ca8a04",
    svg: symSvg(
      '<circle cx="16" cy="16" r="10" fill="currentColor" fill-opacity="0.12"/><path d="M12 12 v8 M20 12 v8"/>'
    ),
  },
  {
    symbolType: "light",
    label: "照明",
    icon: "💡",
    color: "#eab308",
    svg: symSvg(
      '<path d="M16 4 L18 10 h-4 z" fill="currentColor" fill-opacity="0.4"/><circle cx="16" cy="16" r="6" fill="currentColor" fill-opacity="0.2"/><path d="M12 24 h8 M13 27 h6"/>'
    ),
  },
  {
    symbolType: "distribution_panel",
    label: "分電盤",
    icon: "⚡",
    color: "#b45309",
    svg: symSvg(
      '<rect x="8" y="6" width="16" height="20" rx="2" fill="currentColor" fill-opacity="0.12"/><path d="M12 10 v12 M16 10 v12 M20 10 v12"/>'
    ),
  },
  {
    symbolType: "power",
    label: "電源",
    icon: "⚡",
    color: "#ca8a04",
    svg: symSvg('<path d="M18 6 L12 18 h6 l-2 10 8-14 h-6 z" fill="currentColor" fill-opacity="0.35"/>'),
  },
  {
    symbolType: "control_panel",
    label: "制御盤",
    icon: "🎛",
    color: "#475569",
    svg: symSvg(
      '<rect x="6" y="8" width="20" height="16" rx="2" fill="currentColor" fill-opacity="0.12"/><circle cx="12" cy="16" r="2" fill="currentColor" fill-opacity="0.4"/><rect x="17" y="13" width="6" height="6" rx="1" fill="currentColor" fill-opacity="0.3"/>'
    ),
  },
  // v1 互換記号
  { symbolType: "camera", label: "カメラ", icon: "📷", color: "#2563eb", svg: symSvg('<circle cx="16" cy="16" r="10" fill="currentColor" fill-opacity="0.2"/><circle cx="16" cy="16" r="4"/>') },
  { symbolType: "sensor", label: "センサー", icon: "🔔", color: "#7c3aed", svg: symSvg('<circle cx="16" cy="16" r="10" fill="currentColor" fill-opacity="0.2"/><path d="M16 10 v6 M13 13 h6"/>') },
  { symbolType: "junction", label: "分岐", icon: "⊕", color: "#64748b", svg: symSvg('<circle cx="16" cy="16" r="8"/><path d="M16 8 v16 M8 16 h16"/>') },
  { symbolType: "door", label: "ドア", icon: "🚪", color: "#dc2626", svg: symSvg('<rect x="10" y="6" width="12" height="20" rx="1" fill="currentColor" fill-opacity="0.15"/><circle cx="19" cy="16" r="1.5" fill="currentColor"/>') },
  { symbolType: "memo_pin", label: "メモ", icon: "📌", color: "#1565c0", svg: symSvg('<path d="M16 6 L22 12 L18 12 L20 26 L12 26 L14 12 L10 12 Z" fill="currentColor" fill-opacity="0.3"/>') },
];

export function pathLengthPx(points: SurveyDrawingPoint[]): number {
  if (points.length < 2) return 0;
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    len += Math.hypot(dx, dy);
  }
  return Math.round(len * 100) / 100;
}

export function normalizePath(raw: Partial<SurveyDrawingPath> & { points?: SurveyDrawingPoint[] }): SurveyDrawingPath {
  const points = raw.points ?? [];
  const lineType =
    raw.lineType && (SURVEY_DRAWING_LINE_TYPES as readonly string[]).includes(raw.lineType)
      ? raw.lineType
      : "generic";
  const meta = SURVEY_DRAWING_LINE_TYPE_META[lineType];
  return {
    id: String(raw.id ?? ""),
    tool: raw.tool === "line" || raw.tool === "route" ? raw.tool : "pen",
    lineType,
    color: raw.color || meta.color,
    width: Number(raw.width) || 3,
    points,
    lengthPx: raw.lengthPx ?? pathLengthPx(points),
  };
}

export function emptySurveyDrawingLayersV2(
  canvasWidth = 800,
  canvasHeight = 600
): SurveyDrawingLayersV2 {
  return {
    schemaVersion: SURVEY_DRAWING_SCHEMA_VERSION,
    drawingVersion: SURVEY_DRAWING_DRAWING_VERSION,
    canvasWidth,
    canvasHeight,
    paths: [],
    symbols: [],
    notes: [],
    viewport: { scale: 1, offsetX: 0, offsetY: 0 },
  };
}

/** @deprecated use emptySurveyDrawingLayersV2 */
export function emptySurveyDrawingLayersV1(): SurveyDrawingLayersV1 {
  return {
    version: 1,
    strokes: [],
    symbols: [],
    textMemos: [],
    viewport: { scale: 1, offsetX: 0, offsetY: 0 },
  };
}

export function migrateLayersToV2(
  raw: unknown,
  canvasWidth = 800,
  canvasHeight = 600
): SurveyDrawingLayersV2 {
  if (!raw || typeof raw !== "object") return emptySurveyDrawingLayersV2(canvasWidth, canvasHeight);
  const obj = raw as Record<string, unknown>;

  if (obj.schemaVersion === 2 && obj.drawingVersion === 2) {
    const layers = obj as unknown as SurveyDrawingLayersV2;
    return {
      schemaVersion: 2,
      drawingVersion: 2,
      canvasWidth: Number(layers.canvasWidth) || canvasWidth,
      canvasHeight: Number(layers.canvasHeight) || canvasHeight,
      paths: (layers.paths ?? []).map((p) => normalizePath(p)),
      symbols: (layers.symbols ?? []).map((s) => ({
        ...s,
        scale: Number(s.scale) || 1,
        rotation: Number(s.rotation) || 0,
      })),
      notes: layers.notes ?? [],
      viewport: layers.viewport ?? { scale: 1, offsetX: 0, offsetY: 0 },
    };
  }

  if (obj.version === 1) {
    const v1 = obj as unknown as SurveyDrawingLayersV1;
    return {
      schemaVersion: 2,
      drawingVersion: 2,
      canvasWidth,
      canvasHeight,
      paths: (v1.strokes ?? []).map((s) =>
        normalizePath({
          id: s.id,
          tool: s.tool,
          lineType: s.lineType ?? "generic",
          color: s.color,
          width: s.width,
          points: s.points,
        })
      ),
      symbols: (v1.symbols ?? []).map((s) => ({ ...s, scale: Number(s.scale) || 1 })),
      notes: v1.textMemos ?? [],
      viewport: v1.viewport ?? { scale: 1, offsetX: 0, offsetY: 0 },
    };
  }

  return emptySurveyDrawingLayersV2(canvasWidth, canvasHeight);
}

export function buildSurveyDrawingAiExport(sketch: SurveyDrawingSketchV1): SurveyDrawingAiExportV1 {
  return {
    schemaVersion: SURVEY_DRAWING_SCHEMA_VERSION,
    drawingVersion: SURVEY_DRAWING_DRAWING_VERSION,
    exportedAt: new Date().toISOString(),
    projectId: sketch.projectId,
    sketchId: sketch.id,
    title: sketch.title,
    createdAt: sketch.createdAt,
    updatedAt: sketch.updatedAt,
    canvas: {
      width: sketch.layers.canvasWidth,
      height: sketch.layers.canvasHeight,
    },
    backgroundImage: sketch.backgroundImage,
    viewport: { ...sketch.layers.viewport },
    paths: sketch.layers.paths.map((p) => ({ ...p, points: p.points.map((pt) => ({ ...pt })) })),
    symbols: sketch.layers.symbols.map((s) => ({ ...s })),
    notes: sketch.layers.notes.map((n) => ({ ...n })),
    sketchNotes: sketch.notes,
  };
}
