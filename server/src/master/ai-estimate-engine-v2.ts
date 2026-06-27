/**
 * AI見積エンジン v2 — 現調図面・案件テンプレ・Document Center から見積候補を生成
 */
import { getBusinessProject } from "../business/business-store.js";
import { DOCUMENT_VIEW_KINDS } from "../estimate/document-view-v1.js";
import { getSurveyProjectV1Detail } from "../survey/survey-v1-store.js";
import type { SurveyWorkType } from "../survey/survey-v1-types.js";
import { SURVEY_WORK_TYPE_LABELS } from "../survey/survey-v1-types.js";
import type { SurveyDrawingAiExportV1 } from "../survey/survey-drawing-v1-types.js";
import {
  buildEstimatePreviewBySketchId,
  buildEstimatePreviewFromLayers,
  buildPriceBasis as buildPriceBasisFromPreview,
  DEFAULT_MM_PER_PX,
  enrichEstimatePreview,
  extractEstimatePreviewFromExport,
  WIRE_WASTE_FACTOR,
} from "./estimate-preview-service.js";
import type {
  AiEstimateDocumentSourceV2,
  AiEstimateWarningV2,
  MasterV1EstimatePreview,
  MasterV1EstimatePreviewCandidate,
  MasterV1EstimatePreviewEnriched,
  MasterV1EstimatePreviewEnrichedV2,
  MasterV1EstimatePreviewLine,
  MasterV1WorkItem,
} from "./master-v1-types.js";
import { AI_ESTIMATE_ENGINE_V2_SCHEMA } from "./master-v1-types.js";
import {
  getMasterV1WorkItem,
  listMasterV1WorkItems,
} from "./master-v1-store.js";

/** 仮値: 1px = 2mm（mmPerPx 未設定時） */
export { DEFAULT_MM_PER_PX, WIRE_WASTE_FACTOR, calcWireLengthMeters } from "./estimate-preview-service.js";

export function buildPriceBasis(line: MasterV1EstimatePreviewLine): string {
  return buildPriceBasisFromPreview(line);
}

function makeLineKey(line: Pick<MasterV1EstimatePreviewLine, "itemType" | "itemId" | "sourceId" | "label">): string {
  return [line.itemType, line.itemId ?? "unmapped", line.sourceId, line.label].join("|");
}

/** 防犯カメラ案件テンプレ — 最低限の標準作業候補 */
export const CAMERA_TEMPLATE_WORK_SPECS: Array<{
  workId: string;
  fallbackNames: string[];
  defaultQty: number;
  memo: string;
}> = [
  { workId: "work-camera-install", fallbackNames: ["カメラ設置"], defaultQty: 1, memo: "テンプレ標準" },
  { workId: "work-lan-wiring", fallbackNames: ["LAN配線"], defaultQty: 1, memo: "テンプレ標準（最低1m）" },
  { workId: "work-nvr-setup", fallbackNames: ["NVR設定"], defaultQty: 1, memo: "テンプレ標準" },
  {
    workId: "work-smartphone-setup",
    fallbackNames: ["スマホ設定", "アプリ設定"],
    defaultQty: 1,
    memo: "テンプレ標準",
  },
  {
    workId: "work-cam-exp-032",
    fallbackNames: ["録画試験", "動作確認"],
    defaultQty: 1,
    memo: "テンプレ標準（動作確認）",
  },
  {
    workId: "work-cam-exp-049",
    fallbackNames: ["完了報告準備", "完了写真"],
    defaultQty: 1,
    memo: "テンプレ標準（完了写真）",
  },
];

export function decoratePreviewLineV2(
  line: MasterV1EstimatePreviewLine,
  sourceKind: "drawing" | "template" | "document" = "drawing"
): MasterV1EstimatePreviewLine {
  const isUnmapped = line.itemType === "work" && !line.itemId;
  return {
    ...line,
    lineKey: line.lineKey || makeLineKey(line),
    enabled: line.enabled ?? !isUnmapped,
    priceBasis: line.priceBasis || buildPriceBasis(line),
    isUnmapped,
    sourceKind: line.sourceKind ?? sourceKind,
  };
}

