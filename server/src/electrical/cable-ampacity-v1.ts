/**
 * TiSLY 強電選定規格（施工条件別）v1
 * @see server/data/knowledge/Standards/cable-ampacity-installation-v1.md
 */

export const CABLE_AMPACITY_BASE_AMBIENT_C = 30;

export const CABLE_AMPACITY_DERATING = {
  /** 同一配管内3本以下 — 配管内・天井裏露出に適用済み */
  conduitMaxThreeWires: 0.7,
  /** 天井裏露出 — 熱蓄積考慮、適用済み */
  ceilingExposed: 0.7,
} as const;

export type CableInstallationCondition = "exposed" | "conduit" | "ceiling_exposed";

export const CABLE_INSTALLATION_CONDITION_LABELS: Record<CableInstallationCondition, string> = {
  exposed: "①露出配線",
  conduit: "②配管内配線",
  ceiling_exposed: "③天井裏露出配線",
};

export type CableAmpacityValue = number | false;

export interface CableAmpacityRecord {
  id: string;
  family: string;
  spec: string;
  ampacity: Record<CableInstallationCondition, CableAmpacityValue>;
  notes?: string;
}

/** 施工条件別許容電流マスター（A）。false = 法的に不可 */
export const CABLE_AMPACITY_TABLE_V1: readonly CableAmpacityRecord[] = [
  // A. VVF / VVR / EM-EEF
  { id: "VVF-1.6-2C", family: "VVF", spec: "1.6mm (2C)", ampacity: { exposed: 19, conduit: 13, ceiling_exposed: 13 } },
  { id: "VVF-1.6-3C", family: "VVF", spec: "1.6mm (3C)", ampacity: { exposed: 15, conduit: 10, ceiling_exposed: 10 } },
  { id: "VVF-2.0-2C", family: "VVF", spec: "2.0mm (2C)", ampacity: { exposed: 23, conduit: 16, ceiling_exposed: 16 } },
  { id: "VVF-2.0-3C", family: "VVF", spec: "2.0mm (3C)", ampacity: { exposed: 19, conduit: 13, ceiling_exposed: 13 } },
  { id: "VVF-2.6-2C", family: "VVF", spec: "2.6mm (2C)", ampacity: { exposed: 32, conduit: 22, ceiling_exposed: 22 } },
  { id: "VVF-2.6-3C", family: "VVF", spec: "2.6mm (3C)", ampacity: { exposed: 26, conduit: 18, ceiling_exposed: 18 } },
  // B. IV / HIV
  { id: "IV-1.6", family: "IV", spec: "1.6mm", ampacity: { exposed: 27, conduit: 18, ceiling_exposed: 18 } },
  { id: "IV-2.0", family: "IV", spec: "2.0mm", ampacity: { exposed: 35, conduit: 24, ceiling_exposed: 24 } },
  { id: "IV-2.6", family: "IV", spec: "2.6mm", ampacity: { exposed: 48, conduit: 33, ceiling_exposed: 33 } },
  { id: "HIV-1.6", family: "HIV", spec: "1.6mm", ampacity: { exposed: 33, conduit: 23, ceiling_exposed: 23 }, notes: "75°C耐熱" },
  { id: "HIV-2.0", family: "HIV", spec: "2.0mm", ampacity: { exposed: 43, conduit: 30, ceiling_exposed: 30 }, notes: "75°C耐熱" },
  { id: "HIV-2.6", family: "HIV", spec: "2.6mm", ampacity: { exposed: 59, conduit: 41, ceiling_exposed: 41 }, notes: "75°C耐熱" },
  // C. CV / CVT
  { id: "CV-2.0-3C", family: "CV", spec: "2.0sq (3C)", ampacity: { exposed: 23, conduit: 16, ceiling_exposed: 16 }, notes: "3線通電ベース" },
  { id: "CVT-2.0", family: "CVT", spec: "2.0sq", ampacity: { exposed: 23, conduit: 16, ceiling_exposed: 16 }, notes: "3線通電ベース" },
  { id: "CV-3.5-3C", family: "CV", spec: "3.5sq (3C)", ampacity: { exposed: 33, conduit: 23, ceiling_exposed: 23 }, notes: "3線通電ベース" },
  { id: "CVT-3.5", family: "CVT", spec: "3.5sq", ampacity: { exposed: 33, conduit: 23, ceiling_exposed: 23 }, notes: "3線通電ベース" },
  { id: "CV-5.5-3C", family: "CV", spec: "5.5sq (3C)", ampacity: { exposed: 44, conduit: 30, ceiling_exposed: 30 }, notes: "3線通電ベース" },
  { id: "CVT-5.5", family: "CVT", spec: "5.5sq", ampacity: { exposed: 45, conduit: 31, ceiling_exposed: 31 }, notes: "3線通電ベース" },
  { id: "CV-8.0-3C", family: "CV", spec: "8.0sq (3C)", ampacity: { exposed: 54, conduit: 37, ceiling_exposed: 37 }, notes: "3線通電ベース" },
  { id: "CVT-8.0", family: "CVT", spec: "8.0sq", ampacity: { exposed: 57, conduit: 39, ceiling_exposed: 39 }, notes: "3線通電ベース" },
  { id: "CV-14-3C", family: "CV", spec: "14sq (3C)", ampacity: { exposed: 77, conduit: 53, ceiling_exposed: 53 }, notes: "3線通電ベース" },
  { id: "CVT-14", family: "CVT", spec: "14sq", ampacity: { exposed: 82, conduit: 57, ceiling_exposed: 57 }, notes: "3線通電ベース" },
  { id: "CV-22-3C", family: "CV", spec: "22sq (3C)", ampacity: { exposed: 100, conduit: 70, ceiling_exposed: 70 }, notes: "3線通電ベース" },
  { id: "CVT-22", family: "CVT", spec: "22sq", ampacity: { exposed: 110, conduit: 77, ceiling_exposed: 77 }, notes: "3線通電ベース" },
  // D. CVV / CE / DV / OW
  { id: "CVV-CE-2.0-3C", family: "CVV/CE", spec: "2.0sq (3C)", ampacity: { exposed: 20, conduit: 14, ceiling_exposed: 14 } },
  {
    id: "DV-2.0-3C",
    family: "DV",
    spec: "2.0mm (3C)",
    ampacity: { exposed: 27, conduit: false, ceiling_exposed: false },
    notes: "配管内・天井裏固定不可",
  },
  {
    id: "DV-2.6-3C",
    family: "DV",
    spec: "2.6mm (3C)",
    ampacity: { exposed: 38, conduit: false, ceiling_exposed: false },
    notes: "配管内・天井裏固定不可",
  },
  {
    id: "OW-2.0",
    family: "OW",
    spec: "2.0mm",
    ampacity: { exposed: 39, conduit: false, ceiling_exposed: false },
    notes: "配管内・天井裏固定不可",
  },
  // E. VCT / VCTF / 2PNCT
  {
    id: "VCTF-VFF-2.0-3C",
    family: "VCTF/VFF",
    spec: "2.0sq (3C)",
    ampacity: { exposed: 17, conduit: 11, ceiling_exposed: false },
    notes: "天井裏隠ぺい固定不可",
  },
  {
    id: "VCT-2.0-3C",
    family: "VCT",
    spec: "2.0sq (3C)",
    ampacity: { exposed: 22, conduit: 15, ceiling_exposed: false },
    notes: "天井裏隠ぺい固定不可",
  },
  {
    id: "2PNCT-2.0-3C",
    family: "2PNCT",
    spec: "2.0sq (3C)",
    ampacity: { exposed: 22, conduit: 15, ceiling_exposed: false },
    notes: "天井裏隠ぺい固定不可",
  },
  {
    id: "2PNCT-3.5-3C",
    family: "2PNCT",
    spec: "3.5sq (3C)",
    ampacity: { exposed: 32, conduit: 22, ceiling_exposed: false },
    notes: "天井裏隠ぺい固定不可",
  },
] as const;

