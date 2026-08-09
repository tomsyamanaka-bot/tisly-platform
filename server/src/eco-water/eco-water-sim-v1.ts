/**
 * TiSLY Eco-Water シミュレーション（サーバー側共有）
 * フロントの eco-water-sim-v1.js と同等ロジック
 */

export const ECO_WATER_SAFE_MIN = 5.8;
export const ECO_WATER_SAFE_MAX = 8.6;
export const ECO_WATER_NEUTRALIZE_START = 8.5;
export const ECO_WATER_DEFAULT_PH = 7.2;
export const ECO_WATER_ALKALINE_PH = 12.3;

export type EcoWaterSimPhase = "idle" | "alkaline" | "neutralizing" | "complete";

export interface EcoWaterSimState {
  ph: number;
  valveOpen: boolean;
  phase: EcoWaterSimPhase;
  phBefore: number | null;
  phAfter: number | null;
  statusMessage: string;
}

export function isDischargeSafePhV1(ph: number): boolean {
  return ph >= ECO_WATER_SAFE_MIN && ph <= ECO_WATER_SAFE_MAX;
}

export function resolvePhStatusLabelV1(ph: number): {
  kind: "safe" | "danger";
  label: string;
} {
  if (isDischargeSafePhV1(ph)) {
    return { kind: "safe", label: "安全・放流適合" };
  }
  if (ph > ECO_WATER_SAFE_MAX) {
    return { kind: "danger", label: "危険・アルカリ性" };
  }
  return { kind: "danger", label: "危険・酸性" };
}

export function createEcoWaterSimStateV1(): EcoWaterSimState {
  return {
    ph: ECO_WATER_DEFAULT_PH,
    valveOpen: false,
    phase: "idle",
    phBefore: null,
    phAfter: ECO_WATER_DEFAULT_PH,
    statusMessage: "待機中 — 放流適合（pH 7.2）",
  };
}

export function applyAlkalineSpikeV1(state: EcoWaterSimState): EcoWaterSimState {
  return {
    ...state,
    ph: ECO_WATER_ALKALINE_PH,
    valveOpen: false,
    phase: "alkaline",
    phBefore: ECO_WATER_ALKALINE_PH,
    phAfter: null,
    statusMessage: "【デモ】アルカリ水投入 — pH 12.3（危険）",
  };
}

export function startNeutralizeV1(state: EcoWaterSimState): EcoWaterSimState {
  const ph = Math.max(state.ph, ECO_WATER_ALKALINE_PH);
  // アルカリ領域では即バルブ開
  const valveOpen = ph > ECO_WATER_DEFAULT_PH;
  return {
    ...state,
    ph,
    valveOpen,
    phase: "neutralizing",
    phBefore: state.phBefore ?? ph,
    phAfter: null,
    statusMessage: "自動中和スタート — CO₂バルブ開",
  };
}

export function stepNeutralizeV1(
  state: EcoWaterSimState,
  step = 0.18
): EcoWaterSimState {
  if (state.phase !== "neutralizing" && state.phase !== "alkaline") {
    return state;
  }
  const nextPh = Math.max(
    ECO_WATER_DEFAULT_PH,
    Number((state.ph - step).toFixed(2))
  );
  // 7.2 到達までバルブ開（青色点滅）
  const done = nextPh <= ECO_WATER_DEFAULT_PH + 0.001;
  const valveOpen = !done;
  return {
    ...state,
    ph: nextPh,
    valveOpen,
    phase: done ? "complete" : "neutralizing",
    phAfter: done ? nextPh : state.phAfter,
    statusMessage: done
      ? "自動中和完了 — バルブ閉 · 放流適合"
      : `自動中和中 — CO₂バルブ${valveOpen ? "開" : "閉"} · pH ${nextPh.toFixed(1)}`,
  };
}

export function buildCertificatePayloadV1(payload: {
  companyName: string;
  siteName: string;
  measuredAt: string;
  phBefore: string;
  phAfter: string;
  calibrationDate: string;
}): string {
  return [
    payload.companyName,
    payload.siteName,
    payload.measuredAt,
    payload.phBefore,
    payload.phAfter,
    payload.calibrationDate,
  ].join("|");
}