export function recalculatePreviewTotals(
  preview: Pick<
    MasterV1EstimatePreviewEnriched,
    "workLines" | "materialLines"
  >
): Pick<MasterV1EstimatePreviewEnriched, "totalCost" | "totalSell" | "grossProfit" | "grossProfitRate"> {
  const lines = [...preview.workLines, ...preview.materialLines].filter((l) => l.enabled !== false);
  const totalCost = lines.reduce((s, l) => s + l.totalCost, 0);
  const totalSell = lines.reduce((s, l) => s + l.totalSell, 0);
  const grossProfit = totalSell - totalCost;
  const grossProfitRate =
    totalSell > 0 ? Math.round(((grossProfit / totalSell) * 1000)) / 10 : 0;
  return { totalCost, totalSell, grossProfit, grossProfitRate };
}

export function recalculatePreviewLineAmounts(line: MasterV1EstimatePreviewLine): MasterV1EstimatePreviewLine {
  const totalCost = Math.round(line.unitCost * line.qty);
  const totalSell = Math.round(line.appliedUnitSell * line.qty);
  const grossProfit = totalSell - totalCost;
  const grossProfitRate = totalSell > 0 ? Math.round(((grossProfit / totalSell) * 1000)) / 10 : 0;
  return {
    ...line,
    totalCost,
    totalSell,
    grossProfit,
    grossProfitRate,
    priceBasis: buildPriceBasis(line),
  };
}

function findWorkByName(names: string[]): MasterV1WorkItem | null {
  const items = listMasterV1WorkItems({ activeOnly: false });
  for (const name of names) {
    const exact = items.find((w) => w.name === name);
    if (exact) return exact;
  }
  for (const name of names) {
    const partial = items.find((w) => w.name.includes(name) || name.includes(w.name));
    if (partial) return partial;
  }
  return null;
}

function resolveTemplateWork(workId: string, fallbackNames: string[]): MasterV1WorkItem | null {
  return getMasterV1WorkItem(workId) ?? findWorkByName(fallbackNames);
}

function dedupeCandidates(
  raw: MasterV1EstimatePreviewCandidate[]
): MasterV1EstimatePreviewCandidate[] {
  const map = new Map<string, MasterV1EstimatePreviewCandidate>();
  for (const c of raw) {
    const key = [
      c.sourceType,
      c.workItem?.id ?? "",
      c.material?.id ?? "",
      c.label,
    ].join("|");
    const existing = map.get(key);
    if (existing) {
      existing.qty = Math.max(existing.qty, c.qty);
    } else {
      map.set(key, { ...c });
    }
  }
  return [...map.values()];
}

export function buildTemplateWorkCandidates(
  workTypes: SurveyWorkType[]
): MasterV1EstimatePreviewCandidate[] {
  if (!workTypes.includes("camera")) return [];

  const raw: MasterV1EstimatePreviewCandidate[] = [];
  for (const spec of CAMERA_TEMPLATE_WORK_SPECS) {
    const work = resolveTemplateWork(spec.workId, spec.fallbackNames);
    if (!work) continue;
    raw.push({
      sourceType: "template",
      sourceId: `template-camera-${work.id}`,
      symbolType: "camera_template",
      label: work.name,
      qty: spec.defaultQty,
      unit: work.unit,
      workItem: work,
      material: null,
      mappingId: null,
      memo: spec.memo,
    });
  }
  return dedupeCandidates(raw);
}

function mergeTemplateIntoPreview(
  preview: MasterV1EstimatePreview,
  workTypes: SurveyWorkType[]
): MasterV1EstimatePreview {
  const templateCandidates = buildTemplateWorkCandidates(workTypes);
  if (!templateCandidates.length) return preview;

  const existingWorkKeys = new Set(
    preview.workCandidates.map((c) => c.workItem?.id ?? c.label)
  );

  const mergedWork = [...preview.workCandidates];
  for (const tc of templateCandidates) {
    const key = tc.workItem?.id ?? tc.label;
    if (existingWorkKeys.has(key)) continue;
    mergedWork.push(tc);
    existingWorkKeys.add(key);
  }

  return {
    ...preview,
    workCandidates: mergedWork,
  };
}

