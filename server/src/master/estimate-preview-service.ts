import type {
  MasterV1EstimatePreview,
  MasterV1EstimatePreviewCandidate,
} from "./master-v1-types.js";
import {
  findSymbolMappingByType,
  getMasterV1Material,
  getMasterV1WorkItem,
  listMasterV1SymbolMappings,
} from "./master-v1-store.js";
import type { SurveyDrawingAiExportV1 } from "../survey/survey-drawing-v1-types.js";
import { SURVEY_DRAWING_LINE_TYPE_META } from "../survey/survey-drawing-v1-types.js";
import { getSurveyDrawingSketchV1 } from "../survey/survey-drawing-v1-store.js";
import { buildSurveyDrawingAiExport } from "../survey/survey-drawing-v1-types.js";

const PX_TO_METER = 0.01;

function aggregateCandidates(
  raw: MasterV1EstimatePreviewCandidate[]
): MasterV1EstimatePreviewCandidate[] {
  const map = new Map<string, MasterV1EstimatePreviewCandidate>();
  for (const c of raw) {
    const key = [
      c.sourceType,
      c.symbolType,
      c.workItem?.id ?? "",
      c.material?.id ?? "",
    ].join("|");
    const existing = map.get(key);
    if (existing) {
      existing.qty += c.qty;
    } else {
      map.set(key, { ...c });
    }
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "ja"));
}

function buildCandidate(
  sourceType: "symbol" | "line",
  sourceId: string,
  symbolType: string,
  label: string,
  qty: number,
  unit: string,
  memo: string | null
): { work: MasterV1EstimatePreviewCandidate | null; materials: MasterV1EstimatePreviewCandidate[] } {
  const mapping = findSymbolMappingByType(symbolType, sourceType === "line" ? "line" : "symbol");
  const workItem = mapping?.workItemId ? getMasterV1WorkItem(mapping.workItemId) : null;
  const mappingQty = (mapping?.qtyPerUnit ?? 1) * qty;

  let work: MasterV1EstimatePreviewCandidate | null = null;
  const materials: MasterV1EstimatePreviewCandidate[] = [];

  if (workItem) {
    work = {
      sourceType,
      sourceId,
      symbolType,
      label: workItem.name,
      qty: mappingQty,
      unit: workItem.unit,
      workItem,
      material: null,
      mappingId: mapping?.id ?? null,
      memo,
    };
  }

  const materialIds = new Set<string>();
  if (mapping?.materialId) materialIds.add(mapping.materialId);
  for (const mid of mapping?.extraMaterialIds ?? []) {
    if (mid) materialIds.add(mid);
  }
  for (const mid of materialIds) {
    const material = getMasterV1Material(mid);
    if (!material) continue;
    materials.push({
      sourceType,
      sourceId,
      symbolType,
      label: material.name,
      qty: mappingQty,
      unit: material.unit,
      workItem: null,
      material,
      mappingId: mapping?.id ?? null,
      memo,
    });
  }

  if (!work && materials.length === 0) {
    const fallback: MasterV1EstimatePreviewCandidate = {
      sourceType,
      sourceId,
      symbolType,
      label,
      qty,
      unit,
      workItem: null,
      material: null,
      mappingId: mapping?.id ?? null,
      memo: memo ? `${memo}（マッピング未設定）` : "マッピング未設定",
    };
    return { work: fallback, materials: [] };
  }
  return { work, materials };
}

export function extractEstimatePreviewFromExport(
  exportData: SurveyDrawingAiExportV1,
  sketchId: string | null = exportData.sketchId
): MasterV1EstimatePreview {
  const workRaw: MasterV1EstimatePreviewCandidate[] = [];
  const materialRaw: MasterV1EstimatePreviewCandidate[] = [];

  for (const sym of exportData.symbols) {
    const { work, materials } = buildCandidate(
      "symbol",
      sym.id,
      sym.symbolType,
      sym.label || sym.symbolType,
      1,
      "台",
      sym.memo || null
    );
    if (work) workRaw.push(work);
    materialRaw.push(...materials);
  }

  const lineTotals = new Map<string, { lengthPx: number; count: number }>();
  for (const path of exportData.paths) {
    const lt = path.lineType || "generic";
    const cur = lineTotals.get(lt) ?? { lengthPx: 0, count: 0 };
    cur.lengthPx += path.lengthPx ?? 0;
    cur.count += 1;
    lineTotals.set(lt, cur);
  }

  for (const [lineType, totals] of lineTotals) {
    const meta = SURVEY_DRAWING_LINE_TYPE_META[lineType as keyof typeof SURVEY_DRAWING_LINE_TYPE_META];
    const label = meta?.label ?? lineType;
    const meters = Math.round(totals.lengthPx * PX_TO_METER * 100) / 100;
    const { work, materials } = buildCandidate(
      "line",
      `line-${lineType}`,
      lineType,
      `${label}配線`,
      meters > 0 ? meters : totals.count,
      meters > 0 ? "m" : "本",
      `${totals.count}ルート / ${Math.round(totals.lengthPx)}px`
    );
    if (work) workRaw.push(work);
    materialRaw.push(...materials);
  }

  return {
    sketchId,
    projectId: exportData.projectId,
    exportedAt: new Date().toISOString(),
    symbolCount: exportData.symbols.length,
    pathCount: exportData.paths.length,
    workCandidates: aggregateCandidates(workRaw),
    materialCandidates: aggregateCandidates(materialRaw),
  };
}

export function buildEstimatePreviewBySketchId(sketchId: string): MasterV1EstimatePreview | null {
  const sketch = getSurveyDrawingSketchV1(sketchId);
  if (!sketch) return null;
  const exportData = buildSurveyDrawingAiExport(sketch);
  return extractEstimatePreviewFromExport(exportData, sketchId);
}

export function buildEstimatePreviewFromLayers(body: {
  projectId?: string;
  sketchId?: string;
  layers?: SurveyDrawingAiExportV1;
}): MasterV1EstimatePreview | null {
  if (body.layers) {
    return extractEstimatePreviewFromExport(body.layers, body.sketchId ?? null);
  }
  if (body.sketchId) {
    return buildEstimatePreviewBySketchId(body.sketchId);
  }
  return null;
}

export function listSymbolMappingSummary(): {
  mappings: ReturnType<typeof listMasterV1SymbolMappings>;
  symbolTypes: string[];
  lineTypes: string[];
} {
  const mappings = listMasterV1SymbolMappings();
  return {
    mappings,
    symbolTypes: mappings.filter((m) => m.mappingKind === "symbol").map((m) => m.symbolType),
    lineTypes: mappings.filter((m) => m.mappingKind === "line").map((m) => m.symbolType),
  };
}
