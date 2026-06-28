/**
 * 図面プロット記号 ➔ 必要資材マッピング v1
 * survey-drawing-v1 の記号・配線から
 * 現場持ち物（field-check-v1）用部材を算出する
 */
import {
  calcWireLengthMeters,
  DEFAULT_MM_PER_PX,
} from "../../master/estimate-preview-service.js";
import type { SurveyDrawingAiExportV1 } from "../../survey/survey-drawing-v1-types.js";
import { SURVEY_DRAWING_LINE_TYPE_META } from "../../survey/survey-drawing-v1-types.js";

export const MATERIAL_MAPPER_V1_SCHEMA = "material-mapper-v1" as const;

/** 記号種別ごとの集計行 */
export interface MaterialMapperSymbolCountV1 {
  symbolType: string;
  label: string;
  count: number;
}

/** マッピング結果の部材 1 行 */
export interface MaterialMapperLineV1 {
  /** field_check_items マージ用キー */
  syncKey: string;
  label: string;
  category: string;
  quantity: number;
  unit: string;
  materialId: string | null;
  /** 算出根拠（UI 表示用） */
  memo: string | null;
}

export interface MaterialMapperInputV1 {
  symbols: Array<{ symbolType: string; label?: string; id?: string }>;
  paths?: Array<{ lineType?: string; lengthPx?: number }>;
  mmPerPx?: number;
}

export interface MaterialMapperResultV1 {
  schemaVersion: typeof MATERIAL_MAPPER_V1_SCHEMA;
  symbolCounts: MaterialMapperSymbolCountV1[];
  totalSymbols: number;
  lines: MaterialMapperLineV1[];
  /** 図面内容の指紋（同期 stale 判定用） */
  contentHash: string;
}

/** 記号 1 箇所あたりに必要な部材定義 */
interface SymbolMaterialRuleV1 {
  syncKeySuffix: string;
  label: string;
  category: string;
  qtyPerUnit: number;
  unit: string;
  materialId?: string | null;
}

interface SymbolTypeRuleV1 {
  displayLabel: string;
  perSymbol: SymbolMaterialRuleV1[];
}

/**
 * 現場必須部材マッピング定義
 * （コンセント・照明・防犯カメラ等）
 */