function splitEnrichedLines(enriched: MasterV1EstimatePreviewEnriched): {
  workLines: MasterV1EstimatePreviewLine[];
  materialLines: MasterV1EstimatePreviewLine[];
  unmappedLines: MasterV1EstimatePreviewLine[];
  templateLines: MasterV1EstimatePreviewLine[];
} {
  const workLines: MasterV1EstimatePreviewLine[] = [];
  const materialLines: MasterV1EstimatePreviewLine[] = [];
  const unmappedLines: MasterV1EstimatePreviewLine[] = [];
  const templateLines: MasterV1EstimatePreviewLine[] = [];

  for (const line of enriched.workLines.map((l) =>
    decoratePreviewLineV2(l, l.sourceType === "template" ? "template" : "drawing")
  )) {
    if (line.isUnmapped) {
      unmappedLines.push({ ...line, enabled: false });
    } else if (line.sourceKind === "template") {
      templateLines.push(line);
      workLines.push(line);
    } else {
      workLines.push(line);
    }
  }

  for (const line of enriched.materialLines.map((l) => decoratePreviewLineV2(l, "drawing"))) {
    materialLines.push(line);
  }

  return { workLines, materialLines, unmappedLines, templateLines };
}

export function buildAiEstimateWarningsV2(
  preview: MasterV1EstimatePreviewEnrichedV2
): AiEstimateWarningV2[] {
  const warnings: AiEstimateWarningV2[] = [];

  if (preview.mmPerPx === DEFAULT_MM_PER_PX) {
    warnings.push({
      code: "mm_per_px_default",
      severity: "info",
      message: `mmPerPx 未設定のため仮値 ${DEFAULT_MM_PER_PX}mm/px を使用（余長率 ${WIRE_WASTE_FACTOR}）`,
      relatedLineKey: null,
    });
  }

  if (preview.unmappedLines.length > 0) {
    warnings.push({
      code: "unmapped_symbols",
      severity: "warn",
      message: `未マッピング記号 ${preview.unmappedLines.length}件 — 記号タブで紐付けしてください`,
      relatedLineKey: preview.unmappedLines[0]?.lineKey ?? null,
    });
  }

  const allLines = [...preview.workLines, ...preview.materialLines];
  for (const line of allLines) {
    if (!line.unitCost || line.unitCost <= 0) {
      warnings.push({
        code: "missing_cost",
        severity: "warn",
        message: `原価未入力: ${line.label}`,
        relatedLineKey: line.lineKey,
      });
    }
    if (!line.appliedUnitSell || line.appliedUnitSell <= 0) {
      warnings.push({
        code: "missing_sell",
        severity: "warn",
        message: `売価未入力: ${line.label}`,
        relatedLineKey: line.lineKey,
      });
    }
  }

  if (preview.templateLines.length > 0) {
    warnings.push({
      code: "template_merged",
      severity: "info",
      message: `案件テンプレ「${preview.templateName ?? "防犯カメラ"}」から ${preview.templateLines.length}件の標準作業を追加`,
      relatedLineKey: null,
    });
  }

  return warnings;
}