const CABLE_AMPACITY_BY_ID = new Map(CABLE_AMPACITY_TABLE_V1.map((r) => [r.id, r]));

export function getCableAmpacityRecordV1(cableId: string): CableAmpacityRecord | undefined {
  return CABLE_AMPACITY_BY_ID.get(cableId);
}

export function getCableAmpacityV1(
  cableId: string,
  condition: CableInstallationCondition,
): CableAmpacityValue | undefined {
  const record = getCableAmpacityRecordV1(cableId);
  if (!record) return undefined;
  return record.ampacity[condition];
}

export interface CableInstallationValidationResult {
  ok: boolean;
  cableId: string;
  condition: CableInstallationCondition;
  ampacityA?: number;
  error?: string;
}

/** 施工条件の法的可否と許容電流を検証 */
export function validateCableInstallationV1(
  cableId: string,
  condition: CableInstallationCondition,
): CableInstallationValidationResult {
  const record = getCableAmpacityRecordV1(cableId);
  if (!record) {
    return {
      ok: false,
      cableId,
      condition,
      error: `未知のケーブルID: ${cableId}`,
    };
  }

  const ampacity = record.ampacity[condition];
  if (ampacity === false) {
    const label = CABLE_INSTALLATION_CONDITION_LABELS[condition];
    return {
      ok: false,
      cableId,
      condition,
      error: `${record.family} ${record.spec} は ${label} には使用できません${record.notes ? `（${record.notes}）` : ""}`,
    };
  }

  return { ok: true, cableId, condition, ampacityA: ampacity };
}

/** 負荷電流に対して許容電流が十分か検証 */
export function validateCableLoadV1(
  cableId: string,
  condition: CableInstallationCondition,
  loadCurrentA: number,
): CableInstallationValidationResult {
  const base = validateCableInstallationV1(cableId, condition);
  if (!base.ok || base.ampacityA === undefined) return base;

  if (loadCurrentA > base.ampacityA) {
    return {
      ok: false,
      cableId,
      condition,
      ampacityA: base.ampacityA,
      error: `負荷 ${loadCurrentA}A が許容電流 ${base.ampacityA}A（${CABLE_INSTALLATION_CONDITION_LABELS[condition]}）を超過`,
    };
  }

  return base;
}

/** 許容電流以上の最小ケーブルを選定（同一 family 内） */
export function selectCableByLoadV1(
  family: string,
  condition: CableInstallationCondition,
  loadCurrentA: number,
): CableAmpacityRecord | undefined {
  const candidates = CABLE_AMPACITY_TABLE_V1.filter((r) => r.family === family);
  for (const record of candidates) {
    const ampacity = record.ampacity[condition];
    if (typeof ampacity === "number" && ampacity >= loadCurrentA) {
      return record;
    }
  }
  return undefined;
}
