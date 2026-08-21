/**
 * サイバーネオン系デバイスピン SVG（Builder / Security 共用）
 */

/** @typedef {"camera"|"door"|"lock"|"panel"|"mmwave"|"gas"|"window"|"entrance"|"backdoor"} DevicePinKind */

/**
 * @param {string} kind
 * @returns {DevicePinKind | string}
 */
export function normalizeDeviceKind(kind) {
  const k = String(kind || "").toLowerCase();
  if (k === "entrance" || k === "backdoor") return "door";
  if (k === "gas" || k === "window") return k;
  if (["camera", "door", "lock", "panel", "mmwave"].includes(k)) return k;
  return k || "door";
}

/**
 * ミニマルベクター SVG（現在色は currentColor）
 * @param {string} kind
 */
export function devicePinSvgInner(kind) {
  const k = normalizeDeviceKind(kind);
  if (k === "camera") {
    return `<svg class="tisly-pin-svg" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="7" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/>
      <path d="M17 10l4-2v8l-4-2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
      <circle cx="10" cy="12" r="2.2" fill="currentColor"/>
    </svg>`;
  }
  if (k === "door") {
    return `<svg class="tisly-pin-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 4h9a2 2 0 0 1 2 2v14H6V4z" fill="none" stroke="currentColor" stroke-width="1.8"/>
      <path d="M17 6.5l3 1.2v11.6l-3 1.2" fill="none" stroke="currentColor" stroke-width="1.6" opacity="0.7"/>
      <circle cx="13.2" cy="12" r="1.1" fill="currentColor"/>
    </svg>`;
  }
  if (k === "lock") {
    return `<svg class="tisly-pin-svg" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/>
      <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.8"/>
      <circle cx="12" cy="15.5" r="1.3" fill="currentColor"/>
    </svg>`;
  }
  if (k === "panel" || k === "gas") {
    return `<svg class="tisly-pin-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13 2L5 13h6l-1 9 9-12h-6l0-8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    </svg>`;
  }
  if (k === "mmwave") {
    return `<svg class="tisly-pin-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 18v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M8 14a6 6 0 0 1 8 0" fill="none" stroke="currentColor" stroke-width="1.6"/>
      <path d="M5.5 11a9.5 9.5 0 0 1 13 0" fill="none" stroke="currentColor" stroke-width="1.6" opacity="0.75"/>
      <path d="M3 8a13 13 0 0 1 18 0" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
    </svg>`;
  }
  if (k === "window") {
    return `<svg class="tisly-pin-svg" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
      <path d="M12 5v14M4 12h16" stroke="currentColor" stroke-width="1.6"/>
    </svg>`;
  }
  return `<svg class="tisly-pin-svg" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="1.8"/>
  </svg>`;
}

/**
 * フローティング・ロケーションピン HTML
 * @param {{ kind?: string, alerting?: boolean, isCam?: boolean, title?: string, extraClass?: string }} opts
 */
export function buildDevicePinHtml(opts = {}) {
  const kind = normalizeDeviceKind(opts.kind);
  const isCam = opts.isCam ?? kind === "camera";
  const alerting = !!opts.alerting;
  const cls =
    "sf-iso3d-pin tisly-neon-pin" +
    (isCam ? " is-cam" : " is-sens") +
    (alerting ? " is-alert" : "") +
    (opts.extraClass ? ` ${opts.extraClass}` : "") +
    ` kind-${kind}`;
  return (
    `<span class="tisly-neon-pin-glow" aria-hidden="true"></span>` +
    `<span class="tisly-neon-pin-body">` +
    `<span class="tisly-neon-pin-head">${devicePinSvgInner(kind)}</span>` +
    `<span class="tisly-neon-pin-point"></span>` +
    `</span>` +
    `<span class="sf-iso3d-pin-pulse tisly-neon-pin-pulse" aria-hidden="true"></span>`
  );
}

/** パレット用ラベル */
export const DEVICE_PALETTE_ITEMS_V1 = [
  { kind: "camera", label: "カメラ", hint: "📷" },
  { kind: "door", label: "ドアセンサー", hint: "🚪" },
  { kind: "lock", label: "鍵", hint: "🔒" },
  { kind: "panel", label: "電源/ブレーカー", hint: "⚡" },
  { kind: "mmwave", label: "ミリ波", hint: "📡" },
];