export function buildAiEstimateDocumentSourcesV2(input: {
  projectId: string | null;
  sketchId: string | null;
  businessProjectId?: string | null;
}): AiEstimateDocumentSourceV2[] {
  const projectId = input.businessProjectId ?? input.projectId;
  if (!projectId) {
    return [
      {
        sourceType: "survey_drawing",
        label: "現調図面",
        projectId: input.projectId ?? "",
        resourceId: input.sketchId,
        viewerUrl: input.sketchId ? `/survey-drawing-v1?sketchId=${encodeURIComponent(input.sketchId)}` : null,
        apiUrl: input.sketchId
          ? `/api/survey/v1/drawing-sketches/${encodeURIComponent(input.sketchId)}`
          : null,
        status: input.sketchId ? "available" : "missing",
        note: input.sketchId ? "図面記号・配線ルートから候補抽出" : "sketchId 未指定",
      },
    ];
  }

  const biz = getBusinessProject(projectId);
  const surveyId = biz?.surveyProjectId ?? input.projectId;
  const sources: AiEstimateDocumentSourceV2[] = [];

  sources.push({
    sourceType: "survey_drawing",
    label: "現調図面",
    projectId,
    resourceId: input.sketchId,
    viewerUrl: input.sketchId
      ? `/survey-drawing-v1?projectId=${encodeURIComponent(surveyId ?? projectId)}&sketchId=${encodeURIComponent(input.sketchId)}`
      : surveyId
        ? `/survey-drawing-v1?projectId=${encodeURIComponent(surveyId)}`
        : null,
    apiUrl: input.sketchId
      ? `/api/survey/v1/drawing-sketches/${encodeURIComponent(input.sketchId)}`
      : null,
    status: input.sketchId ? "available" : surveyId ? "placeholder" : "missing",
    note: "記号/SVG/layer/path/lineType → 作業・材料候補",
  });

  const docLabels: Record<string, string> = {
    specification: "仕様書（写真/PDF）",
    "completion-report": "完了報告写真",
    estimate: "見積PDF",
    invoice: "請求PDF",
  };

  for (const kind of DOCUMENT_VIEW_KINDS) {
    const sourceType: AiEstimateDocumentSourceV2["sourceType"] =
      kind === "specification"
        ? "specification_photo"
        : kind === "completion-report"
          ? "completion_photo"
          : "pdf";

    sources.push({
      sourceType,
      label: docLabels[kind] ?? kind,
      projectId,
      resourceId: kind,
      viewerUrl: `/document-viewer-v1.html?projectId=${encodeURIComponent(projectId)}&kind=${kind}`,
      apiUrl: `/api/estimate/v1/projects/${encodeURIComponent(projectId)}/document-view?kind=${kind}`,
      status: "placeholder",
      note: "将来AI解析用 source_type（現時点は参照のみ）",
    });
  }

  sources.push({
    sourceType: "project_template",
    label: "案件テンプレ（防犯カメラ工事）",
    projectId,
    resourceId: "ptpl-camera",
    viewerUrl: null,
    apiUrl: null,
    status: "available",
    note: "工事種別=防犯カメラ時に標準作業候補を追加",
  });

  return sources;
}

function resolveWorkTypes(projectId: string | null): SurveyWorkType[] {
  if (!projectId) return [];
  const detail = getSurveyProjectV1Detail(projectId);
  return detail?.workTypes ?? [];
}

export function finalizeAiEstimatePreviewV2(
  enriched: MasterV1EstimatePreviewEnriched,
  opts?: {
    mmPerPx?: number;
    wasteFactor?: number;
    workTypes?: SurveyWorkType[];
    sketchId?: string | null;
    businessProjectId?: string | null;
  }
): MasterV1EstimatePreviewEnrichedV2 {
  const mmPerPx = opts?.mmPerPx ?? DEFAULT_MM_PER_PX;
  const wasteFactor = opts?.wasteFactor ?? WIRE_WASTE_FACTOR;
  const workTypes = opts?.workTypes ?? resolveWorkTypes(enriched.projectId);
  const { workLines, materialLines, unmappedLines, templateLines } = splitEnrichedLines(enriched);

  const totals = recalculatePreviewTotals({ workLines, materialLines });

  const preview: MasterV1EstimatePreviewEnrichedV2 = {
    ...enriched,
    schemaVersion: AI_ESTIMATE_ENGINE_V2_SCHEMA,
    mmPerPx,
    wasteFactor,
    workTypes: workTypes.map((wt) => SURVEY_WORK_TYPE_LABELS[wt] ?? wt),
    templateName: workTypes.includes("camera") ? "防犯カメラ工事" : null,
    sources: buildAiEstimateDocumentSourcesV2({
      projectId: enriched.projectId,
      sketchId: opts?.sketchId ?? enriched.sketchId,
      businessProjectId: opts?.businessProjectId ?? null,
    }),
    workLines,
    materialLines,
    unmappedLines,
    templateLines,
    warnings: [],
    ...totals,
  };

  preview.warnings = buildAiEstimateWarningsV2(preview);
  return preview;
}