const SYMBOL_TYPE_RULES_V1: Record<string, SymbolTypeRuleV1> = {
  outlet: {
    displayLabel: "コンセント",
    perSymbol: [
      {
        syncKeySuffix: "receptacle",
        label: "埋込コンセント",
        category: "電気",
        qtyPerUnit: 1,
        unit: "個",
      },
      {
        syncKeySuffix: "clamp",
        label: "挟み込み金具",
        category: "電気",
        qtyPerUnit: 1,
        unit: "個",
      },
      {
        syncKeySuffix: "vvf",
        label: "VVF 1.6-2C",
        category: "電気",
        qtyPerUnit: 5,
        unit: "m",
      },
    ],
  },
  light: {
    displayLabel: "照明",
    perSymbol: [
      {
        syncKeySuffix: "fixture",
        label: "照明器具",
        category: "電気",
        qtyPerUnit: 1,
        unit: "台",
      },
      {
        syncKeySuffix: "ceiling-bracket",
        label: "天井金具",
        category: "電気",
        qtyPerUnit: 1,
        unit: "個",
      },
      {
        syncKeySuffix: "vvf",
        label: "VVF 1.6-2C",
        category: "電気",
        qtyPerUnit: 8,
        unit: "m",
      },
    ],
  },
  switch: {
    displayLabel: "スイッチ",
    perSymbol: [
      {
        syncKeySuffix: "switch-body",
        label: "スイッチ本体",
        category: "電気",
        qtyPerUnit: 1,
        unit: "個",
      },
      {
        syncKeySuffix: "plate",
        label: "スイッチプレート",
        category: "電気",
        qtyPerUnit: 1,
        unit: "枚",
      },
      {
        syncKeySuffix: "vvf",
        label: "VVF 1.6-2C",
        category: "電気",
        qtyPerUnit: 5,
        unit: "m",
      },
    ],
  },
  dome_camera: {
    displayLabel: "ドームカメラ",
    perSymbol: [
      {
        syncKeySuffix: "camera",
        label: "屋外防犯カメラ 200万画素",
        category: "防犯カメラ",
        qtyPerUnit: 1,
        unit: "台",
        materialId: "mat-camera-outdoor",
      },
      {
        syncKeySuffix: "lan",
        label: "CAT6 LANケーブル",
        category: "LAN",
        qtyPerUnit: 15,
        unit: "m",
        materialId: "mat-lan-cat6",
      },
      {
        syncKeySuffix: "rj45",
        label: "RJ45コネクタ",
        category: "LAN",
        qtyPerUnit: 2,
        unit: "個",
        materialId: "mat-rj45",
      },
    ],
  },
  bullet_camera: {
    displayLabel: "バレットカメラ",
    perSymbol: [
      {
        syncKeySuffix: "camera",
        label: "屋外防犯カメラ 200万画素",
        category: "防犯カメラ",
        qtyPerUnit: 1,
        unit: "台",
        materialId: "mat-camera-outdoor",
      },
      {
        syncKeySuffix: "lan",
        label: "CAT6 LANケーブル",
        category: "LAN",
        qtyPerUnit: 20,
        unit: "m",
        materialId: "mat-lan-cat6",
      },
      {
        syncKeySuffix: "rj45",
        label: "RJ45コネクタ",
        category: "LAN",
        qtyPerUnit: 2,
        unit: "個",
        materialId: "mat-rj45",
      },
    ],
  },
  camera: {
    displayLabel: "カメラ",
    perSymbol: [
      {
        syncKeySuffix: "camera",
        label: "屋外防犯カメラ 200万画素",
        category: "防犯カメラ",
        qtyPerUnit: 1,
        unit: "台",
        materialId: "mat-camera-outdoor",
      },
      {
        syncKeySuffix: "lan",
        label: "CAT6 LANケーブル",
        category: "LAN",
        qtyPerUnit: 15,
        unit: "m",
        materialId: "mat-lan-cat6",
      },
    ],
  },
  nvr: {
    displayLabel: "NVR",
    perSymbol: [
      {
        syncKeySuffix: "nvr",
        label: "8ch NVR",
        category: "NVR",
        qtyPerUnit: 1,
        unit: "台",
        materialId: "mat-nvr-8ch",
      },
      {
        syncKeySuffix: "hdd",
        label: "監視用HDD 4TB",
        category: "HDD",
        qtyPerUnit: 1,
        unit: "台",
        materialId: "mat-hdd-4tb",
      },
    ],
  },
  lan_port: {
    displayLabel: "LAN",
    perSymbol: [
      {
        syncKeySuffix: "lan",
        label: "CAT6 LANケーブル",
        category: "LAN",
        qtyPerUnit: 5,
        unit: "m",
        materialId: "mat-lan-cat6",
      },
      {
        syncKeySuffix: "rj45",
        label: "RJ45コネクタ",
        category: "LAN",
        qtyPerUnit: 2,
        unit: "個",
        materialId: "mat-rj45",
      },
    ],
  },
  access_point: {
    displayLabel: "AP",
    perSymbol: [
      {
        syncKeySuffix: "ap",
        label: "無線AP",
        category: "LAN",
        qtyPerUnit: 1,
        unit: "台",
      },
      {
        syncKeySuffix: "lan",
        label: "CAT6 LANケーブル",
        category: "LAN",
        qtyPerUnit: 10,
        unit: "m",
        materialId: "mat-lan-cat6",
      },
    ],
  },
  network_switch: {
    displayLabel: "スイッチ",
    perSymbol: [
      {
        syncKeySuffix: "poe",
        label: "PoEハブ 8port",
        category: "電源",
        qtyPerUnit: 1,
        unit: "台",
        materialId: "mat-poe-8port",
      },
    ],
  },
  pir_sensor: {
    displayLabel: "人感センサー",
    perSymbol: [
      {
        syncKeySuffix: "sensor",
        label: "人感センサー",
        category: "セキュリティ",
        qtyPerUnit: 1,
        unit: "台",
      },
    ],
  },
  power: {
    displayLabel: "電源",
    perSymbol: [
      {
        syncKeySuffix: "outlet",
        label: "埋込コンセント",
        category: "電気",
        qtyPerUnit: 1,
        unit: "個",
      },
      {
        syncKeySuffix: "vvf",
        label: "VVF 1.6-2C",
        category: "電気",
        qtyPerUnit: 5,
        unit: "m",
      },
    ],
  },
};

/** 配線種別 ➔ 部材（延長 m 換算） */
const LINE_TYPE_RULES_V1: Record<
  string,
  { syncKeySuffix: string; label: string; category: string; unit: string; materialId?: string }
> = {
  lan: {
    syncKeySuffix: "lan-cable",
    label: "CAT6 LANケーブル",
    category: "LAN",
    unit: "m",
    materialId: "mat-lan-cat6",
  },
  power100v: {
    syncKeySuffix: "vvf",
    label: "VVF 1.6-2C",
    category: "電気",
    unit: "m",
  },
  power24v: {
    syncKeySuffix: "cpev",
    label: "CPEV 2C",
    category: "電気",
    unit: "m",
  },
};

/**
 * プロット記号配列から
 * 種別別件数を集計
 */
