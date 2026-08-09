/**
 * TiSLY Eco-Water デモシミュレーション
 * pH / CO2バルブ状態の段階制御
 */

export const ECO_WATER_SAFE_MIN = 5.8;
export const ECO_WATER_SAFE_MAX = 8.6;
export const ECO_WATER_NEUTRALIZE_START = 8.5;
export const ECO_WATER_DEFAULT_PH = 7.2;
export const ECO_WATER_ALKALINE_PH = 12.3;

/**
 * @typedef {"idle" | "alkaline" | "neutralizing" | "complete"} EcoWaterSimPhase
 */

/**
 * @typedef {object} EcoWaterSimState
 * @property {number} ph
 * @property {boolean} valveOpen
 * @property {EcoWaterSimPhase} phase
 * @property {number | null} phBefore
 * @property {number | null} phAfter
 * @property {string} statusMessage
 */

/**
 * 放流適合判定
 * @param {number} ph
 */
export function isDischargeSafePhV1(ph) {
  return ph >= ECO_WATER_SAFE_MIN && ph <= ECO_WATER_SAFE_MAX;
}

/**
 * ステータスバッジ文言
 * @param {number} ph
 */
export function resolvePhStatusLabelV1(ph) {
  if (isDischargeSafePhV1(ph)) {
    return { kind: "safe", label: "安全・放流適合" };
  }
  if (ph > ECO_WATER_SAFE_MAX) {
    return { kind: "danger", label: "危険・アルカリ性" };
  }
  return { kind: "danger", label: "危険・酸性" };
}

/**
 * 初期状態
 * @returns {EcoWaterSimState}
 */
export function createEcoWaterSimStateV1() {
  return {
    ph: ECO_WATER_DEFAULT_PH,
    valveOpen: false,
    phase: "idle",
    phBefore: null,
    phAfter: ECO_WATER_DEFAULT_PH,
    statusMessage: "待機中 — 放流適合（pH 7.2）",
  };
}

/**
 * アルカリ水投入
 * @param {EcoWaterSimState} state
 */
export function applyAlkalineSpikeV1(state) {
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

/**
 * 中和1ステップ（タイマーから呼ぶ）
 * @param {EcoWaterSimState} state
 * @param {number} [step]
 */
export function stepNeutralizeV1(state, step = 0.18) {
  if (state.phase !== "neutralizing" && state.phase !== "alkaline") {
    return state;
  }
  const nextPh = Math.max(
    ECO_WATER_DEFAULT_PH,
    Number((state.ph - step).toFixed(2))
  );
  const valveOpen = nextPh > ECO_WATER_NEUTRALIZE_START;
  const done = nextPh <= ECO_WATER_DEFAULT_PH + 0.001;
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

/**
 * 自動中和開始
 * @param {EcoWaterSimState} state
 */
export function startNeutralizeV1(state) {
  const ph = Math.max(state.ph, ECO_WATER_ALKALINE_PH);
  return {
    ...state,
    ph,
    valveOpen: ph > ECO_WATER_NEUTRALIZE_START,
    phase: "neutralizing",
    phBefore: state.phBefore ?? ph,
    phAfter: null,
    statusMessage: "自動中和スタート — CO₂バルブ開",
  };
}

/**
 * 改ざん防止ハッシュ用ペイロード文字列
 * @param {object} payload
 */
export function buildCertificatePayloadV1(payload) {
  return [
    payload.companyName,
    payload.siteName,
    payload.measuredAt,
    String(payload.phBefore),
    String(payload.phAfter),
    payload.calibrationDate,
  ].join("|");
}

/**
 * SHA-256 ハッシュ（ブラウザ / Node 共通）
 * @param {string} text
 */
export async function sha256HexV1(text) {
  const data = new TextEncoder().encode(text);
  if (globalThis.crypto?.subtle) {
    const buf = await globalThis.crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(buf)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // フォールバック（デモ用簡易ハッシュ）
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fallback-${(h >>> 0).toString(16).padStart(8, "0")}`;
}