export function buildAiEstimateCandidatesV2(input: {
  sketchId?: string;
  projectId?: string;
  customerId?: string | null;
  layers?: SurveyDrawingAiExportV1;
  mmPerPx?: number;
  wasteFactor?: number;
  businessProjectId?: string | null;
}): MasterV1EstimatePreviewEnrichedV2 | null {
  let base: MasterV1EstimatePreviewEnriched | null = null;

  if (input.sketchId) {
    base = buildEstimatePreviewBySketchId(input.sketchId, input.customerId ?? null);
  } else if (input.layers) {
    base = buildEstimatePreviewFromLayers({
      layers: input.layers,
      sketchId: input.sketchId,
      projectId: input.projectId,
      customerId: input.customerId,
    });
  }

  if (!base) return null;

  const workTypes = resolveWorkTypes(base.projectId ?? input.projectId ?? null);
  const merged = mergeTemplateIntoPreview(
    {
      sketchId: base.sketchId,
      projectId: base.projectId,
      exportedAt: base.exportedAt ?? new Date().toISOString(),
      symbolCount: base.symbolCount,
      pathCount: base.pathCount,
      workCandidates: base.workCandidates,
      materialCandidates: base.materialCandidates,
    },
    workTypes
  );

  const reEnriched = enrichEstimatePreview(merged, input.customerId ?? base.customerId ?? null);

  return finalizeAiEstimatePreviewV2(reEnriched, {
    mmPerPx: input.mmPerPx,
    wasteFactor: input.wasteFactor,
    workTypes,
    sketchId: input.sketchId ?? base.sketchId,
    businessProjectId: input.businessProjectId ?? null,
  });
}

export function buildAiEstimateCandidatesV2BySketchId(
  sketchId: string,
  customerId: string | null = null,
  mmPerPx?: number
): MasterV1EstimatePreviewEnrichedV2 | null {
  return buildAiEstimateCandidatesV2({ sketchId, customerId, mmPerPx });
}

export function applyPreviewLineEditsV2(
  preview: MasterV1EstimatePreviewEnrichedV2,
  edits: Array<{
    lineKey: string;
    enabled?: boolean;
    qty?: number;
    appliedUnitSell?: number;
    memo?: string | null;
  }>
): MasterV1EstimatePreviewEnrichedV2 {
  const editMap = new Map(edits.map((e) => [e.lineKey, e]));

  const patchLines = (lines: MasterV1EstimatePreviewLine[]) =>
    lines.map((line) => {
      const edit = editMap.get(line.lineKey);
      if (!edit) return line;
      let next = { ...line };
      if (edit.enabled !== undefined) next.enabled = edit.enabled;
      if (edit.qty !== undefined) next.qty = edit.qty;
      if (edit.appliedUnitSell !== undefined) {
        next.appliedUnitSell = edit.appliedUnitSell;
        next.priceSource = "standard";
      }
      if (edit.memo !== undefined) next.memo = edit.memo;
      next = recalculatePreviewLineAmounts(next);
      return next;
    });

  const next: MasterV1EstimatePreviewEnrichedV2 = {
    ...preview,
    workLines: patchLines(preview.workLines),
    materialLines: patchLines(preview.materialLines),
    unmappedLines: patchLines(preview.unmappedLines),
    templateLines: patchLines(preview.templateLines),
  };

  const totals = recalculatePreviewTotals(next);
  Object.assign(next, totals);
  next.warnings = buildAiEstimateWarningsV2(next);
  return next;
}