export function aggregateDrawingSymbolCountsV1(
  symbols: Array<{ symbolType: string; label?: string }>
): MaterialMapperSymbolCountV1[] {
  const map = new Map<string, MaterialMapperSymbolCountV1>();
  for (const s of symbols) {
    const symbolType = s.symbolType || "unknown";
    const rule = SYMBOL_TYPE_RULES_V1[symbolType];
    const displayLabel = s.label?.trim() || rule?.displayLabel || symbolType;
    const existing = map.get(symbolType);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(symbolType, { symbolType, label: displayLabel, count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "ja"));
}

function aggregateLines(lines: MaterialMapperLineV1[]): MaterialMapperLineV1[] {
  const map = new Map<string, MaterialMapperLineV1>();
  for (const line of lines) {
    const existing = map.get(line.syncKey);
    if (existing) {
      existing.quantity += line.quantity;
    } else {
      map.set(line.syncKey, { ...line });
    }
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "ja"));
}

function buildSymbolLines(counts: MaterialMapperSymbolCountV1[]): MaterialMapperLineV1[] {
  const raw: MaterialMapperLineV1[] = [];
  for (const row of counts) {
    const rule = SYMBOL_TYPE_RULES_V1[row.symbolType];
    if (!rule) {
      raw.push({
        syncKey: `symbol:${row.symbolType}:unmapped`,
        label: `${row.label}（要確認）`,
        category: "図面自動",
        quantity: row.count,
        unit: "箇所",
        materialId: null,
        memo: `図面 ${row.count} 箇所 · マッピング未定義`,
      });
      continue;
    }
    for (const part of rule.perSymbol) {
      raw.push({
        syncKey: `symbol:${row.symbolType}:${part.syncKeySuffix}`,
        label: part.label,
        category: part.category,
        quantity: part.qtyPerUnit * row.count,
        unit: part.unit,
        materialId: part.materialId ?? null,
        memo: `${rule.displayLabel} ×${row.count}`,
      });
    }
  }
  return raw;
}

function buildPathLines(
  paths: Array<{ lineType?: string; lengthPx?: number }>,
  mmPerPx: number
): MaterialMapperLineV1[] {
  const totals = new Map<string, { lengthPx: number; count: number }>();
  for (const path of paths) {
    const lineType = path.lineType || "generic";
    const cur = totals.get(lineType) ?? { lengthPx: 0, count: 0 };
    cur.lengthPx += Number(path.lengthPx) || 0;
    cur.count += 1;
    totals.set(lineType, cur);
  }

  const raw: MaterialMapperLineV1[] = [];
  for (const [lineType, stat] of totals) {
    const rule = LINE_TYPE_RULES_V1[lineType];
    if (!rule) continue;
    const meta =
      SURVEY_DRAWING_LINE_TYPE_META[
        lineType as keyof typeof SURVEY_DRAWING_LINE_TYPE_META
      ];
    const meters = calcWireLengthMeters(stat.lengthPx, mmPerPx);
    const qty = meters > 0 ? meters : stat.count;
    raw.push({
      syncKey: `line:${lineType}:${rule.syncKeySuffix}`,
      label: rule.label,
      category: rule.category,
      quantity: qty,
      unit: rule.unit,
      materialId: rule.materialId ?? null,
      memo: `${meta?.label ?? lineType} ${stat.count} ルート · ${qty}${rule.unit}`,
    });
  }
  return raw;
}

/** 図面内容の簡易ハッシュ（同期判定用） */
export function buildDrawingContentHashV1(input: MaterialMapperInputV1): string {
  const counts = aggregateDrawingSymbolCountsV1(input.symbols);
  const pathPart = (input.paths ?? [])
    .map((p) => `${p.lineType ?? "generic"}:${Math.round(Number(p.lengthPx) || 0)}`)
    .sort()
    .join("|");
  const symPart = counts.map((c) => `${c.symbolType}:${c.count}`).join("|");
  return `${symPart}::${pathPart}`;
}

/**
 * 記号数量・配線長から
 * 必要部材リストを算出
 */
export function mapDrawingToMaterialsV1(input: MaterialMapperInputV1): MaterialMapperResultV1 {
  const mmPerPx = input.mmPerPx ?? DEFAULT_MM_PER_PX;
  const symbolCounts = aggregateDrawingSymbolCountsV1(input.symbols);
  const symbolLines = buildSymbolLines(symbolCounts);
  const pathLines = buildPathLines(input.paths ?? [], mmPerPx);
  const lines = aggregateLines([...symbolLines, ...pathLines]);
  return {
    schemaVersion: MATERIAL_MAPPER_V1_SCHEMA,
    symbolCounts,
    totalSymbols: input.symbols.length,
    lines,
    contentHash: buildDrawingContentHashV1(input),
  };
}

/** survey-drawing AI エクスポートから部材算出 */
export function mapSurveyDrawingExportToMaterialsV1(
  exportData: SurveyDrawingAiExportV1,
  mmPerPx?: number
): MaterialMapperResultV1 {
  return mapDrawingToMaterialsV1({
    symbols: exportData.symbols.map((s) => ({
      symbolType: s.symbolType,
      label: s.label,
      id: s.id,
    })),
    paths: exportData.paths.map((p) => ({
      lineType: p.lineType,
      lengthPx: p.lengthPx,
    })),
    mmPerPx,
  });
}
