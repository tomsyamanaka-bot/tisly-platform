import type {
  MasterV1EstimatePreview,
  MasterV1EstimatePreviewCandidate,
  MasterV1EstimatePreviewEnriched,
  MasterV1EstimatePreviewLine,
  MasterV1Material,
  MasterV1WorkItem,
} from "./master-v1-types.js";
import {
  findMasterV1CustomerPriceByItem,
  findSymbolMappingByType,
  getMasterV1Material,
  getMasterV1WorkItem,
  listMasterV1SymbolMappings,
} from "./master-v1-store.js";
import type { SurveyDrawingAiExportV1 } from "../survey/survey-drawing-v1-types.js";
import { SURVEY_DRAWING_LINE_TYPE_META } from "../survey/survey-drawing-v1-types.js";
import { getSurveyDrawingSketchV1 } from "../survey/survey-drawing-v1-store.js";
import { buildSurveyDrawingAiExport } from "../survey/survey-drawing-v1-types.js";
import {
  calcGrossProfitRate,
  masterPriceSourceLabel,
  resolveCustomerRank,
  resolveMaterialPrice,
  resolveMaterialUnitCost,
  resolveWorkPrice,
  resolveWorkUnitCost,
} from "./master-v1-pricing.js";

/** 仮値: 1px = 2mm（mmPerPx 未設定時） */
export const DEFAULT_MM_PER_PX = 2.0;
/** 配線余長率（仮採用） */
export const WIRE_WASTE_FACTOR = 1.2;

export function calcWireLengthMeters(
  lengthPx: number,
  mmPerPx: number = DEFAULT_MM_PER_PX,
  wasteFactor: number = WIRE_WASTE_FACTOR
): number {
  if (lengthPx <= 0) return 0;
  const meters = (lengthPx * mmPerPx) / 1000 * wasteFactor;
  return Math.ceil(meters);
}

export function buildPriceBasis(line: {
  priceSource: string;
  customerUnitSell: number | null;
  rankUnitSell: number;
  standardUnitSell: number;
  appliedUnitSell: number;
}): string {
  if (line.priceSource === "customer_override" && line.customerUnitSell != null) {
    return `顧客別上書き ¥${line.customerUnitSell.toLocaleString("ja-JP")}`;
  }
  if (line.priceSource === "rank_multiplier") {
    return `ランク反映 ¥${line.rankUnitSell.toLocaleString("ja-JP")}（標準 ¥${line.standardUnitSell.toLocaleString("ja-JP")}）`;
  }
  if (line.priceSource === "cost_double") {
    return `原価×2 ¥${line.appliedUnitSell.toLocaleString("ja-JP")}`;
  }
  if (line.priceSource === "missing") {
    return "原価/売価未入力";
  }
  return `標準売価 ¥${line.standardUnitSell.toLocaleString("ja-JP")}（${masterPriceSourceLabel(line.priceSource as import("./master-v1-types.js").MasterV1PriceSource)}）`;
}

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

function lineKeyFromCandidate(
  c: MasterV1EstimatePreviewCandidate,
  itemType: "work" | "material",
  itemId: string | null,
  label: string
): string {
  return [itemType, itemId ?? "unmapped", c.sourceId, label].join("|");
}

function enrichWorkLine(
  c: MasterV1EstimatePreviewCandidate,
  customerId: string | null
): MasterV1EstimatePreviewLine | null {
  if (!c.workItem) {
    if (c.material) return null;
    const line: MasterV1EstimatePreviewLine = {
      lineKey: lineKeyFromCandidate(c, "work", null, c.label),
      sourceType: c.sourceType,
      sourceId: c.sourceId,
      symbolType: c.symbolType,
      label: c.label,
      qty: c.qty,
      unit: c.unit,
      itemType: "work",
      itemId: null,
      unitCost: 0,
      totalCost: 0,
      standardUnitSell: 0,
      rankUnitSell: 0,
      customerUnitSell: null,
      appliedUnitSell: 0,
      priceSource: "missing",
      priceBasis: "マッピング未設定",
      totalSell: 0,
      grossProfit: 0,
      grossProfitRate: 0,
      mappingId: c.mappingId,
      memo: c.memo,
      enabled: false,
      isUnmapped: true,
      sourceKind: c.sourceType === "template" ? "template" : "drawing",
    };
    return line;
  }
  return lineFromWork(c, c.workItem, customerId);
}

function enrichMaterialLine(
  c: MasterV1EstimatePreviewCandidate,
  customerId: string | null
): MasterV1EstimatePreviewLine | null {
  if (!c.material) return null;
  return lineFromMaterial(c, c.material, customerId);
}

function lineFromWork(
  c: MasterV1EstimatePreviewCandidate,
  work: MasterV1WorkItem,
  customerId: string | null
): MasterV1EstimatePreviewLine {
  const rank = resolveCustomerRank(customerId);
  const override = customerId
    ? findMasterV1CustomerPriceByItem(customerId, "work", work.id)
    : null;
  const price = resolveWorkPrice(work, customerId, override, rank);
  const totalCost = Math.round(price.unitCost * c.qty);
  const totalSell = Math.round(price.appliedUnitSell * c.qty);
  const grossProfit = totalSell - totalCost;
  const line: MasterV1EstimatePreviewLine = {
    lineKey: lineKeyFromCandidate(c, "work", work.id, work.name),
    sourceType: c.sourceType,
    sourceId: c.sourceId,
    symbolType: c.symbolType,
    label: work.name,
    qty: c.qty,
    unit: c.unit,
    itemType: "work",
    itemId: work.id,
    unitCost: price.unitCost,
    totalCost,
    standardUnitSell: price.standardUnitSell,
    rankUnitSell: price.rankUnitSell,
    customerUnitSell: price.customerUnitSell,
    appliedUnitSell: price.appliedUnitSell,
    priceSource: price.priceSource,
    priceBasis: "",
    totalSell,
    grossProfit,
    grossProfitRate: calcGrossProfitRate(totalSell, totalCost),
    mappingId: c.mappingId,
    memo: c.memo,
    enabled: true,
    isUnmapped: false,
    sourceKind: c.sourceType === "template" ? "template" : "drawing",
  };
  line.priceBasis = buildPriceBasis(line);
  return line;
}