export function getSelectedPreviewLines(
  preview: MasterV1EstimatePreviewEnriched | MasterV1EstimatePreviewEnrichedV2
): MasterV1EstimatePreviewLine[] {
  return [...preview.workLines, ...preview.materialLines].filter((l) => l.enabled !== false);
}

/** テスト用 — 図面エクスポートから v2 候補（テンプレなし） */
export function extractAiEstimatePreviewV2FromExport(
  exportData: SurveyDrawingAiExportV1,
  sketchId: string | null = exportData.sketchId,
  customerId: string | null = null,
  mmPerPx?: number
): MasterV1EstimatePreviewEnrichedV2 {
  const preview = extractEstimatePreviewFromExport(exportData, sketchId, mmPerPx);
  const enriched = enrichEstimatePreview(preview, customerId);
  return finalizeAiEstimatePreviewV2(enriched, { sketchId, mmPerPx });
}

/** 記号種別ごとの集計（見積 v2 引き渡し用） */
export interface AiEstimateSymbolCountLineV2 {
  symbolType: string;
  label: string;
  count: number;
}

/**
 * プロット記号配列から
 * 種別別件数を集計
 */
export function aggregateSymbolCountsV2(
  symbols: Array<{ symbolType: string; label?: string }>
): AiEstimateSymbolCountLineV2[] {
  const map = new Map<string, AiEstimateSymbolCountLineV2>();
  for (const s of symbols) {
    const key = s.symbolType || "unknown";
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(key, {
        symbolType: key,
        label: s.label?.trim() || key,
        count: 1,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "ja"));
}

export interface PostSymbolCountsToAiEstimateEngineV2Input {
  sketchId?: string;
  projectId?: string;
  customerId?: string | null;
  businessProjectId?: string | null;
  /** 確定 · 自動プロット含む全記号 */
  symbols: Array<{ symbolType: string; label?: string; id?: string }>;
  paths?: SurveyDrawingAiExportV1["paths"];
  mmPerPx?: number;
}

export interface PostSymbolCountsToAiEstimateEngineV2Result {
  schemaVersion: typeof AI_ESTIMATE_ENGINE_V2_SCHEMA;
  symbolCounts: AiEstimateSymbolCountLineV2[];
  totalSymbols: number;
  estimatePreview: MasterV1EstimatePreviewEnrichedV2 | null;
}

/**
 * 記号総数を AI見積エンジン v2 へ一括引き渡し
 * （モック · 図面エクスポート経由）
 */
export function postSymbolCountsToAiEstimateEngineV2(
  input: PostSymbolCountsToAiEstimateEngineV2Input
): PostSymbolCountsToAiEstimateEngineV2Result {
  const symbolCounts = aggregateSymbolCountsV2(input.symbols);
  const totalSymbols = input.symbols.length;

  const exportData: SurveyDrawingAiExportV1 = {
    schemaVersion: 2,
    drawingVersion: 2,
    exportedAt: new Date().toISOString(),
    projectId: input.projectId ?? "unknown",
    sketchId: input.sketchId ?? "symbol-count-batch",
    title: "記号集計",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    canvas: { width: 800, height: 600 },
    backgroundImage: null,
    viewport: { scale: 1, offsetX: 0, offsetY: 0 },
    paths: input.paths ?? [],
    symbols: input.symbols.map((s, i) => ({
      id: s.id ?? `sym-${i}`,
      symbolType: s.symbolType,
      label: s.label ?? s.symbolType,
      icon: "📍",
      svg: "",
      color: "#2563eb",
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
      memo: "",
    })),
    notes: [],
    sketchNotes: "",
  };

  const estimatePreview = extractAiEstimatePreviewV2FromExport(
    exportData,
    input.sketchId ?? exportData.sketchId,
    input.customerId ?? null,
    input.mmPerPx
  );

  return {
    schemaVersion: AI_ESTIMATE_ENGINE_V2_SCHEMA,
    symbolCounts,
    totalSymbols,
    estimatePreview,
  };
}