function lineFromMaterial(
  c: MasterV1EstimatePreviewCandidate,
  mat: MasterV1Material,
  customerId: string | null
): MasterV1EstimatePreviewLine {
  const rank = resolveCustomerRank(customerId);
  const override = customerId
    ? findMasterV1CustomerPriceByItem(customerId, "material", mat.id)
    : null;
  const price = resolveMaterialPrice(mat, customerId, override, rank);
  const totalCost = Math.round(price.unitCost * c.qty);
  const totalSell = Math.round(price.appliedUnitSell * c.qty);
  const grossProfit = totalSell - totalCost;
  const line: MasterV1EstimatePreviewLine = {
    lineKey: lineKeyFromCandidate(c, "material", mat.id, mat.name),
    sourceType: c.sourceType,
    sourceId: c.sourceId,
    symbolType: c.symbolType,
    label: mat.name,
    qty: c.qty,
    unit: c.unit,
    itemType: "material",
    itemId: mat.id,
    unitCost: price.unitCost,
    totalCost,
    standardUnitSell: price.standardUnitSell,
    rankUnitSell: price.rankUnitSell,
    customerUnitSell: price.customerUnitSell,
    appliedUnitSell: price.appliedUnitSell,
    priceSource: price.priceSource,
    priceBasis: "",
    totalSell,
    grossProfit,
    grossProfitRate: calcGrossProfitRate(totalSell, totalCost),
    mappingId: c.mappingId,
    memo: c.memo,
    enabled: true,
    isUnmapped: false,
    sourceKind: "drawing",
  };
  line.priceBasis = buildPriceBasis(line);
  return line;
}

export function enrichEstimatePreview(
  preview: MasterV1EstimatePreview,
  customerId: string | null = null
): MasterV1EstimatePreviewEnriched {
  const workLines = preview.workCandidates
    .map((c) => enrichWorkLine(c, customerId))
    .filter((l): l is MasterV1EstimatePreviewLine => l != null);
  const materialLines = preview.materialCandidates
    .map((c) => enrichMaterialLine(c, customerId))
    .filter((l): l is MasterV1EstimatePreviewLine => l != null);

  const billable = [...workLines, ...materialLines].filter(
    (l) => l.enabled !== false && !l.isUnmapped
  );
  const totalCost = billable.reduce((s, l) => s + l.totalCost, 0);
  const totalSell = billable.reduce((s, l) => s + l.totalSell, 0);
  const grossProfit = totalSell - totalCost;

  return {
    ...preview,
    customerId,
    workLines,
    materialLines,
    totalCost,
    totalSell,
    grossProfit,
    grossProfitRate: calcGrossProfitRate(totalSell, totalCost),
  };
}

export function extractEstimatePreviewFromExport(
  exportData: SurveyDrawingAiExportV1,
  sketchId: string | null = exportData.sketchId,
  mmPerPx: number = DEFAULT_MM_PER_PX
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
    const meters = calcWireLengthMeters(totals.lengthPx, mmPerPx);
    const { work, materials } = buildCandidate(
      "line",
      `line-${lineType}`,
      lineType,
      `${label}配線`,
      meters > 0 ? meters : Math.ceil(totals.count),
      meters > 0 ? "m" : "本",
      `${totals.count}ルート / ${Math.round(totals.lengthPx)}px → ${meters}m（余長${WIRE_WASTE_FACTOR}×）`
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

export function buildEstimatePreviewBySketchId(
  sketchId: string,
  customerId: string | null = null
): MasterV1EstimatePreviewEnriched | null {
  const sketch = getSurveyDrawingSketchV1(sketchId);
  if (!sketch) return null;
  const exportData = buildSurveyDrawingAiExport(sketch);
  const preview = extractEstimatePreviewFromExport(exportData, sketchId);
  return enrichEstimatePreview(preview, customerId);
}

export function buildEstimatePreviewFromLayers(body: {
  projectId?: string;
  sketchId?: string;
  customerId?: string | null;
  layers?: SurveyDrawingAiExportV1;
}): MasterV1EstimatePreviewEnriched | null {
  let preview: MasterV1EstimatePreview | null = null;
  if (body.layers) {
    preview = extractEstimatePreviewFromExport(body.layers, body.sketchId ?? null);
  } else if (body.sketchId) {
    const sketch = getSurveyDrawingSketchV1(body.sketchId);
    if (!sketch) return null;
    preview = extractEstimatePreviewFromExport(buildSurveyDrawingAiExport(sketch), body.sketchId);
  }
  if (!preview) return null;
  return enrichEstimatePreview(preview, body.customerId ?? null);
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

// re-export for tests
export { resolveWorkUnitCost, resolveMaterialUnitCost };
