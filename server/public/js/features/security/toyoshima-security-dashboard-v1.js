/**
 * 豊島邸 Security ダッシュボード UI
 * 白ベース × ネイビー · スマホ視認性優先
 */

import {
  registerSecurityWebPushV1,
  refreshSecurityPushDiagV1,
} from "./security-floor-push-v1.js";
import {
  applyToyoshimaHardwareStatus,
  fetchToyoshimaDashboard,
  fetchToyoshimaStatus,
  formatFirmwareCustomerLabel,
  isHardwareOnline,
  subscribeToyoshimaStatus,
} from "./use-toyoshima-status-v1.js";
import {
  bindGuardViewerLaunchersV1,
  GUARD_VIEWER_HINT_V1,
  GUARD_VIEWER_SCHEME_V1,
  renderGuardViewerStoreHelpHtmlV1,
} from "./open-guard-viewer-v1.js";
import {
  bindSecurityHistoryModalV1,
  openSecurityHistoryModalV1,
  setSecurityHistorySiteIdV1,
} from "./security-history-modal-v1.js";

import { getTislySessionHeadersV1 } from "../../customer-auth.js";
import {
  socFloorIconSvg,
  socFloorCaption,
} from "./security-floor-map-v1.js";

const TOYOSHIMA_SEC_ID = "SEC-JP-TOYOSHIMA-001";
const TOYOSHIMA_HOME_ID = "HOME-JP-TOYOSHIMA";
const HOME_API = "/api/home/v1";
const NOTIFY_MODES = ["critical", "silent", "off"];
const NOTIFY_LABELS = {
  critical: "緊急通知ON",
  silent: "サイレント",
  off: "OFF",
};

function syncSettingsState(dash) {
  if (!dash) return;
  settingsState = {
    lightingDurationSec: dash.lightingDurationSec ?? 45,
    perimeterTimeoutSec: dash.perimeterTimeoutSec ?? 120,
    patliteThreatEnabled: dash.patliteThreatEnabled !== false,
    scheduleStart: dash.scheduleStart || "18:00",
    scheduleEnd: dash.scheduleEnd || "06:00",
    customerMode: dash.customerMode || "home",
    securityMode: String(dash.securityMode || "2STEP").toUpperCase(),
    flashEnabled: dash.flashEnabled !== false,
    flashDurationSec: dash.flashDurationSec ?? 15,
    forceRelayTest: dash.forceRelayTest !== false,
    diConfirmMs: dash.diConfirmMs ?? 100,
    debounceDi1Ms: dash.debounceDi1Ms ?? dash.diConfirmMs ?? 100,
    debounceDi2Ms: dash.debounceDi2Ms ?? dash.diConfirmMs ?? 100,
    debounceBeamMs: dash.debounceBeamMs ?? dash.diConfirmMs ?? 100,
  };
}

let lastDashSig = "";
let clientLatencyMs = null;
/** 顧客/社内タブの単一真実ソース（家のようす/お知らせ/履歴） */
let activeCustomerPane = "map";
/** お知らせ再描画用の直近ダッシュ */
let lastRenderedDash = null;
/** 豊島邸ポータル通知（既存行は削除しない） */
let portalNotifications = [];
const NOTIFY_READ_KEY = "tisly-ts-notify-read-v1";
let scheduleState = {
  homeSiteId: TOYOSHIMA_HOME_ID,
  guardMode: "scheduled",
  scheduleStart: "18:00",
  scheduleEnd: "06:00",
};
let settingsSaveTimer = null;
let settingsState = {
  lightingDurationSec: 45,
  perimeterTimeoutSec: 120,
  patliteThreatEnabled: true,
  scheduleStart: "18:00",
  scheduleEnd: "06:00",
  customerMode: "home",
  securityMode: "2STEP",
  flashEnabled: true,
  flashDurationSec: 15,
  forceRelayTest: true,
  diConfirmMs: 100,
  debounceDi1Ms: 100,
  debounceDi2Ms: 100,
  debounceBeamMs: 100,
};

const SECURITY_MODE_OPTIONS = [
  {
    id: "2STEP",
    label: "遠近2段階",
    desc: "外周はライト1、至近は全点灯",
  },
  {
    id: "DIRECT",
    label: "すぐ全点灯",
    desc: "遠近ともライト1+2とフラッシュ",
  },
  {
    id: "SILENT",
    label: "通知のみ",
    desc: "ライトとフラッシュは動かさない",
  },
];

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatJstCommTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

/** 顧客向け · 短い最終確認時刻（例: 09/03 21:50） */
function formatJstConfirmTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

/** 5分以内は即時オンライン */
const HB_FRESH_MS = 5 * 60 * 1000;
/** 標準途絶（5分30秒） */
const HB_OFFLINE_MS = 5 * 60 * 1000 + 30 * 1000;

function heartbeatAgeMs(iso, now = Date.now()) {
  if (!iso) return Number.POSITIVE_INFINITY;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return Number.POSITIVE_INFINITY;
  return now - at;
}

/**
 * lastHeartbeat からオンラインを再判定
 * lastCommAt や onlineSummary キャッシュは使わない
 */
function isHeartbeatOnlineNow(iso, now = Date.now()) {
  return isHardwareOnline(iso, now);
}

/**
 * 通信ヘルス表示の単一真実ソース（SSOT）
 * dash.commHealth.lastHeartbeatAt のみを使う
 */
function buildCommHealthView(dash) {
  const health = dash?.commHealth || {};
  const heartbeatIso = health.lastHeartbeatAt || null;
  const online =
    heartbeatAgeMs(heartbeatIso) < HB_FRESH_MS &&
    isHeartbeatOnlineNow(heartbeatIso);
  const offline = !online;
  const latencyMs =
    typeof clientLatencyMs === "number" && Number.isFinite(clientLatencyMs)
      ? Math.max(0, Math.round(clientLatencyMs))
      : null;
  let latencyLabel = "計測中…";
  let latencyTone = "info";
  if (latencyMs != null) {
    latencyTone = latencyMs <= 120 ? "ok" : latencyMs <= 300 ? "info" : "alert";
    const quality =
      latencyMs <= 120 ? "良好" : latencyMs <= 300 ? "普通" : "遅延あり";
    latencyLabel = `${latencyMs} ms（${quality}）`;
  }
  const tempLevel = health.boardTempLevel || "normal";
  const tempEmoji =
    tempLevel === "warning" ? "🔴" : tempLevel === "caution" ? "🟡" : "🟢";
  const tempC = health.boardTempC;
  const hasTemp =
    typeof tempC === "number" && Number.isFinite(tempC);
  const tempLabel = hasTemp
    ? health.boardTempLabel || `${tempC.toFixed(1)}℃`
    : health.boardTempLabel || "正常監視中";
  const operatorOnline = online
    ? health.operatorOnline ||
      health.onlineSummary ||
      "🟢 正常稼働中（オンライン）"
    : "🔴 オフライン（通信途絶）";
  const customerOnline = online
    ? health.customerOnline || "🟢 正常稼働中（オンライン）"
    : "🔴 オフライン（通信途絶）";
  return {
    online,
    isHardwareOnline: online,
    offline,
    operatorOnline,
    customerOnline,
    latencyLabel,
    latencyTone,
    tempLevel,
    tempEmoji,
    tempLabel,
    heartbeatIso,
    heartbeatLabel: heartbeatIso
      ? health.lastHeartbeatLabelJst || formatJstCommTime(heartbeatIso)
      : "未受信",
    confirmLabel: heartbeatIso
      ? health.confirmLabelJst || formatJstConfirmTime(heartbeatIso)
      : "—",
    firmwareVersion:
      health.firmwareVersion || dash?.ota?.runningVersion || null,
    firmwareServerVersion:
      health.firmwareServerVersion || dash?.ota?.serverVersion || null,
    firmwareLatest:
      health.firmwareLatest === true ||
      (!!dash?.ota?.runningVersion &&
        dash.ota.runningVersion === dash.ota.serverVersion &&
        !dash.ota.has_ota_update),
    firmwareLabel: formatFirmwareCustomerLabel(
      health.firmwareVersion || dash?.ota?.runningVersion
    ),
  };
}

function showToast(message) {
  let el = $("ts-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "ts-toast";
    el.className = "ts-toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("is-visible");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => el.classList.remove("is-visible"), 3200);
}

const LIGHT_KICK_TOAST = {
  do1_on: "ライト1を点灯しました",
  do2_on: "ライト2を点灯しました",
  do3_on: "フラッシュを点灯しました",
  patlite_test: "フラッシュ威嚇テストを開始しました",
  bulk_lights_on: "照明を一括ONにしました",
  bulk_lights_off: "照明を一括OFFにしました",
};

function renderManualLightKickRow() {
  /* document capture で必ず拾う
   * soft patch で DOM が壊れても再結線不要 */
  return `<div class="ts-btn-row ts-manual-light-kicks">
      <button type="button" class="ts-btn" data-ts-light-kick="do1_on"
        data-ts-building="main" data-ts-action="do1_on">💡 ライト1点灯</button>
      <button type="button" class="ts-btn" data-ts-light-kick="do2_on"
        data-ts-building="main" data-ts-action="do2_on">💡 ライト2点灯</button>
      <button type="button" class="ts-btn ts-btn-primary" data-ts-light-kick="bulk_lights_on"
        data-ts-building="main" data-ts-action="bulk_lights_on">💡 照明を一括ON</button>
      <button type="button" class="ts-btn ts-btn-ghost" data-ts-light-kick="bulk_lights_off"
        data-ts-building="main" data-ts-action="bulk_lights_off">💡 照明を一括OFF</button>
      <button type="button" class="ts-btn" data-ts-light-kick="patlite_test"
        data-ts-building="main" data-ts-action="patlite_test">⚡ フラッシュ威嚇テスト</button>
    </div>`;
}

async function kickToyoshimaManualLight(action, building) {
  const actor = isCustomerPortal() ? "customer-portal" : "app";
  let data;
  if (action === "bulk_lights_on" || action === "bulk_lights_off") {
    data = await postJson("/toyoshima/bulk-lights", {
      siteId: TOYOSHIMA_HOME_ID,
      action: action === "bulk_lights_on" ? "on" : "off",
      actor,
    });
  } else {
    data = await postJson("/toyoshima/control", {
      siteId: TOYOSHIMA_HOME_ID,
      building: building || "main",
      action,
      actor,
    });
  }
  if (data.queued === false) {
    throw new Error("実機キューへ送れませんでした");
  }
  if (data.dashboard) {
    renderToyoshimaDashboard(data.dashboard, { soft: true });
  }
  showToast(LIGHT_KICK_TOAST[action] || "ライトを点灯しました");
}

function bindToyoshimaLightKickButtons() {
  if (window.__TISLY_TS_LIGHT_KICK_BOUND) return;
  window.__TISLY_TS_LIGHT_KICK_BOUND = true;
  document.addEventListener(
    "click",
    (e) => {
      const btn = e.target.closest?.("[data-ts-light-kick]");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const action = btn.getAttribute("data-ts-light-kick");
      const building = btn.getAttribute("data-ts-building") || "main";
      if (!action || btn.disabled) return;
      btn.disabled = true;
      kickToyoshimaManualLight(action, building)
        .catch((err) => {
          showToast(err.message || "点灯に失敗しました");
        })
        .finally(() => {
          btn.disabled = false;
        });
    },
    true
  );
}

function normalizeTimeHm(value, fallback) {
  const raw = String(value || "").trim();
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(raw);
  if (!m) return fallback;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** JST 現在時刻を 0〜1439 分で返す */
function jstNowMinutesV1(at = new Date()) {
  const shifted = new Date(
    at.getTime() + (at.getTimezoneOffset() + 540) * 60000
  );
  return shifted.getHours() * 60 + shifted.getMinutes();
}

function hmToMinutesV1(hm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || ""));
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 点灯スケジュール内か（日跨ぎ・終日対応） */
export function isWithinLightScheduleV1(
  startHm,
  endHm,
  nowMin = jstNowMinutesV1()
) {
  const start = hmToMinutesV1(startHm);
  const end = hmToMinutesV1(endHm);
  /* 開始＝終了は終日点灯（おでかけ警戒） */
  if (start === end) return true;
  if (start < end) return nowMin >= start && nowMin < end;
  return nowMin >= start || nowMin < end;
}

/* 設定 UI 用の小さな SVG。色は currentColor */
const TS_ICON_SUN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>`;
const TS_ICON_MOON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16.5 13.5A7 7 0 0 1 10 5a6.5 6.5 0 1 0 6.5 8.5Z"/></svg>`;
const TS_ICON_TIMER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5M9 3h6"/></svg>`;
const TS_ICON_BULB = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M8 14a6 6 0 1 1 8 0c-1 1.2-1.5 2-1.7 4H9.7C9.5 16 9 15.2 8 14Z"/></svg>`;

/**
 * 1F / 外周の見るエリア切替。
 * 3D枠の外に出したボタンの装飾のみ。
 */
export function renderAreaSwitchCard(activeId) {
  /* 顧客画面からは見るエリアを出さない
   * 関数は再表示用に残す */
  return "";
  const focus = activeId === "outdoor" ? "outdoor" : "1f";
  const items = [
    { id: "1f", label: "1F" },
    { id: "outdoor", label: "外周" },
  ];
  const buttons = items
    .map((it) => {
      const on = it.id === focus ? " is-on" : "";
      const cap = socFloorCaption(it.id);
      return `<button type="button" class="sf-tab sf-tab--iconed${on}"
        data-floor="${it.id}" data-ts-area="${it.id}">
        <span class="sf-tab-ico" aria-hidden="true">${socFloorIconSvg(
          it.id
        )}</span>
        <span class="sf-tab-copy">
          <span class="sf-tab-txt">${it.label}</span>
          <span class="sf-tab-sub">${cap}</span>
        </span>
      </button>`;
    })
    .join("");
  return `<section class="sf-area-switch ts-area-switch" id="ts-area-switch" aria-label="見るエリア">
    <p class="sf-area-switch-label">見るエリア</p>
    <div class="sf-tabs sf-area-tabs" id="ts-floor-tabs">${buttons}</div>
  </section>`;
}

/**
 * 昼夜の動作差を 2 枚のタイルで見せる。
 * いまどちら側で動いているかを反転表示する。
 */
export function renderDayNightRuleCard(dash) {
  const mode = dash.customerMode || "home";
  const start = normalizeTimeHm(dash.scheduleStart, "18:00");
  const end = normalizeTimeHm(dash.scheduleEnd, "06:00");
  const disarmed = mode === "disarmed";
  const forceRelay = dash.forceRelayTest !== false;
  const nightNow = !disarmed && isWithinLightScheduleV1(start, end);
  const dayNow = !disarmed && !nightNow;
  const allDay = hmToMinutesV1(start) === hmToMinutesV1(end);

  const dayDesc = forceRelay
    ? "通知＋テスト点灯（昼間連動ON）"
    : "通知のみ・ライトは消灯のまま";
  const nightDesc = "防犯ライト点灯＋通知";
  const nowBadge = `<span class="ts-dn-now">いま</span>`;

  const note = disarmed
    ? "警戒解除中はライトも通知も停止します"
    : allDay
      ? `終日ライト連動（${start}〜${end} 指定で 24 時間）／通知は 24 時間`
      : `夜間ライト ${start}〜${end}／通知は 24 時間`;

  return `<div class="ts-daynight" id="ts-daynight"
    data-ts-daynight="${disarmed ? "disarmed" : nightNow ? "night" : "day"}">
    <div class="ts-dn-tile ts-dn-day${dayNow ? " is-now" : ""}${
      disarmed ? " is-muted" : ""
    }">
      <span class="ts-dn-ico" aria-hidden="true">${TS_ICON_SUN}<span class="ts-dn-emoji">☀️</span></span>
      <span class="ts-dn-head">日中（通知のみ）</span>
      <span class="ts-dn-desc">${dayDesc}</span>
      ${dayNow ? nowBadge : ""}
    </div>
    <div class="ts-dn-tile ts-dn-night${nightNow ? " is-now" : ""}${
      disarmed ? " is-muted" : ""
    }">
      <span class="ts-dn-ico" aria-hidden="true">${TS_ICON_MOON}<span class="ts-dn-emoji">🌙</span></span>
      <span class="ts-dn-head">夜間（ライト点灯＋通知）</span>
      <span class="ts-dn-desc">${nightDesc}</span>
      ${nightNow ? nowBadge : ""}
    </div>
  </div>
  <p class="ts-dn-note">${escapeHtml(note)}</p>`;
}

/**
 * 秒数スライダー（大きな数値＋目盛り）。
 * 値表示の id は既存ロジックと同じまま。
 */
export function renderSecondsSliderField(opt) {
  const min = Number(opt.min);
  const max = Number(opt.max);
  const step = Number(opt.step || 1);
  const value = Number(opt.value);
  const labelId = opt.labelId ? ` id="${opt.labelId}"` : "";
  /* 目盛りは最小・1/3・2/3・最大の 4 点 */
  const stops = [min, min + (max - min) / 3, min + ((max - min) * 2) / 3, max]
    .map((v) => Math.round(v))
    .map((v) => `<span>${v}秒</span>`)
    .join("");
  return `<label class="ts-slider-field ts-slider-rich" for="${opt.id}">
    <span class="ts-slider-head">
      <span class="ts-label"${labelId}>${opt.label}</span>
      <span class="ts-slider-val" id="${opt.id}-val">${value}秒</span>
    </span>
    <div class="ts-slider-row">
      <span class="ts-slider-cap" aria-hidden="true">${TS_ICON_TIMER}<span class="ts-visually-hidden">⏱️</span><small>${
        opt.minCaption || "短め"
      }</small></span>
      <input type="range" id="${opt.id}" min="${min}" max="${max}"
        step="${step}" value="${value}" />
      <span class="ts-slider-cap" aria-hidden="true">${TS_ICON_BULB}<span class="ts-visually-hidden">💡</span><small>${
        opt.maxCaption || "長め"
      }</small></span>
    </div>
    <span class="ts-slider-scale" aria-hidden="true">${stops}</span>
  </label>`;
}

function renderMsSliderField(opt) {
  const value = Number(opt.value) || 100;
  return `<label class="ts-slider-field ts-slider-rich" for="${opt.id}">
    <span class="ts-slider-head">
      <span class="ts-label">${opt.label}</span>
      <span class="ts-slider-val" id="${opt.id}-val">${value}ms</span>
    </span>
    <div class="ts-slider-row">
      <span class="ts-slider-cap" aria-hidden="true">${TS_ICON_TIMER}<span class="ts-visually-hidden">⏱️</span><small>速い</small></span>
      <input type="range" id="${opt.id}" min="20" max="500" step="10" value="${value}" />
      <span class="ts-slider-cap" aria-hidden="true">${TS_ICON_TIMER}<span class="ts-visually-hidden">⏱️</span><small>遅い</small></span>
    </div>
    <span class="ts-slider-scale" aria-hidden="true"><span>20ms</span><span>180ms</span><span>340ms</span><span>500ms</span></span>
  </label>`;
}

function syncScheduleState(dash) {
  if (!dash) return;
  scheduleState = {
    homeSiteId: dash.homeSiteId || dash.propertyId || TOYOSHIMA_HOME_ID,
    guardMode: dash.guardMode || "scheduled",
    scheduleStart: dash.scheduleStart || "18:00",
    scheduleEnd: dash.scheduleEnd || "06:00",
  };
}

/** 顧客ポータル（/customer）判定 */
function isCustomerPortal() {
  return document.body.classList.contains("sf-customer");
}

function renderHeroChips(dash) {
  const modeLabel = dash.customerModeLabel || dash.guardModeLabel || "警戒";
  const lightLabel = dash.lightsScheduleLabel || "—";
  return `<button type="button" class="ts-hero-chip" data-ts-schedule="guard" aria-haspopup="dialog">
      <span class="ts-hero-chip-label">警戒</span>
      <span class="ts-hero-chip-value">${escapeHtml(modeLabel)}</span>
    </button>
    <button type="button" class="ts-hero-chip" data-ts-schedule="light" aria-haspopup="dialog">
      <span class="ts-hero-chip-label">ライト点灯</span>
      <span class="ts-hero-chip-value">${escapeHtml(lightLabel)}</span>
    </button>`;
}

/** 顧客向け · 安全確認カード＋サマリー */
function renderCustomerStatusBanner(dash) {
  const alarm = dash.alarm || {};
  const alerting = !!alarm.active;
  const detectLabel = dash.monthlyDetectionLabel || "0件";
  const lightLabel = dash.lightsScheduleLabel || "18:00〜06:00";
  const view = buildCommHealthView(dash);
  applyHardwareStatusFromDash(dash, view);
  return `<div id="ts-customer-status-stack">
  ${renderCustomerAssureHealthCard(view)}
  <section class="ts-card ts-safety-card ${
    alerting ? "is-alert" : "is-ok"
  }" id="ts-status-banner">
    <div class="ts-safety-main">
      <span class="ts-status-emoji" aria-hidden="true">${alerting ? "🚨" : "✅"}</span>
      <div class="ts-status-copy">
        <p class="ts-status-head">${alerting ? "発報があります" : "安全確認：異常なし"}</p>
        <p class="ts-status-sub">${escapeHtml(
          alarm.message || "すべてのセンサーが正常に動作しています"
        )}</p>
      </div>
    </div>
    <div class="ts-safety-metrics" aria-label="稼働サマリー">
      <div class="ts-safety-metric">
        <span class="ts-safety-metric-key">今月の発報</span>
        <strong class="ts-safety-metric-val">${escapeHtml(detectLabel)}</strong>
      </div>
      <div class="ts-safety-metric">
        <span class="ts-safety-metric-key">防犯ライト</span>
        <strong class="ts-safety-metric-val">${escapeHtml(lightLabel)}自動点灯</strong>
      </div>
    </div>
  </section>
  </div>`;
}

/**
 * 顧客向け · システム安心・通信ヘルスカード
 * 危険スイッチは含めず稼働状態のみ表示
 */
function renderCustomerAssureHealthCard(view) {
  return `<section class="ts-card ts-assure-health-card" id="ts-customer-health-card" data-ssot="toyoshima-commHealth" aria-label="システム安心・通信ヘルス">
    <div class="ts-assure-head-row">
      <h3 class="ts-card-head ts-assure-head">🛡 システム安心ステータス</h3>
      <button type="button" class="ts-refresh-btn" data-ts-action="refresh_status" aria-label="最新状態に更新">
        🔄 最新状態に更新
      </button>
    </div>
    <div class="ts-assure-grid">
      <div class="ts-assure-row">
        <span class="ts-assure-key">稼働ステータス</span>
        <span class="ts-assure-val ${view.isHardwareOnline ? "" : "is-offline"}" id="ts-assure-online">${escapeHtml(view.customerOnline)}</span>
      </div>
      <div class="ts-assure-row">
        <span class="ts-assure-key">ネットワーク遅延</span>
        <span class="ts-assure-val" id="ts-assure-latency">${escapeHtml(view.latencyLabel)}</span>
      </div>
      <div class="ts-assure-row">
        <span class="ts-assure-key">盤内温度</span>
        <span class="ts-assure-val ts-board-temp is-${view.tempLevel}" id="ts-assure-temp">${view.tempEmoji} ${escapeHtml(view.tempLabel)}</span>
      </div>
      <div class="ts-assure-row">
        <span class="ts-assure-key">システムバージョン</span>
        <span class="ts-assure-val ts-assure-fw-wrap" id="ts-assure-fw-wrap">
          <span id="ts-assure-fw">${escapeHtml(view.firmwareLabel || "―")}</span>
          <span class="ts-fw-badge" id="ts-assure-fw-badge"${
            view.firmwareLatest ? "" : " hidden"
          }>🟢 最新</span>
        </span>
      </div>
      <div class="ts-assure-row">
        <span class="ts-assure-key">最終確認時刻</span>
        <span class="ts-assure-val" id="ts-assure-confirm">${escapeHtml(view.confirmLabel)}</span>
      </div>
    </div>
    <p class="ts-assure-note">TOMS が常時遠隔監視しています</p>
  </section>`;
}

/**
 * ヘッダーとカードを同一 HB 判定へ
 * 社内／顧客の両方で必ず呼ぶ
 */
function applyHardwareStatusFromDash(dash, view = null) {
  const healthView = view || buildCommHealthView(dash);
  applyToyoshimaHardwareStatus({
    isHardwareOnline: healthView.isHardwareOnline,
    uiOnline: healthView.isHardwareOnline,
    customerOnline: healthView.customerOnline,
    operatorOnline: healthView.operatorOnline,
    lastHeartbeatAt: healthView.heartbeatIso,
    lastHeartbeatLabelJst: healthView.heartbeatLabel,
    confirmLabelJst: healthView.confirmLabel,
    boardTempC: dash?.commHealth?.boardTempC ?? null,
    boardTempLabel: healthView.tempLabel,
    boardTempLevel: healthView.tempLevel,
    firmwareVersion: healthView.firmwareVersion,
    firmwareServerVersion: healthView.firmwareServerVersion,
    firmwareLatest: healthView.firmwareLatest,
    firmwareLabel: healthView.firmwareLabel,
  });
}

/** 顧客向け · 日常詳細設定（常時表示カード） */
function renderTwoStepRemoteBlock(dash) {
  const mode = String(
    dash.securityMode || settingsState.securityMode || "2STEP"
  ).toUpperCase();
  const flashOn = dash.flashEnabled !== false;
  const forceRelay = dash.forceRelayTest !== false;
  const flashSec = dash.flashDurationSec ?? settingsState.flashDurationSec ?? 15;
  const buttons = SECURITY_MODE_OPTIONS.map(
    (opt) => `<button type="button" class="ts-seg-btn ${
      mode === opt.id ? "is-on" : ""
    }" data-ts-security-mode="${opt.id}">
        <span class="ts-seg-label">${opt.label}</span>
        <span class="ts-seg-desc">${opt.desc}</span>
      </button>`
  ).join("");
  return `<section class="ts-daily-block" id="ts-twostep-block">
        <h4 class="ts-daily-h">遠近ビーム連動</h4>
        <p class="ts-hint">外周と建物至近で点灯の仕方を切り替えます</p>
        <div class="ts-seg-row" id="ts-security-mode">${buttons}</div>
        <label class="ts-switch-row" for="ts-flash-enabled">
          <span class="ts-label">フラッシュライト連動</span>
          <span class="ts-switch">
            <input type="checkbox" id="ts-flash-enabled" ${flashOn ? "checked" : ""} />
            <span class="ts-switch-ui" aria-hidden="true"></span>
            <span class="ts-switch-text" id="ts-flash-enabled-label">${flashOn ? "ON" : "OFF"}</span>
          </span>
        </label>
        <label class="ts-switch-row" for="ts-force-relay-test">
          <span class="ts-label">昼間でもセンサー連動リレー（テスト）</span>
          <span class="ts-switch">
            <input type="checkbox" id="ts-force-relay-test" ${forceRelay ? "checked" : ""} />
            <span class="ts-switch-ui" aria-hidden="true"></span>
            <span class="ts-switch-text" id="ts-force-relay-test-label">${forceRelay ? "ON" : "OFF"}</span>
          </span>
        </label>
        ${renderSecondsSliderField({
          id: "ts-flash-duration",
          label: "⚡ フラッシュ点灯時間",
          value: flashSec,
          min: 5,
          max: 60,
          step: 1,
          minCaption: "短め",
          maxCaption: "長め",
        })}
      </section>`;
}

function renderCustomerDailySettings(dash) {
  const mode = dash.customerMode || "home";
  const lightSec = dash.lightingDurationSec ?? 45;
  const patliteOn = dash.patliteThreatEnabled !== false;
  const start = normalizeTimeHm(dash.scheduleStart, "18:00");
  const end = normalizeTimeHm(dash.scheduleEnd, "06:00");
  const sensors = dash.notifySensors || [];
  const lightLabel =
    mode === "away"
      ? "防犯ライト点灯維持時間"
      : mode === "home"
        ? "外構ライト点灯維持時間"
        : "ライト点灯維持時間";
  const patliteBlock =
    mode === "away"
      ? `<label class="ts-switch-row" for="ts-patlite-threat">
        <span class="ts-label">パトライト威嚇連動</span>
        <span class="ts-switch">
          <input type="checkbox" id="ts-patlite-threat" ${patliteOn ? "checked" : ""} />
          <span class="ts-switch-ui" aria-hidden="true"></span>
          <span class="ts-switch-text" id="ts-patlite-threat-label">${patliteOn ? "ON" : "OFF"}</span>
        </span>
      </label>`
      : mode === "home"
        ? `<div class="ts-switch-row is-locked">
        <span class="ts-label">パトライト威嚇連動</span>
        <span class="ts-locked-val">OFF固定（作動しません）</span>
      </div>`
        : `<p class="ts-hint">警戒解除中はライト・パトライトは停止します</p>`;

  const notifyRows = sensors
    .map((s) => {
      return `<div class="ts-notify-row ts-customer-notify-row">
        <span class="ts-label">${escapeHtml(s.label)}</span>
        <div class="ts-notify-btns">
          <button type="button" class="ts-notify-btn ${s.mode === "critical" ? "is-on" : ""}"
            data-ts-notify-sensor="${escapeHtml(s.id)}" data-ts-notify-mode="critical">
            🔔 緊急
          </button>
          <button type="button" class="ts-notify-btn ${s.mode === "silent" ? "is-on" : ""}"
            data-ts-notify-sensor="${escapeHtml(s.id)}" data-ts-notify-mode="silent">
            🔕 サイレント
          </button>
          <button type="button" class="ts-notify-btn ${s.mode === "off" ? "is-on" : ""}"
            data-ts-notify-sensor="${escapeHtml(s.id)}" data-ts-notify-mode="off">
            OFF
          </button>
        </div>
      </div>`;
    })
    .join("");

  const modeDetailsHidden = mode === "disarmed" ? " hidden" : "";

  /* details ではなく常時表示セクションで確実マウント */
  return `<section class="ts-card ts-daily-settings" id="ts-daily-settings" data-ts-daily-mounted="1">
    <h3 class="ts-card-head">⚙️ 防犯・照明・通知の詳細設定</h3>
    <div class="ts-daily-body">
      <section class="ts-daily-block" id="ts-mode-actions"${modeDetailsHidden}>
        <h4 class="ts-daily-h">① 警戒モード別 アクション詳細設定</h4>
        <p class="ts-hint" id="ts-mode-actions-hint">${
          mode === "away"
            ? "おでかけ警戒：全センサー有効時の動作です"
            : mode === "home"
              ? "在宅見守り：外周センサー有効時の動作です"
              : "警戒解除中は詳細動作を一時停止します"
        }</p>
        ${renderSecondsSliderField({
          id: "ts-lighting-duration",
          labelId: "ts-lighting-label",
          label: `💡 ${lightLabel}`,
          value: lightSec,
          min: 5,
          max: 180,
          step: 1,
          minCaption: "短め",
          maxCaption: "長め",
        })}
        ${patliteBlock}
      </section>

      ${renderTwoStepRemoteBlock(dash)}

      <section class="ts-daily-block">
        <h4 class="ts-daily-h">② 昼夜のスマート点灯制御</h4>
        <p class="ts-hint">夜間のライト自動点灯時間帯（日跨ぎ可）</p>
        ${renderDayNightRuleCard(dash)}
        <div class="ts-schedule-inline">
          <label class="ts-schedule-field" for="ts-daily-schedule-start">
            <span>開始時刻</span>
            <input type="time" id="ts-daily-schedule-start" value="${start}" />
          </label>
          <label class="ts-schedule-field" for="ts-daily-schedule-end">
            <span>終了時刻</span>
            <input type="time" id="ts-daily-schedule-end" value="${end}" />
          </label>
        </div>
      </section>

      <section class="ts-daily-block">
        <h4 class="ts-daily-h">③ エリア別 通知条件設定</h4>
        <p class="ts-hint">センサーごとに通知の受け取りを切り替え</p>
        <p class="ts-dn-inline">
          <span class="ts-dn-chip ts-dn-chip-day">☀️ 日中 通知のみ</span>
          <span class="ts-dn-chip ts-dn-chip-night">🌙 夜間 点灯＋通知</span>
        </p>
        <div id="ts-customer-notify">${notifyRows}</div>
      </section>

      <section class="ts-daily-block">
        <h4 class="ts-daily-h">④ 外構ライト手動操作</h4>
        <p class="ts-hint">手動操作は昼夜を無視して即時点灯します</p>
        <!-- 一括ON/OFFはキック行の1組だけにする
             外側に重ねるとボタンが二重になる -->
        ${renderManualLightKickRow()}
        <div class="ts-btn-row">
          <button type="button" class="ts-btn ts-btn-primary" data-ts-action="manual_lights_3min">
            💡 照明を点灯（3分間）
          </button>
          <button type="button" class="ts-btn ts-btn-ghost" data-ts-action="manual_lights_off">
            消灯
          </button>
        </div>
      </section>

      <p class="ts-hint">変更は自動保存され、実機へ即時反映されます</p>
    </div>
  </section>`;
}

/** 顧客向け · 映像は出さず Guard Viewer 起動だけ */
function renderCustomerCameraCard() {
  return `<section class="ts-card ts-camera-card ts-camera-cta-only">
    <h3 class="ts-card-head">📷 カメラ</h3>
    <p class="ts-hint">ライブ映像は専用アプリで確認します</p>
    <a
      class="ts-btn ts-btn-primary ts-btn-camera-cta"
      id="ts-customer-camera"
      href="${GUARD_VIEWER_SCHEME_V1}"
      data-gv-launch="1"
    >
      カメラを見る
      <span class="gv-cta-hint">${GUARD_VIEWER_HINT_V1}</span>
    </a>
    ${renderGuardViewerStoreHelpHtmlV1()}
  </section>`;
}

function loadNotifyReadIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(NOTIFY_READ_KEY) || "[]");
    return new Set(Array.isArray(raw) ? raw.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveNotifyReadIds(ids) {
  localStorage.setItem(NOTIFY_READ_KEY, JSON.stringify([...ids]));
}

function classifyNotifyTone(kind, severity) {
  const k = String(kind || "");
  const sev = String(severity || "");
  if (
    k === "alert" ||
    k === "comm_stop" ||
    k === "comm_loss" ||
    k === "main_beam" ||
    k === "detached_road" ||
    k === "detached_path" ||
    sev === "danger"
  ) {
    return "alert";
  }
  if (
    k === "inspection" ||
    k === "comm_recovered" ||
    k === "board_overheat" ||
    k === "shelly_auto_reboot" ||
    sev === "warning"
  ) {
    return "equip";
  }
  return "info";
}

function notifyBadgeMeta(tone) {
  if (tone === "alert") {
    return { cls: "is-alert", label: "重要アラート" };
  }
  if (tone === "equip") {
    return { cls: "is-equip", label: "設備状態" };
  }
  return { cls: "is-info", label: "お知らせ" };
}

function buildCustomerNotifyItems(dash) {
  const items = [];
  for (const n of portalNotifications || []) {
    items.push({
      id: String(n.id || ""),
      at: n.createdAt,
      title: n.title || "お知らせ",
      body: n.body || "",
      tone: classifyNotifyTone(n.kind, n.severity),
    });
  }
  for (const ev of dash?.timeline || []) {
    if (
      ev.kind === "patlite_test" ||
      ev.kind === "mode_change" ||
      ev.kind === "manual"
    ) {
      continue;
    }
    items.push({
      id: `tl-${ev.id}`,
      at: ev.at,
      title: ev.title || "できごと",
      body: ev.detail || "",
      tone: classifyNotifyTone(ev.kind, ""),
    });
  }
  items.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  return items.slice(0, 40);
}

function renderCustomerNotifyCards(dash) {
  const items = buildCustomerNotifyItems(dash);
  const readIds = loadNotifyReadIds();
  if (!items.length) {
    return '<p class="ts-empty">まだお知らせはありません</p>';
  }
  return items
    .map((n) => {
      const badge = notifyBadgeMeta(n.tone);
      const unread = n.id && !readIds.has(n.id);
      return `<article class="ts-notify-item ${unread ? "is-unread" : ""}" data-notify-id="${escapeHtml(
        n.id
      )}">
        <span class="ts-notify-badge ${badge.cls}">${badge.label}</span>
        <div class="ts-notify-copy">
          <p class="ts-notify-title">${escapeHtml(n.title)}</p>
          ${n.body ? `<p class="ts-notify-body">${escapeHtml(n.body)}</p>` : ""}
        </div>
        <time class="ts-notify-time">${formatTime(n.at)}</time>
      </article>`;
    })
    .join("");
}

function renderCustomerNotifySection(dash) {
  return `<section class="ts-card ts-customer-notify-card" id="ts-customer-notify-card">
    <div class="ts-assure-head-row">
      <h3 class="ts-card-head">🔔 豊島邸からのお知らせ</h3>
    </div>
    <div class="ts-btn-row ts-notify-toolbar">
      <button type="button" class="ts-btn ts-btn-primary" data-ts-action="refresh_notify">
        通知を最新に更新
      </button>
      <button type="button" class="ts-btn" data-ts-action="test_notify">
        🔔 通知テスト
      </button>
      <button type="button" class="ts-btn ts-btn-ghost" data-ts-action="mark_notify_read">
        未読を既読にする
      </button>
    </div>
    <div id="ts-customer-notify-list">${renderCustomerNotifyCards(dash)}</div>
  </section>`;
}

function paintCustomerNotifyList() {
  const list = $("ts-customer-notify-list");
  if (!list) return;
  list.innerHTML = renderCustomerNotifyCards(lastRenderedDash);
}

async function loadCustomerPortalNotifications() {
  try {
    const res = await fetch(
      "/api/customer/v1/notifications/TOYOSHIMA001",
      { cache: "no-store" }
    );
    const data = await res.json().catch(() => ({}));
    if (Array.isArray(data?.notifications)) {
      portalNotifications = data.notifications;
    }
  } catch {
    /* 既存タイムラインだけで表示を継続 */
  }
}

function markVisibleNotificationsRead() {
  const ids = loadNotifyReadIds();
  for (const n of buildCustomerNotifyItems(lastRenderedDash)) {
    if (n.id) ids.add(n.id);
  }
  saveNotifyReadIds(ids);
  paintCustomerNotifyList();
}

function classifyHistoryEvent(ev) {
  if (ev.kind === "detached_road") {
    return {
      icon: "🅿️",
      where: "駐車場（DI1）",
      what: ev.title || "センサー発報",
      cat: "sensor",
    };
  }
  if (ev.kind === "detached_path") {
    return {
      icon: "🚪",
      where: "ガレージ（DI2）",
      what: ev.title || "センサー発報",
      cat: "sensor",
    };
  }
  if (ev.kind === "main_beam") {
    return {
      icon: "📡",
      where: "母屋外周",
      what: ev.title || "ビーム検知",
      cat: "sensor",
    };
  }
  if (ev.kind === "mode_change") {
    return {
      icon: "🛡️",
      where: "警戒モード",
      what: ev.title || "モード変更",
      cat: "mode",
    };
  }
  const text = `${ev.title || ""} ${ev.detail || ""}`;
  if (ev.kind === "manual" && /ライト|照明|外構|DO2|DO1/.test(text)) {
    const where = /駐車場/.test(text)
      ? "駐車場連動ライト"
      : /ガレージ/.test(text)
        ? "ガレージ連動ライト"
        : "外側防犯ライト（DO2）";
    return {
      icon: "💡",
      where,
      what: ev.title || "ライト点灯",
      cat: "light",
    };
  }
  if (ev.kind === "comm_loss" || ev.kind === "comm_recovered") {
    return {
      icon: ev.kind === "comm_loss" ? "🔴" : "🟢",
      where: "通信",
      what: ev.title || "通信状態",
      cat: "comm",
    };
  }
  return {
    icon: "📋",
    where: ev.building === "detached" ? "はなれ" : "母屋",
    what: ev.title || "できごと",
    cat: "other",
  };
}

function renderCustomerHistoryTimeline(timeline, limit = 40) {
  const rows = (timeline || []).slice(0, limit);
  if (!rows.length) {
    return '<p class="ts-empty">まだできごとはありません</p>';
  }
  return rows
    .map((ev) => {
      const meta = classifyHistoryEvent(ev);
      return `<article class="ts-hist-card is-${meta.cat}">
        <span class="ts-hist-ico" aria-hidden="true">${meta.icon}</span>
        <div class="ts-hist-body">
          <p class="ts-hist-where">${escapeHtml(meta.where)}</p>
          <p class="ts-hist-what">${escapeHtml(meta.what)}</p>
          ${
            ev.detail
              ? `<p class="ts-hist-sub">${escapeHtml(ev.detail)}</p>`
              : ""
          }
        </div>
        <time class="ts-hist-time">${formatTime(ev.at)}</time>
      </article>`;
    })
    .join("");
}

/** 顧客向け · いつ・どこで・何が動いたか */
function renderCustomerActivitySection(dash) {
  return `<section class="ts-card ts-activity-card">
    <h3 class="ts-card-head">📜 動作履歴</h3>
    <p class="ts-hint">駐車場DI1・ガレージDI2・外側ライト・警戒モード</p>
    <div class="ts-activity-log ts-hist-list" id="ts-activity-log">${renderCustomerHistoryTimeline(
      dash.timeline,
      40
    )}</div>
    <button type="button" class="ts-btn ts-btn-ghost ts-btn-wide" data-ts-action="open_log">
      詳細を見る（もっと見る）
    </button>
  </section>`;
}

/** 警戒 ON / OFF の2択 */
function renderCustomerModeCards(dash) {
  const current = dash.customerMode === "disarmed" ? "disarmed" : "away";
  const modes = [
    { id: "away", emoji: "🛡️", label: "警戒 ON" },
    { id: "disarmed", emoji: "⏸️", label: "警戒 OFF" },
  ];
  return `<section class="ts-card ts-mode-card" id="ts-mode-card" aria-label="警戒モード">
    <h3 class="ts-card-head">🛡️ 警戒モード</h3>
    <div class="ts-mode-segment ts-mode-segment-2" role="radiogroup" aria-label="警戒モード切替">
      ${modes
        .map(
          (m) => `<button type="button" class="ts-mode-seg ${
            m.id === "away" ? "ts-mode-seg-on" : "ts-mode-seg-off"
          } ${current === m.id ? "is-on" : ""}" data-ts-customer-mode="${
            m.id
          }" role="radio" aria-checked="${current === m.id ? "true" : "false"}">
        <span class="ts-mode-seg-emoji" aria-hidden="true">${m.emoji}</span>
        <span class="ts-mode-seg-label">${m.label}</span>
      </button>`
        )
        .join("")}
    </div>
  </section>`;
}

function latestSnapshots(timeline, limit = 6) {
  return (timeline || [])
    .filter((ev) => ev.snapshot?.imageUrl || ev.snapshot?.thumbUrl)
    .slice(0, limit);
}

function renderSnapshotThumb(ev) {
  const snap = ev.snapshot;
  if (!snap?.imageUrl && !snap?.thumbUrl) return "";
  const src = snap.thumbUrl || snap.imageUrl;
  return `<button type="button" class="ts-snap-thumb" data-ts-snap-url="${escapeHtml(
    snap.imageUrl || src
  )}" data-ts-snap-title="${escapeHtml(ev.title || snap.cameraLabel || "スナップショット")}" data-ts-snap-time="${escapeHtml(
    formatTime(snap.at || ev.at)
  )}">
    <img src="${escapeHtml(src)}" alt="${escapeHtml(snap.cameraLabel || "警報写真")}" loading="lazy" />
    <span class="ts-snap-meta">${escapeHtml(formatTime(snap.at || ev.at))} · ${escapeHtml(
    snap.areaLabel || snap.cameraLabel || ""
  )}</span>
  </button>`;
}

function renderAlarmCard(dash, opts = {}) {
  const customer = !!opts.customer;
  const alarm = dash.alarm || { active: false, message: "発報はありません" };
  const view = buildCommHealthView(dash);
  const snaps = latestSnapshots(dash.timeline, 3);
  const commAlert = view.offline
    ? `<p class="ts-alarm-status is-alert" id="ts-comm-alert">
        ⚠️ 通信障害：主装置との通信が途絶えています
      </p>`
    : "";
  return `<section class="ts-card ts-alarm-card ${alarm.active || view.offline ? "is-live" : ""}" id="ts-alarm-card">
    <h3 class="ts-card-head">🚨 ${customer ? "いまのお知らせ" : "アラーム発報"}</h3>
    <p class="ts-alarm-status ${alarm.active ? "is-alert" : ""}" id="ts-alarm-status">${escapeHtml(alarm.message)}</p>
    ${commAlert}
    ${
      !customer && snaps.length
        ? `<div class="ts-snap-row" id="ts-alarm-snaps">${snaps
            .map(renderSnapshotThumb)
            .join("")}</div>`
        : ""
    }
    ${
      customer
        ? `<div class="ts-btn-row">
      <button type="button" class="ts-btn" data-ts-action="test_notify">🔔 通知テスト</button>
    </div>`
        : `<button type="button" class="ts-btn ts-btn-ghost" data-ts-action="alarm_clear" ${alarm.active ? "" : "disabled"}>
      アラーム対応完了
    </button>`
    }
  </section>`;
}

function renderHealthGrid(dash) {
  const view = buildCommHealthView(dash);
  const watchOn = dash.heartbeatWatchEnabled !== false;
  return `<section class="ts-card ts-health-card" id="ts-health-card" data-ssot="toyoshima-commHealth">
    <div class="ts-assure-head-row">
      <h3 class="ts-card-head">📡 通信ステータス</h3>
      <button type="button" class="ts-refresh-btn" data-ts-action="refresh_status" aria-label="最新状態に更新">
        <span class="ts-refresh-ico" aria-hidden="true">🔄</span>
        <span class="ts-refresh-label">最新状態に更新</span>
      </button>
    </div>
    <div class="ts-health-grid">
      <div class="ts-health-cell">
        <span class="ts-health-key">稼働ステータス</span>
        <span class="ts-health-val ${view.isHardwareOnline ? "" : "is-offline"}" id="ts-online-val">${escapeHtml(view.operatorOnline)}</span>
      </div>
      <div class="ts-health-cell">
        <span class="ts-health-key">最新ハートビート</span>
        <span class="ts-health-val" id="ts-heartbeat-val">${escapeHtml(view.heartbeatLabel)}</span>
      </div>
      <div class="ts-health-cell">
        <span class="ts-health-key">ネットワーク遅延</span>
        <span class="ts-health-val" id="ts-latency-val">${escapeHtml(view.latencyLabel)}</span>
      </div>
      <div class="ts-health-cell">
        <span class="ts-health-key">盤内温度（主装置・チップ実測）</span>
        <span class="ts-health-val ts-board-temp is-${view.tempLevel}" id="ts-board-temp-val">${view.tempEmoji} ${escapeHtml(view.tempLabel)}</span>
      </div>
    </div>
    <label class="ts-switch-row ts-hb-watch-row" for="ts-hb-watch">
      <span class="ts-label">ハートビート死活監視</span>
      <span class="ts-switch">
        <input type="checkbox" id="ts-hb-watch" ${watchOn ? "checked" : ""} />
        <span class="ts-switch-ui" aria-hidden="true"></span>
        <span class="ts-switch-text" id="ts-hb-watch-label">${
          watchOn ? "監視中（有効）" : "一時停止（無効）"
        }</span>
      </span>
    </label>
    <div class="ts-btn-row ts-hb-sim-row">
      <button type="button" class="ts-btn" data-ts-action="sim_heartbeat">
        💓 擬似ハートビート送信
      </button>
    </div>
    <p class="ts-hint">擬似送信後、顧客画面の稼働ステータスも即時同期されます</p>
  </section>`;
}

function renderKittingCard(dash) {
  const kit = dash.ota?.kitting || {};
  const shippable = !!kit.shippable;
  const rgb = kit.rgbStatus || "UNCONFIGURED";
  const tone =
    shippable || rgb === "SHIPPABLE"
      ? "green"
      : rgb === "CONFIGURED"
        ? "blue"
        : rgb === "FAULT" || rgb === "UNCONFIGURED"
          ? "red"
          : "wait";
  const emoji =
    tone === "green" ? "🟢" : tone === "blue" ? "🔵" : tone === "red" ? "🔴" : "⚪";
  const label = kit.label
    ? `${emoji} ${kit.label}`
    : `${emoji} 検査待ち`;
  return `<section class="ts-card ts-kitting-card" id="ts-kitting-card">
    <h3 class="ts-card-head">🟢 出荷前キッティング・ステータス連携</h3>
    <p class="ts-health-val" id="ts-kitting-label">${escapeHtml(label)}</p>
    <p class="ts-hint" id="ts-kitting-sub">shippable: ${shippable ? "true" : "false"}</p>
  </section>`;
}

function renderOtaCard(dash) {
  const ota = dash.ota || {};
  const running = ota.runningVersion || "1.0.0";
  const server = ota.serverVersion || "1.0.0";
  const pending = !!ota.pending || !!ota.has_ota_update;
  const note = pending
    ? "次回ハートビート時に実機が自動更新されます"
    : running === server
      ? "現場は最新バージョンで稼働中"
      : "配信予約なし";
  return `<section class="ts-card ts-ota-card" id="ts-ota-card">
    <h3 class="ts-card-head">🚀 TiSLY OTAファームウェア一元管理</h3>
    <div class="ts-health-grid">
      <div class="ts-health-cell">
        <span class="ts-health-key">現在稼働中バージョン</span>
        <span class="ts-health-val" id="ts-ota-running">v${escapeHtml(running)}</span>
      </div>
      <div class="ts-health-cell">
        <span class="ts-health-key">サーバー最新バージョン</span>
        <span class="ts-health-val" id="ts-ota-server">v${escapeHtml(server)}</span>
      </div>
    </div>
    <p class="ts-hint" id="ts-ota-note">${escapeHtml(note)}</p>
    <button type="button" class="ts-sync-btn" data-ts-action="ota_deploy">
      🚀 最新ファームウェアを現場実機へ遠隔配信
    </button>
  </section>`;
}

/** 全現場標準 · DI 導通チェック＋擬似発報（社内のみ） */
function collectDiChannels(dash) {
  const rows = [];
  for (const d of dash?.main?.di || []) {
    const rest = String(d.label || "").replace(/DI\d\s*/i, "").trim();
    rows.push({
      id: `main-di${d.ch}`,
      label: rest ? `主装置 DI${d.ch} ${rest}` : `主装置 DI${d.ch}`,
      building: "main",
      state: d.state,
    });
  }
  for (const d of dash?.detached?.di || []) {
    const rest = String(d.label || "")
      .replace(/\(DI\d\)/i, "")
      .replace(/DI\d\s*/i, "")
      .trim();
    rows.push({
      id: `det-di${d.ch}`,
      label: rest ? `子機 DI${d.ch} ${rest}` : `子機 DI${d.ch}`,
      building: "detached",
      state: d.state,
    });
  }
  return rows;
}

function renderDiRow(channel) {
  const detecting = channel.state === "detecting";
  return `<div class="ts-di-row ${detecting ? "is-on" : ""}" data-ts-di-row="${escapeHtml(
    channel.id
  )}">
    <div class="ts-di-state">
      <span class="ts-di-emoji" aria-hidden="true">${detecting ? "🔴" : "⚪"}</span>
      <div>
        <strong class="ts-di-label">${escapeHtml(channel.label)}</strong>
        <span class="ts-di-sub">${detecting ? "ON 検知中" : "OFF（導通なし）"}</span>
      </div>
    </div>
    <button type="button" class="ts-btn ts-di-trigger" data-ts-di-trigger="${escapeHtml(
      channel.id
    )}" data-ts-di-building="${escapeHtml(channel.building || "")}">
      ⚡ 擬似発報
    </button>
  </div>`;
}

function renderDiMaintenanceCard(dash) {
  const channels = collectDiChannels(dash);
  return `<section class="ts-card ts-di-card" id="ts-di-card">
    <h3 class="ts-card-head">🔌 DI現場保守（導通チェック＆擬似発報）</h3>
    <p class="ts-hint">DI1 / DI2 などの入力状態をリアルタイム表示し、擬似発報でライト・通知・ログを1人で検証できます。</p>
    <div class="ts-di-list" id="ts-di-list">${
      channels.length
        ? channels.map(renderDiRow).join("")
        : '<p class="ts-empty">DI端子情報がありません</p>'
    }</div>
  </section>`;
}

/** 全現場標準 · DO 1秒ワンショット（豊島邸 母屋DO1〜DO3 / はなれ） */
const TOYOSHIMA_FORCE_TEST_OUTPUTS = [
  { id: "main-do1", label: "母屋 DO1 防犯ライト1", building: "main" },
  { id: "main-do2", label: "母屋 DO2 防犯ライト2", building: "main" },
  { id: "main-do3", label: "母屋 DO3 100Vフラッシュ", building: "main" },
  { id: "det-do1", label: "はなれ DO1 防犯ライト", building: "detached" },
  { id: "det-do2", label: "はなれ DO2 パトライト", building: "detached" },
  { id: "det-do3", label: "はなれ DO3 予備ライト", building: "detached" },
];

function renderDoForceTestCard() {
  return `<section class="ts-card ts-do-card" id="ts-do-card">
    <h3 class="ts-card-head">⚡ 接点強制テスト（1秒ワンショット）</h3>
    <p class="ts-hint">盤・照明から離れた位置でも配線導通を安全に確認できます。押して約1秒だけONします。</p>
    <div class="ts-do-grid" id="ts-do-grid">${TOYOSHIMA_FORCE_TEST_OUTPUTS.map(
      (o) => `<button type="button" class="ts-do-pulse-btn" data-ts-do-pulse="${escapeHtml(
        o.id
      )}" data-ts-do-building="${escapeHtml(o.building)}">
        <span class="ts-do-pulse-label">${escapeHtml(o.label)}</span>
        <span class="ts-do-pulse-sub">1秒テストON</span>
      </button>`
    ).join("")}</div>
  </section>`;
}

function renderSettingsCard(dash) {
  const lightSec = dash.lightingDurationSec ?? 45;
  const periSec = dash.perimeterTimeoutSec ?? 120;
  return `<section class="ts-card ts-settings-card" id="ts-settings-card">
    <h3 class="ts-card-head">⚙️ 詳細設定</h3>
    ${renderTwoStepRemoteBlock(dash)}
    ${renderSecondsSliderField({
      id: "ts-lighting-duration",
      label: "💡 DOライト点灯維持時間",
      value: lightSec,
      min: 5,
      max: 180,
      step: 1,
      minCaption: "短め",
      maxCaption: "長め",
    })}
    ${renderSecondsSliderField({
      id: "ts-perimeter-timeout",
      label: "🚶 段階接近判定 制限時間",
      value: periSec,
      min: 30,
      max: 300,
      step: 5,
      minCaption: "短め",
      maxCaption: "長め",
    })}
    ${renderMsSliderField({
      id: "ts-debounce-di1",
      label: "外周ビーム 感応度",
      value: dash.debounceDi1Ms ?? dash.diConfirmMs ?? 100,
    })}
    ${renderMsSliderField({
      id: "ts-debounce-di2",
      label: "建物至近ビーム 感応度",
      value: dash.debounceDi2Ms ?? dash.diConfirmMs ?? 100,
    })}
    ${renderMsSliderField({
      id: "ts-debounce-beam",
      label: "はなれセンサー 感応度",
      value: dash.debounceBeamMs ?? dash.diConfirmMs ?? 100,
    })}
    <p class="ts-hint">スライダー変更は自動保存され、実機へ即時反映されます</p>
  </section>`;
}

function renderNotifySensorRow(sensor) {
  const buttons = NOTIFY_MODES.map(
    (mode) =>
      `<button type="button" class="ts-notify-btn ${sensor.mode === mode ? "is-on" : ""}"
        data-ts-notify-sensor="${escapeHtml(sensor.id)}" data-ts-notify-mode="${mode}">
        ${NOTIFY_LABELS[mode]}
      </button>`
  ).join("");
  return `<div class="ts-notify-row">
    <span class="ts-label">${escapeHtml(sensor.label)}</span>
    <div class="ts-notify-btns">${buttons}</div>
  </div>`;
}

function renderNotifyCard(dash) {
  const sensors = dash.notifySensors || [];
  return `<section class="ts-card ts-notify-card">
    <h3 class="ts-card-head">🔔 Web Push 通知条件</h3>
    <p class="ts-hint">検知時の通知モードをワンタップで切り替え</p>
    <div id="ts-notify-sensors">${sensors.map(renderNotifySensorRow).join("")}</div>
  </section>`;
}

function renderOpsCard() {
  return `<section class="ts-card ts-ops-card">
    <h3 class="ts-card-head">💡 照明一括操作</h3>
    <p class="ts-hint">手動操作は昼夜スケジュールを無視して即時点灯します</p>
    <!-- 一括ON/OFFはキック行の1組だけにする
         外側の複製行は描画しない -->
    ${renderManualLightKickRow()}
    <h3 class="ts-card-head ts-section-gap">🔔 プッシュ通知管理</h3>
    <button type="button" class="ts-btn ts-btn-wide" id="ts-push-reregister">🔔 Push通知を再登録・購読</button>
    <p class="ts-push-diag" id="ts-push-diag" role="status">permission: —</p>
    <div class="ts-btn-row">
      <button type="button" class="ts-btn" data-ts-action="test_notify">🔔 通知テスト</button>
      <button type="button" class="ts-btn ts-btn-ghost" data-ts-action="export_report">📄 レポート出力</button>
    </div>
  </section>`;
}

/** 社内 · Guard Viewer / EZCloud 共有リンク設定 */
function renderCloudStreamCard() {
  return `<section class="ts-card ts-cloud-stream-card" id="ts-cloud-stream-card">
    <h3 class="ts-card-head">📷 Guard Viewer / EZCloud ライブ共有</h3>
    <p class="ts-hint">方法A: クラウド共有プレビュー URL を貼り付けて保存（ポート開放不要）</p>
    <label class="ts-field" for="ts-cloud-stream-url">
      <span class="ts-label">cloudStreamUrl（共有プレビュー URL）</span>
      <input type="url" id="ts-cloud-stream-url" class="ts-input" placeholder="https://…（EZCloud / Guard Viewer 共有リンク）" autocomplete="off" />
    </label>
    <label class="ts-field" for="ts-nvr-app-url">
      <span class="ts-label">アプリ起動 URL（任意）</span>
      <input type="url" id="ts-nvr-app-url" class="ts-input" placeholder="ストア / ディープリンク" autocomplete="off" />
    </label>
    <div class="ts-btn-row">
      <button type="button" class="ts-btn ts-btn-primary" data-ts-action="save_cloud_stream">
        共有リンクを保存
      </button>
      <button type="button" class="ts-btn ts-btn-ghost" data-ts-action="reload_cloud_stream">
        再読込
      </button>
    </div>
    <p class="ts-hint" id="ts-cloud-stream-status">未読込</p>
  </section>`;
}

function renderActivityLog(timeline, limit = 10) {
  const rows = (timeline || []).slice(0, limit);
  if (!rows.length) {
    return '<p class="ts-empty">まだできごとはありません</p>';
  }
  return rows
    .map((ev) => {
      const ico =
        ev.kind === "comm_loss"
          ? "🔴"
          :         ev.kind === "comm_recovered"
            ? "🟢"
            : ev.kind === "board_overheat"
              ? "🌡️"
            : ev.kind === "main_beam"
          ? "🏠"
          : ev.kind === "detached_road" || ev.kind === "detached_path"
            ? "🚨"
            : ev.kind === "patlite_test"
              ? "🔔"
              : "💡";
      const alertClass =
        ev.kind === "comm_loss" ? " is-comm-alert" : "";
      const snapHtml = ev.snapshot?.imageUrl
        ? `<button type="button" class="ts-snap-mini" data-ts-snap-url="${escapeHtml(
            ev.snapshot.imageUrl
          )}" data-ts-snap-title="${escapeHtml(ev.title || "")}" data-ts-snap-time="${escapeHtml(
            formatTime(ev.snapshot.at || ev.at)
          )}">
            <img src="${escapeHtml(ev.snapshot.thumbUrl || ev.snapshot.imageUrl)}" alt="スナップショット" loading="lazy" />
          </button>`
        : "";
      return `<article class="ts-log-row${alertClass}">
        <span class="ts-log-ico">${ico}</span>
        <div class="ts-log-body">
          <p class="ts-log-title">${escapeHtml(ev.title)}</p>
          <p class="ts-log-sub">${escapeHtml(ev.detail || "")}</p>
          ${snapHtml}
        </div>
        <time class="ts-log-time">${formatTime(ev.at)}</time>
      </article>`;
    })
    .join("");
}

function renderMonthlyReportCard(report) {
  const r = report || {
    yearMonthLabel: "今月",
    detectionLabel: "—",
    lightOnLabel: "—",
    uptimeLabel: "—",
  };
  return `<section class="ts-card ts-monthly-card" id="ts-monthly-card">
    <h3 class="ts-card-head">📊 ${escapeHtml(r.yearMonthLabel)}の安心レポート</h3>
    <div class="ts-monthly-grid">
      <div class="ts-monthly-cell">
        <span class="ts-monthly-key">侵入・センサー検知</span>
        <strong class="ts-monthly-val" id="ts-monthly-detect">${escapeHtml(r.detectionLabel)}</strong>
      </div>
      <div class="ts-monthly-cell">
        <span class="ts-monthly-key">夜間ライト自動点灯</span>
        <strong class="ts-monthly-val" id="ts-monthly-light">${escapeHtml(r.lightOnLabel)}</strong>
      </div>
      <div class="ts-monthly-cell ts-monthly-cell-wide">
        <span class="ts-monthly-key">主装置・子機 正常稼働率</span>
        <strong class="ts-monthly-val" id="ts-monthly-uptime">${escapeHtml(r.uptimeLabel)}</strong>
      </div>
    </div>
    <button type="button" class="ts-btn ts-btn-wide" data-ts-action="monthly_pdf">
      📄 月次報告書を出力（PDF）
    </button>
  </section>`;
}

function renderActivitySection(dash) {
  return `<section class="ts-card ts-activity-card">
    <h3 class="ts-card-head">📜 動作ログ（直近10件）</h3>
    <div class="ts-activity-log" id="ts-activity-log">${renderActivityLog(dash.timeline, 10)}</div>
    <div class="ts-snap-row ts-snap-row-log" id="ts-log-snaps">${latestSnapshots(dash.timeline, 6)
      .map(renderSnapshotThumb)
      .join("")}</div>
    <button type="button" class="ts-btn ts-btn-ghost ts-btn-wide" data-ts-action="open_log">
      詳細を見る（もっと見る）
    </button>
  </section>
  <div id="ts-monthly-root">${renderMonthlyReportCard(dash._monthlyReport)}</div>`;
}

function diBadge(di) {
  const detecting = di.state === "detecting";
  return `<span class="ts-badge ${detecting ? "is-alert" : "is-ok"}">${
    detecting ? "検知中" : "正常"
  }</span>`;
}

function doStatus(doRow) {
  if (doRow.blinking) {
    return `<span class="ts-badge is-blink">点滅中</span>`;
  }
  return `<span class="ts-badge ${doRow.on ? "is-on" : "is-off"}">${
    doRow.on ? "ON" : "OFF"
  }</span>`;
}

function dashSignature(dash) {
  if (!dash) return "";
  return JSON.stringify({
    guard: dash.guardModeLabel,
    lights: dash.lightsScheduleLabel,
    mode: dash.guardMode,
    cmode: dash.customerMode,
    lightSec: dash.lightingDurationSec,
    patlite: dash.patliteThreatEnabled,
    secMode: dash.securityMode,
    flashOn: dash.flashEnabled,
    flashSec: dash.flashDurationSec,
    forceRelay: dash.forceRelayTest,
    hbWatch: dash.heartbeatWatchEnabled,
    monthDet: dash.monthlyDetectionCount,
    // 通信ヘルス SSOT を soft patch 判定に含める
    online: dash.commHealth?.onlineSummary,
    hwOnline:
      dash.commHealth?.isHardwareOnline ?? dash.commHealth?.uiOnline,
    hbAt: dash.commHealth?.lastHeartbeatAt,
    boardTemp: dash.commHealth?.boardTempC,
    boardLabel: dash.commHealth?.boardTempLabel,
    sched: `${dash.scheduleStart}-${dash.scheduleEnd}`,
    alarm: dash.alarm?.active,
    alarmMsg: dash.alarm?.message,
    notify: (dash.notifySensors || []).map((s) => `${s.id}:${s.mode}`).join(","),
    comm: dash.commHealth?.lastCommAt,
    otaRun: dash.ota?.runningVersion,
    otaSrv: dash.ota?.serverVersion,
    otaPend: dash.ota?.pending,
    otaUp: dash.ota?.has_ota_update,
    kitShip: dash.ota?.kitting?.shippable,
    kitRgb: dash.ota?.kitting?.rgbStatus,
    mainDi: (dash.main?.di || []).map((d) => d.state).join(","),
    mainDo: (dash.main?.do || [])
      .map((d) => `${d.on}:${d.blinking ? 1 : 0}`)
      .join(","),
    detDi: (dash.detached?.di || []).map((d) => d.state).join(","),
    detDo: (dash.detached?.do || [])
      .map((d) => `${d.on}:${d.blinking ? 1 : 0}`)
      .join(","),
    tlHead: (dash.timeline || [])
      .slice(0, 5)
      .map((t) => `${t.at}:${t.kind}`)
      .join("|"),
  });
}

function renderBuildingCard(building) {
  const isMain = building.id === "main";
  const diHtml = building.di
    .map(
      (d) =>
        `<div class="ts-row">
          <span class="ts-label">${escapeHtml(d.label)}</span>
          ${diBadge(d)}
        </div>`
    )
    .join("");

  let doHtml = "";
  if (isMain) {
    const d1 = building.do.find((d) => d.ch === 1);
    const d2 = building.do.find((d) => d.ch === 2);
    const d3 = building.do.find((d) => d.ch === 3);
    doHtml = `
      <div class="ts-do-group">
        <p class="ts-sub">100V 防犯ライト</p>
        <div class="ts-toggle-row">
          <label class="ts-toggle">
            <input type="checkbox" data-ts-building="main" data-ts-action="do1_on" data-ts-off="do1_off" ${d1?.on ? "checked" : ""} />
            <span>ライト1点灯（出力1）</span>
          </label>
          <label class="ts-toggle">
            <input type="checkbox" data-ts-building="main" data-ts-action="do2_on" data-ts-off="do2_off" ${d2?.on ? "checked" : ""} />
            <span>ライト2点灯（出力2）</span>
          </label>
        </div>
        <p class="ts-sub">100V フラッシュライト（出力3）</p>
        <div class="ts-row">
          ${doStatus(d3 || { on: false })}
          <button type="button" class="ts-btn" data-ts-light-kick="patlite_test"
            data-ts-building="main" data-ts-action="patlite_test">フラッシュ威嚇テスト</button>
        </div>
      </div>`;
  } else {
    const d1 = building.do.find((d) => d.ch === 1);
    const d2 = building.do.find((d) => d.ch === 2);
    doHtml = `
      <div class="ts-do-group">
        <p class="ts-sub">連動ステータス</p>
        <div class="ts-row">
          <span class="ts-label">100V ライト（出力1）</span>
          ${doStatus(d1 || { on: false })}
        </div>
        <div class="ts-row">
          <span class="ts-label">パトライト（出力2）</span>
          ${doStatus(d2 || { on: false, blinking: d2?.blinking })}
        </div>
      </div>`;
  }

  return `<article class="ts-card" data-ts-building-card="${building.id}">
    <header class="ts-card-head">
      <h3>${escapeHtml(building.label)}</h3>
    </header>
    <p class="ts-controller">${escapeHtml(building.controllerLabel)}</p>
    ${
      isMain
        ? `<div class="ts-row ts-beam-status">
            <span class="ts-label">遠近ビームセンサー</span>
            ${building.di.some((d) => d.state === "detecting") ? diBadge({ state: "detecting" }) : diBadge({ state: "normal" })}
          </div>`
        : diHtml
    }
    ${doHtml}
  </article>`;
}

function renderTimelineFull(timeline) {
  return renderActivityLog(timeline, 100);
}

function renderScheduleDialog() {
  if ($("ts-schedule-dialog")) return;
  const dialog = document.createElement("dialog");
  dialog.id = "ts-schedule-dialog";
  dialog.className = "ts-schedule-dialog";
  dialog.innerHTML = `
    <form method="dialog" class="ts-schedule-form">
      <h3 class="ts-schedule-title" id="ts-schedule-title">時間の設定</h3>
      <p class="ts-schedule-hint" id="ts-schedule-hint">開始・終了時刻を選んで保存してください。</p>
      <label class="ts-schedule-field" for="ts-schedule-start">
        <span>開始時刻</span>
        <input type="time" id="ts-schedule-start" required />
      </label>
      <label class="ts-schedule-field" for="ts-schedule-end">
        <span>終了時刻</span>
        <input type="time" id="ts-schedule-end" required />
      </label>
      <div class="ts-schedule-actions">
        <button type="button" class="ts-btn ts-btn-primary" id="ts-schedule-save">保存する</button>
        <button type="submit" class="ts-btn ts-btn-ghost">閉じる</button>
      </div>
    </form>`;
  document.body.appendChild(dialog);
}

function renderLogDialog() {
  if ($("ts-log-dialog")) return;
  const dialog = document.createElement("dialog");
  dialog.id = "ts-log-dialog";
  dialog.className = "ts-log-dialog";
  dialog.innerHTML = `
    <div class="ts-log-dialog-inner">
      <div class="ts-log-dialog-head">
        <h2>📜 詳細ログ・全履歴</h2>
        <form method="dialog"><button type="submit" class="ts-btn ts-btn-ghost">閉じる</button></form>
      </div>
      <div class="ts-timeline" id="ts-log-full"></div>
    </div>`;
  document.body.appendChild(dialog);
}

function openScheduleDialog(kind) {
  renderScheduleDialog();
  const dialog = $("ts-schedule-dialog");
  const title = $("ts-schedule-title");
  const hint = $("ts-schedule-hint");
  const startEl = $("ts-schedule-start");
  const endEl = $("ts-schedule-end");
  if (!dialog || !startEl || !endEl) return;

  startEl.value = normalizeTimeHm(scheduleState.scheduleStart, "18:00");
  endEl.value = normalizeTimeHm(scheduleState.scheduleEnd, "06:00");

  if (kind === "guard") {
    if (title) title.textContent = "警戒時間の設定";
    if (hint) hint.textContent = "警戒の有効時間帯を変更します。";
  } else {
    if (title) title.textContent = "ライト点灯時間の設定";
    if (hint) hint.textContent = "防犯ライトの点灯時間帯を変更します。";
  }

  dialog.showModal?.();
}

async function saveScheduleFromDialog() {
  const scheduleStart = normalizeTimeHm(
    $("ts-schedule-start")?.value,
    scheduleState.scheduleStart
  );
  const scheduleEnd = normalizeTimeHm(
    $("ts-schedule-end")?.value,
    scheduleState.scheduleEnd
  );
  const guardMode =
    scheduleState.guardMode === "off" ? "off" : "scheduled";

  const res = await fetch(`${HOME_API}/security-rules`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      siteId: scheduleState.homeSiteId || TOYOSHIMA_HOME_ID,
      actor: "customer-portal",
      guardMode,
      scheduleStart,
      scheduleEnd,
      securityPausedUntil: null,
    }),
  });
  const data = await res.json();
  if (!data?.ok) throw new Error(data?.error || "保存に失敗しました");

  scheduleState.scheduleStart = scheduleStart;
  scheduleState.scheduleEnd = scheduleEnd;
  await refreshToyoshimaDashboard();
  $("ts-schedule-dialog")?.close?.();
  showToast("時間設定を保存しました");
}

async function postJson(path, body) {
  const res = await fetch(`${HOME_API}${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: getTislySessionHeadersV1({ "Content-Type": "application/json" }),
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!data?.ok) throw new Error(data?.error || "操作に失敗しました");
  return data;
}

/** 社内 · クラウド共有リンクをフォームへ読込 */
async function loadCloudStreamForm() {
  const statusEl = $("ts-cloud-stream-status");
  const urlEl = $("ts-cloud-stream-url");
  const appEl = $("ts-nvr-app-url");
  if (!urlEl) return;
  const res = await fetch(`${HOME_API}/toyoshima/cloud-stream`, {
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!data?.ok) {
    if (statusEl) statusEl.textContent = "読込失敗";
    throw new Error(data?.error || "共有リンクの取得に失敗");
  }
  urlEl.value = data.cloudStreamUrl || data.shareUrl || "";
  if (appEl) appEl.value = data.nvrAppOpenUrl || "";
  if (statusEl) {
    statusEl.textContent = data.embedReady
      ? "埋め込み可能（顧客画面に反映済み）"
      : "未設定（顧客画面では案内を表示）";
  }
}

/** 社内 · クラウド共有リンクを即時保存 */
async function saveCloudStreamForm() {
  const urlEl = $("ts-cloud-stream-url");
  const appEl = $("ts-nvr-app-url");
  const statusEl = $("ts-cloud-stream-status");
  if (!urlEl) return;
  const cloudStreamUrl = String(urlEl.value || "").trim();
  const nvrAppOpenUrl = String(appEl?.value || "").trim();
  const res = await fetch(`${HOME_API}/toyoshima/cloud-stream`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cloudStreamUrl,
      shareUrl: cloudStreamUrl,
      nvrAppOpenUrl,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data?.ok) {
    throw new Error(data?.error || "共有リンクの保存に失敗");
  }
  if (statusEl) {
    statusEl.textContent = data.embedReady
      ? "保存完了 · 埋め込み可能"
      : "保存完了 · 未設定（案内表示）";
  }
}

async function postControl(building, action) {
  await postJson("/toyoshima/control", { building, action });
}

function patchToyoshimaDashboard(dash) {
  syncScheduleState(dash);
  syncSettingsState(dash);
  applyHardwareStatusFromDash(dash);

  if (isCustomerPortal()) {
    const view = buildCommHealthView(dash);
    const assureOnline = $("ts-assure-online");
    const assureLatency = $("ts-assure-latency");
    const assureTemp = $("ts-assure-temp");
    const assureConfirm = $("ts-assure-confirm");
    /* 稼働ステータスは DOM 差分更新で即時反映（タブ維持） */
    if (assureOnline) {
      assureOnline.textContent = view.customerOnline;
      assureOnline.classList.toggle("is-offline", !view.isHardwareOnline);
      applyHardwareStatusFromDash(dash, view);
      if (assureLatency) assureLatency.textContent = view.latencyLabel;
      if (assureConfirm) assureConfirm.textContent = view.confirmLabel;
      if (assureTemp) {
        assureTemp.textContent = `${view.tempEmoji} ${view.tempLabel}`;
        assureTemp.classList.remove("is-normal", "is-caution", "is-warning");
        assureTemp.classList.add(`is-${view.tempLevel}`);
      }
      const assureFw = $("ts-assure-fw");
      if (assureFw) {
        assureFw.textContent = view.firmwareLabel || "―";
      }
      const assureFwBadge = $("ts-assure-fw-badge");
      if (assureFwBadge) {
        assureFwBadge.hidden = !view.firmwareLatest;
      }
      const banner = $("ts-status-banner");
      if (banner) {
        banner.classList.toggle("is-alert", !!dash.alarm?.active);
        banner.classList.toggle("is-ok", !dash.alarm?.active);
        const head = banner.querySelector(".ts-status-head");
        const sub = banner.querySelector(".ts-status-sub");
        if (head) {
          head.textContent = dash.alarm?.active
            ? "発報があります"
            : "安全確認：異常なし";
        }
        if (sub) {
          sub.textContent =
            dash.alarm?.message || "すべてのセンサーが正常に動作しています";
        }
      }
    } else {
      const stack = $("ts-customer-status-stack");
      const banner = $("ts-status-banner");
      if (stack) stack.outerHTML = renderCustomerStatusBanner(dash);
      else if (banner) banner.outerHTML = renderCustomerStatusBanner(dash);
    }

    const modeCard = $("ts-mode-card");
    if (modeCard) modeCard.outerHTML = renderCustomerModeCards(dash);

    /* 詳細設定が欠落したらフル再マウント */
    if (!ensureCustomerDailySettingsMounted(dash)) {
      restoreActiveCustomerPane();
      return;
    }

    const daily = $("ts-daily-settings");
    if (daily) {
      /* 手動点灯ボタンを残す
       * soft patch ではスライダーのみ更新 */
      const lightSlider = $("ts-lighting-duration");
      if (lightSlider && !lightSlider.matches(":active")) {
        lightSlider.value = String(settingsState.lightingDurationSec);
        const lv = $("ts-lighting-duration-val");
        if (lv) lv.textContent = `${settingsState.lightingDurationSec}秒`;
      }
      const flashSlider = $("ts-flash-duration");
      if (flashSlider && !flashSlider.matches(":active")) {
        flashSlider.value = String(settingsState.flashDurationSec ?? 15);
        const fv = $("ts-flash-duration-val");
        if (fv) fv.textContent = `${settingsState.flashDurationSec ?? 15}秒`;
      }
      const notifyRoot = $("ts-customer-notify");
      if (notifyRoot && dash.notifySensors) {
        notifyRoot.innerHTML = (dash.notifySensors || [])
          .map((s) => {
            const receive = s.mode === "critical";
            return `<div class="ts-notify-row ts-customer-notify-row">
        <span class="ts-label">${escapeHtml(s.label)}</span>
        <div class="ts-notify-btns">
          <button type="button" class="ts-notify-btn ${receive ? "is-on" : ""}"
            data-ts-notify-sensor="${escapeHtml(s.id)}" data-ts-notify-mode="critical">
            🔔 通知ON
          </button>
          <button type="button" class="ts-notify-btn ${!receive ? "is-on" : ""}"
            data-ts-notify-sensor="${escapeHtml(s.id)}" data-ts-notify-mode="silent">
            🔕 サイレント
          </button>
        </div>
      </div>`;
          })
          .join("");
      }
    }

    const alarmCard = $("ts-alarm-card");
    if (alarmCard) alarmCard.outerHTML = renderAlarmCard(dash, { customer: true });

    paintCustomerNotifyList();

    const activityLog = $("ts-activity-log");
    if (activityLog) {
      activityLog.innerHTML = renderCustomerHistoryTimeline(dash.timeline, 40);
    }
    const logSnaps = $("ts-log-snaps");
    if (logSnaps) {
      logSnaps.innerHTML = latestSnapshots(dash.timeline, 6)
        .map(renderSnapshotThumb)
        .join("");
    }
    restoreActiveCustomerPane();
    return;
  }

  const heroTitle = $("ts-hero-title");
  const heroActions = $("ts-hero-actions");
  if (heroTitle) heroTitle.textContent = dash.displayName || "豊島邸";
  if (heroActions) heroActions.innerHTML = renderHeroChips(dash);

  const view = buildCommHealthView(dash);
  applyHardwareStatusFromDash(dash, view);
  const latencyEl = $("ts-latency-val");
  const onlineEl = $("ts-online-val");
  const heartbeatEl = $("ts-heartbeat-val");
  if (latencyEl) latencyEl.textContent = view.latencyLabel;
  if (onlineEl) {
    onlineEl.textContent = view.operatorOnline;
    onlineEl.classList.toggle("is-offline", !view.isHardwareOnline);
  }
  if (heartbeatEl) heartbeatEl.textContent = view.heartbeatLabel;
  const otaRoot = $("ts-ota-root");
  if (otaRoot) otaRoot.innerHTML = renderOtaCard(dash);
  const diRoot = $("ts-di-root");
  if (diRoot && !diRoot.querySelector(":active, :focus")) {
    diRoot.innerHTML = renderDiMaintenanceCard(dash);
  }
  const doRoot = $("ts-do-root");
  if (doRoot && !doRoot.querySelector(":active, :focus")) {
    doRoot.innerHTML = renderDoForceTestCard();
  }
  const kitRoot = $("ts-kitting-root");
  if (kitRoot) kitRoot.innerHTML = renderKittingCard(dash);
  const boardTempEl = $("ts-board-temp-val");
  if (boardTempEl) {
    boardTempEl.textContent = `${view.tempEmoji} ${view.tempLabel}`;
    boardTempEl.classList.remove("is-normal", "is-caution", "is-warning");
    boardTempEl.classList.add(`is-${view.tempLevel}`);
  }
  const hbWatch = $("ts-hb-watch");
  const hbWatchLabel = $("ts-hb-watch-label");
  if (hbWatch && !hbWatch.matches(":active")) {
    const on = dash.heartbeatWatchEnabled !== false;
    hbWatch.checked = on;
    if (hbWatchLabel) {
      hbWatchLabel.textContent = on ? "監視中（有効）" : "一時停止（無効）";
    }
  }

  const lightSlider = $("ts-lighting-duration");
  const periSlider = $("ts-perimeter-timeout");
  const flashSlider = $("ts-flash-duration");
  if (lightSlider && !lightSlider.matches(":active")) {
    lightSlider.value = String(settingsState.lightingDurationSec);
    const lv = $("ts-lighting-duration-val");
    if (lv) lv.textContent = `${settingsState.lightingDurationSec}秒`;
  }
  if (periSlider && !periSlider.matches(":active")) {
    periSlider.value = String(settingsState.perimeterTimeoutSec);
    const pv = $("ts-perimeter-timeout-val");
    if (pv) pv.textContent = `${settingsState.perimeterTimeoutSec}秒`;
  }
  if (flashSlider && !flashSlider.matches(":active")) {
    flashSlider.value = String(settingsState.flashDurationSec ?? 15);
    const fv = $("ts-flash-duration-val");
    if (fv) fv.textContent = `${settingsState.flashDurationSec ?? 15}秒`;
  }

  const modeCard = $("ts-mode-card");
  if (modeCard) {
    modeCard.outerHTML = renderCustomerModeCards(dash);
  }

  const alarmCard = $("ts-alarm-card");
  if (alarmCard) {
    alarmCard.outerHTML = renderAlarmCard(dash);
  }

  const notifySensors = $("ts-notify-sensors");
  if (notifySensors && dash.notifySensors) {
    notifySensors.innerHTML = dash.notifySensors
      .map(renderNotifySensorRow)
      .join("");
  }

  patchBuildingCard(dash.main);
  patchBuildingCard(dash.detached);

  const activityLog = $("ts-activity-log");
  if (activityLog) {
    activityLog.innerHTML = renderActivityLog(dash.timeline, 10);
  }
  const logSnaps = $("ts-log-snaps");
  if (logSnaps) {
    logSnaps.innerHTML = latestSnapshots(dash.timeline, 6)
      .map(renderSnapshotThumb)
      .join("");
  }
  restoreActiveCustomerPane();
}

function patchBuildingCard(building) {
  const card = document.querySelector(
    `[data-ts-building-card="${building.id}"]`
  );
  if (!card) return false;
  if (card.querySelector(":active, :focus, [data-ts-light-kick]")) {
    return true;
  }
  card.outerHTML = renderBuildingCard(building);
  return true;
}

export function isToyoshimaSecuritySite(siteId) {
  return String(siteId || "").trim() === TOYOSHIMA_SEC_ID;
}

/**
 * 顧客タブ（家のようす / お知らせ / 履歴）切替
 * ボタン・ペイン・body 属性を同一ステートへ同期
 */
export function setToyoshimaCustomerPane(pane, opts = {}) {
  const allowed = new Set(["map", "alert", "log"]);
  const raw = String(pane || "map").trim();
  const id = allowed.has(raw) ? raw : "map";
  activeCustomerPane = id;
  document.body.setAttribute("data-pane", id);
  document.querySelectorAll(".sf-mobile-tabs button").forEach((btn) => {
    const match = btn.getAttribute("data-pane") === id;
    btn.classList.toggle("is-on", match);
    btn.setAttribute("aria-selected", match ? "true" : "false");
  });
  document.querySelectorAll(".ts-tab-pane").forEach((el) => {
    el.classList.toggle("is-on", el.getAttribute("data-ts-pane") === id);
  });
  const root = $("ts-dashboard-root");
  if (root) root.setAttribute("data-ts-active-pane", id);
  const panes = $("ts-tab-panes");
  if (panes) panes.setAttribute("data-ts-active-pane", id);
  if (id === "alert" && opts.fetchNotify) {
    loadCustomerPortalNotifications().then(() => {
      paintCustomerNotifyList();
    });
  }
}

/** 現在のタブID（テスト・再同期用） */
export function getToyoshimaCustomerPane() {
  return activeCustomerPane || "map";
}

/** soft patch / 再描画後にタブ表示を復元 */
function restoreActiveCustomerPane() {
  setToyoshimaCustomerPane(
    activeCustomerPane ||
      document.body.getAttribute("data-pane") ||
      "map"
  );
}

async function syncFirmwareConfigAfterSave() {
  try {
    await postJson("/toyoshima/sync-config", {
      siteId: scheduleState.homeSiteId || TOYOSHIMA_HOME_ID,
      actor: "customer-portal",
    });
  } catch (err) {
    console.warn("[toyoshima-ui] sync-config", err);
  }
}

async function saveSettingsDebounced() {
  clearTimeout(settingsSaveTimer);
  settingsSaveTimer = setTimeout(async () => {
    try {
      const payload = {
        siteId: scheduleState.homeSiteId || TOYOSHIMA_HOME_ID,
        actor: "customer-portal",
        lightingDurationSec: settingsState.lightingDurationSec,
        di1DurationSec: settingsState.lightingDurationSec,
        scheduleStart: settingsState.scheduleStart,
        scheduleEnd: settingsState.scheduleEnd,
        patliteThreatEnabled: settingsState.patliteThreatEnabled,
        securityMode: settingsState.securityMode || "2STEP",
        flashEnabled: settingsState.flashEnabled !== false,
        flashDurationSec: settingsState.flashDurationSec ?? 15,
        forceRelayTest: settingsState.forceRelayTest !== false,
      };
      if (!isCustomerPortal()) {
        payload.perimeterTimeoutSec = settingsState.perimeterTimeoutSec;
        payload.diConfirmMs = settingsState.diConfirmMs ?? 100;
        payload.debounceDi1Ms = settingsState.debounceDi1Ms ?? 100;
        payload.debounceDi2Ms = settingsState.debounceDi2Ms ?? 100;
        payload.debounceBeamMs = settingsState.debounceBeamMs ?? 100;
      }
      const res = await fetch(`${HOME_API}/security-rules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || "保存に失敗");
      /* 実機評価APIへ即時同期 */
      await syncFirmwareConfigAfterSave();
      showToast("日常設定を保存しました");
    } catch (err) {
      showToast(err.message || "設定の保存に失敗");
    }
  }, 600);
}

/**
 * 詳細設定カードの存在を保証
 * 欠落時はフル再描画して true=継続 / false=再入
 */
function ensureCustomerDailySettingsMounted(dash) {
  if (!isCustomerPortal()) return true;
  const root = $("ts-dashboard-root");
  if (!root || root.hidden) return true;
  const daily = $("ts-daily-settings");
  const pane = root.querySelector('.ts-tab-pane[data-ts-pane="map"]');
  if (daily && daily.getAttribute("data-ts-daily-mounted") === "1") {
    return true;
  }
  if (!pane) {
    delete root.dataset.mounted;
    renderToyoshimaDashboard(dash);
    return false;
  }
  /* モードカード直後へ詳細設定を挿入 */
  const modeCard = $("ts-mode-card");
  const html = renderCustomerDailySettings(dash);
  if (modeCard) {
    modeCard.insertAdjacentHTML("afterend", html);
  } else {
    pane.insertAdjacentHTML("afterbegin", html);
  }
  return true;
}

function bindSettingsSliders() {
  const root = $("ts-dashboard-root");
  if (!root || root.dataset.settingsBound === "1") return;
  root.dataset.settingsBound = "1";
  root.addEventListener("input", (e) => {
    const light = e.target.closest("#ts-lighting-duration");
    const peri = e.target.closest("#ts-perimeter-timeout");
    const flashDur = e.target.closest("#ts-flash-duration");
    const start = e.target.closest("#ts-daily-schedule-start");
    const end = e.target.closest("#ts-daily-schedule-end");
    if (light) {
      settingsState.lightingDurationSec = Number(light.value) || 45;
      const lv = $("ts-lighting-duration-val");
      if (lv) lv.textContent = `${settingsState.lightingDurationSec}秒`;
      saveSettingsDebounced();
    }
    if (peri) {
      settingsState.perimeterTimeoutSec = Number(peri.value) || 120;
      const pv = $("ts-perimeter-timeout-val");
      if (pv) pv.textContent = `${settingsState.perimeterTimeoutSec}秒`;
      saveSettingsDebounced();
    }
    if (flashDur) {
      settingsState.flashDurationSec = Number(flashDur.value) || 15;
      const fv = $("ts-flash-duration-val");
      if (fv) fv.textContent = `${settingsState.flashDurationSec}秒`;
      saveSettingsDebounced();
    }
    const deb1 = e.target.closest("#ts-debounce-di1");
    const deb2 = e.target.closest("#ts-debounce-di2");
    const debB = e.target.closest("#ts-debounce-beam");
    if (deb1) {
      settingsState.debounceDi1Ms = Number(deb1.value) || 100;
      const v = $("ts-debounce-di1-val");
      if (v) v.textContent = `${settingsState.debounceDi1Ms}ms`;
      saveSettingsDebounced();
    }
    if (deb2) {
      settingsState.debounceDi2Ms = Number(deb2.value) || 100;
      const v = $("ts-debounce-di2-val");
      if (v) v.textContent = `${settingsState.debounceDi2Ms}ms`;
      saveSettingsDebounced();
    }
    if (debB) {
      settingsState.debounceBeamMs = Number(debB.value) || 100;
      const v = $("ts-debounce-beam-val");
      if (v) v.textContent = `${settingsState.debounceBeamMs}ms`;
      saveSettingsDebounced();
    }
    if (start) {
      settingsState.scheduleStart = normalizeTimeHm(start.value, "18:00");
      scheduleState.scheduleStart = settingsState.scheduleStart;
      saveSettingsDebounced();
    }
    if (end) {
      settingsState.scheduleEnd = normalizeTimeHm(end.value, "06:00");
      scheduleState.scheduleEnd = settingsState.scheduleEnd;
      saveSettingsDebounced();
    }
  });
  root.addEventListener("change", (e) => {
    const patlite = e.target.closest("#ts-patlite-threat");
    if (patlite) {
      settingsState.patliteThreatEnabled = !!patlite.checked;
      const lab = $("ts-patlite-threat-label");
      if (lab) lab.textContent = patlite.checked ? "ON" : "OFF";
      saveSettingsDebounced();
    }
    const flashEn = e.target.closest("#ts-flash-enabled");
    if (flashEn) {
      settingsState.flashEnabled = !!flashEn.checked;
      const lab = $("ts-flash-enabled-label");
      if (lab) lab.textContent = flashEn.checked ? "ON" : "OFF";
      saveSettingsDebounced();
    }
    const forceRelay = e.target.closest("#ts-force-relay-test");
    if (forceRelay) {
      settingsState.forceRelayTest = !!forceRelay.checked;
      const lab = $("ts-force-relay-test-label");
      if (lab) lab.textContent = forceRelay.checked ? "ON" : "OFF";
      saveSettingsDebounced();
    }
    const hbWatch = e.target.closest("#ts-hb-watch");
    if (hbWatch) {
      if (isCustomerPortal()) return;
      const on = !!hbWatch.checked;
      const lab = $("ts-hb-watch-label");
      if (lab) {
        lab.textContent = on ? "監視中（有効）" : "一時停止（無効）";
      }
      saveHeartbeatWatch(on).catch((err) => {
        showToast(err.message || "監視設定の保存に失敗");
      });
    }
  });
}

async function saveHeartbeatWatch(enabled) {
  const res = await fetch(`${HOME_API}/toyoshima/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      siteId: scheduleState.homeSiteId || TOYOSHIMA_HOME_ID,
      heartbeatWatchEnabled: !!enabled,
      actor: "operator",
    }),
  });
  const data = await res.json();
  if (!data?.ok) throw new Error(data?.error || "保存に失敗しました");
  if (data.dashboard) renderToyoshimaDashboard(data.dashboard);
  showToast(
    data.message ||
      (enabled
        ? "ハートビート死活監視を有効にしました"
        : "ハートビート死活監視を一時停止しました")
  );
}

export function renderToyoshimaDashboard(dash, opts = {}) {
  const soft = !!opts.soft;
  if (!dash) return;
  lastRenderedDash = dash;
  applyHardwareStatusFromDash(dash);
  const root = $("ts-dashboard-root");
  if (!root) return;

  syncScheduleState(dash);
  syncSettingsState(dash);
  const sig = dashSignature(dash);
  if (soft && root.dataset.mounted === "1" && sig === lastDashSig) return;
  lastDashSig = sig;

  if (root.dataset.mounted === "1" && soft) {
    root.hidden = false;
    patchToyoshimaDashboard(dash);
    return;
  }

  root.hidden = false;
  const customer = isCustomerPortal();
  if (customer) {
    root.innerHTML = `
    <div class="ts-tab-panes ts-customer-dash" id="ts-tab-panes" data-ts-active-pane="map">
      <div class="ts-tab-pane is-on" data-ts-pane="map">
        ${renderCustomerStatusBanner(dash)}
        ${renderCustomerModeCards(dash)}
        ${renderCustomerCameraCard()}
        ${renderCustomerDailySettings(dash)}
      </div>
      <div class="ts-tab-pane" data-ts-pane="alert">
        <div id="ts-alarm-root">${renderAlarmCard(dash, { customer: true })}</div>
        ${renderCustomerNotifySection(dash)}
      </div>
      <div class="ts-tab-pane" data-ts-pane="log">
        ${renderCustomerActivitySection(dash)}
      </div>
    </div>`;
  } else {
    root.innerHTML = `
    <div class="ts-tab-panes" id="ts-tab-panes" data-ts-active-pane="map">
      <div class="ts-tab-pane is-on" data-ts-pane="map">
        <section class="ts-hero">
          <p class="ts-hero-title" id="ts-hero-title">${escapeHtml(dash.displayName || "豊島邸")}</p>
          <div class="ts-hero-actions" id="ts-hero-actions">${renderHeroChips(dash)}</div>
        </section>
        ${renderCustomerModeCards(dash)}
        <button type="button" class="ts-sync-btn" data-ts-action="sync_config">
          📡 主装置・子機へ設定を反映
        </button>
        <div id="ts-health-root">${renderHealthGrid(dash)}</div>
        <div id="ts-ota-root">${renderOtaCard(dash)}</div>
        <div id="ts-di-root">${renderDiMaintenanceCard(dash)}</div>
        <div id="ts-do-root">${renderDoForceTestCard()}</div>
        <div id="ts-kitting-root">${renderKittingCard(dash)}</div>
        ${renderCloudStreamCard()}
        ${renderBuildingCard(dash.main)}
        ${renderBuildingCard(dash.detached)}
        <section class="ts-card" id="ts-map-manual-lights">
          <h3 class="ts-card-head">💡 外構ライト手動操作</h3>
          <p class="ts-hint">手動操作は昼夜を無視して即時点灯します</p>
          ${renderManualLightKickRow()}
        </section>
      </div>
      <div class="ts-tab-pane" data-ts-pane="alert">
        <div id="ts-alarm-root">${renderAlarmCard(dash)}</div>
        <div id="ts-settings-root">${renderSettingsCard(dash)}</div>
        <div id="ts-notify-root">${renderNotifyCard(dash)}</div>
        ${renderOpsCard()}
      </div>
      <div class="ts-tab-pane" data-ts-pane="log">
        ${renderActivitySection(dash)}
      </div>
    </div>`;
  }

  root.dataset.mounted = "1";
  renderScheduleDialog();
  bindSecurityHistoryModalV1();
  setSecurityHistorySiteIdV1(TOYOSHIMA_SEC_ID);
  ensureSnapshotLightbox();
  bindScheduleDialog();
  bindSettingsSliders();
  if (!customer) {
    bindToyoshimaPush();
    refreshToyoshimaPushDiag();
    loadMonthlyReportIntoDash(dash).catch(() => {});
    loadCloudStreamForm().catch(() => {});
  } else {
    ensureCustomerDailySettingsMounted(dash);
  }
  /* 社内/顧客とも iframe 安全起動にする */
  bindCustomerCamera();
  bindToyoshimaLightKickButtons();
  bindToyoshimaControls();
  bindToyoshimaCustomerTabs();
  restoreActiveCustomerPane();
  if (customer) {
    loadCustomerPortalNotifications().then(() => {
      paintCustomerNotifyList();
    });
  }
}

export function hideToyoshimaDashboard() {
  const root = $("ts-dashboard-root");
  if (root) {
    root.hidden = true;
    root.innerHTML = "";
    delete root.dataset.mounted;
    delete root.dataset.bound;
    delete root.dataset.settingsBound;
  }
  lastDashSig = "";
  clientLatencyMs = null;
  activeCustomerPane = "map";
}

async function fetchToyoshimaDashboardJson(force = false) {
  const t0 = performance.now();
  const data = await fetchToyoshimaDashboard({
    siteId: TOYOSHIMA_SEC_ID,
    force,
  });
  clientLatencyMs = Math.round(performance.now() - t0);
  if (data?.status && data?.dashboard?.commHealth) {
    const hw = {
      ...data.status,
      isHardwareOnline:
        typeof data.status.isHardwareOnline === "boolean"
          ? data.status.isHardwareOnline
          : isHardwareOnline(data.status.lastHeartbeatAt),
    };
    data.dashboard.commHealth = {
      ...data.dashboard.commHealth,
      ...hw,
      lastHeartbeatAt:
        hw.lastHeartbeatAt ||
        data.dashboard.commHealth.lastHeartbeatAt,
      uiOnline: hw.isHardwareOnline,
      isHardwareOnline: hw.isHardwareOnline,
    };
    applyToyoshimaHardwareStatus({
      ...hw,
      isHardwareOnline: hw.isHardwareOnline,
    });
  }
  return data;
}

async function refreshToyoshimaDashboard(opts = {}) {
  const force = !!opts.forceHealthSync || !opts.soft;
  const data = await fetchToyoshimaDashboardJson(force);
  if (data?.ok && data.dashboard) {
    if (force) lastDashSig = "";
    renderToyoshimaDashboard(data.dashboard, opts);
    if (!opts.soft) {
      if (!isCustomerPortal()) {
        await loadMonthlyReportIntoDash(data.dashboard).catch(() => {});
      }
    }
  }
}

async function loadMonthlyReportIntoDash(dash) {
  const res = await fetch(
    `${HOME_API}/security/monthly-report?siteId=${encodeURIComponent(
      dash?.homeSiteId || TOYOSHIMA_HOME_ID
    )}`,
    { cache: "no-store" }
  );
  const data = await res.json();
  if (!data?.ok || !data.report) return;
  dash._monthlyReport = data.report;
  const root = $("ts-monthly-root");
  if (root) root.innerHTML = renderMonthlyReportCard(data.report);
}

async function setCustomerMode(mode) {
  const res = await fetch(`${HOME_API}/security/mode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      siteId: TOYOSHIMA_HOME_ID,
      mode,
      actor: "customer-portal",
    }),
  });
  const data = await res.json();
  if (!data?.ok) throw new Error(data?.error || "モード切替に失敗");
  await syncFirmwareConfigAfterSave();
  if (data.dashboard) renderToyoshimaDashboard(data.dashboard);
  showToast(mode === "disarmed" ? "警戒 OFF にしました" : "警戒 ON にしました");
}

function ensureSnapshotLightbox() {
  if ($("ts-snap-lightbox")) return;
  const dlg = document.createElement("dialog");
  dlg.id = "ts-snap-lightbox";
  dlg.className = "ts-snap-lightbox";
  dlg.innerHTML = `
    <div class="ts-snap-lightbox-inner">
      <header class="ts-snap-lightbox-head">
        <div>
          <p class="ts-snap-lightbox-title" id="ts-snap-lightbox-title">スナップショット</p>
          <p class="ts-snap-lightbox-time" id="ts-snap-lightbox-time"></p>
        </div>
        <form method="dialog"><button type="submit" class="ts-btn ts-btn-ghost">閉じる</button></form>
      </header>
      <img id="ts-snap-lightbox-img" class="ts-snap-lightbox-img" alt="警報スナップショット拡大" />
    </div>`;
  document.body.appendChild(dlg);
}

function openSnapshotLightbox(url, title, timeLabel) {
  ensureSnapshotLightbox();
  const dlg = $("ts-snap-lightbox");
  const img = $("ts-snap-lightbox-img");
  const t = $("ts-snap-lightbox-title");
  const tm = $("ts-snap-lightbox-time");
  if (img) img.src = url;
  if (t) t.textContent = title || "スナップショット";
  if (tm) tm.textContent = timeLabel || "";
  dlg?.showModal?.();
}

async function setNotifyMode(sensorId, mode) {
  const res = await fetch(`${HOME_API}/toyoshima/notify-mode`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      siteId: TOYOSHIMA_HOME_ID,
      sensorId,
      mode,
      actor: "customer-portal",
    }),
  });
  const data = await res.json();
  if (!data?.ok) throw new Error(data?.error || "通知設定の保存に失敗");
  if (data.dashboard) renderToyoshimaDashboard(data.dashboard);
  await syncFirmwareConfigAfterSave();
  showToast(
    mode === "critical"
      ? "🔔 通知ON に変更しました"
      : mode === "silent"
        ? "🔕 サイレント に変更しました"
        : `${NOTIFY_LABELS[mode] || mode} に変更しました`
  );
}

function bindCustomerCamera() {
  if (window.__TISLY_TS_CAM_BOUND) return;
  window.__TISLY_TS_CAM_BOUND = true;
  /* 内部 API は使わずアプリ直起動 */
  bindGuardViewerLaunchersV1();
}

function bindToyoshimaPush() {
  if (window.__TISLY_TS_PUSH_BOUND) return;
  window.__TISLY_TS_PUSH_BOUND = true;

  document.addEventListener("click", async (e) => {
    if (e.target.closest("#ts-push-reregister")) {
      const btn = $("ts-push-reregister");
      if (btn) btn.disabled = true;
      try {
        await registerSecurityWebPushV1({ forceResubscribe: true });
        showToast("Push通知を再登録しました");
        await refreshToyoshimaPushDiag();
      } catch (err) {
        showToast(err.message || String(err));
      } finally {
        if (btn) btn.disabled = false;
      }
    }
  });
}

async function refreshToyoshimaPushDiag() {
  const el = $("ts-push-diag");
  if (!el) return;
  const perm =
    typeof Notification !== "undefined"
      ? Notification.permission
      : "unsupported";
  el.textContent = `通知許可: ${perm}`;
  try {
    await refreshSecurityPushDiagV1();
    const sf = $("sf-push-diag");
    if (sf?.textContent) {
      el.textContent = sf.textContent.replace(/^permission:/, "通知許可:");
    }
  } catch {
    /* ignore */
  }
}

function bindScheduleDialog() {
  if (window.__TISLY_TS_SCHEDULE_BOUND) return;
  window.__TISLY_TS_SCHEDULE_BOUND = true;
  $("ts-schedule-save")?.addEventListener("click", () => {
    saveScheduleFromDialog().catch((err) => {
      showToast(err.message || "保存に失敗しました");
    });
  });
}

/**
 * 上部タブ click を capture で必ず拾う
 * light-v1 の CTRL_BOUND に依存しない
 */
function bindToyoshimaCustomerTabs() {
  if (window.__TISLY_TS_TABS_BOUND) return;
  window.__TISLY_TS_TABS_BOUND = true;
  document.addEventListener(
    "click",
    (e) => {
      const btn = e.target.closest?.(".sf-mobile-tabs button[data-pane]");
      if (!btn) return;
      const toyoshimaUi =
        isToyoshimaSecuritySite(window.__TISLY_SF_SITE_ID) ||
        document.body.classList.contains("is-toyoshima") ||
        $("ts-dashboard-root")?.dataset?.mounted === "1";
      if (!toyoshimaUi) return;
      const pane = btn.getAttribute("data-pane") || "map";
      setToyoshimaCustomerPane(pane, { fetchNotify: true });
    },
    true
  );
}

function bindToyoshimaControls() {
  const root = $("ts-dashboard-root");
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  root.addEventListener("change", async (e) => {
    const input = e.target.closest("[data-ts-action]");
    if (!input || input.tagName !== "INPUT") return;
    const building = input.getAttribute("data-ts-building");
    const onAction = input.getAttribute("data-ts-action");
    const offAction = input.getAttribute("data-ts-off");
    const action = input.checked ? onAction : offAction;
    try {
      await postControl(building, action);
      await refreshToyoshimaDashboard();
    } catch (err) {
      console.warn("[toyoshima-ui]", err);
    }
  });

  root.addEventListener("click", async (e) => {
    const areaBtn = e.target.closest("[data-ts-area]");
    if (areaBtn) {
      e.preventDefault();
      const next = areaBtn.getAttribute("data-ts-area") || "1f";
      window.__TISLY_SF_FLOOR = next;
      root.querySelectorAll("[data-ts-area]").forEach((btn) => {
        btn.classList.toggle(
          "is-on",
          btn.getAttribute("data-ts-area") === next
        );
      });
      try {
        window.TislySecurityIso3d?.setFloor?.(next);
      } catch {
        /* 3D が無い画面でもボタンは動かす */
      }
      return;
    }

    const modeBtn = e.target.closest("[data-ts-customer-mode]");
    if (modeBtn) {
      e.preventDefault();
      const mode = modeBtn.getAttribute("data-ts-customer-mode");
      try {
        modeBtn.disabled = true;
        await setCustomerMode(mode);
      } catch (err) {
        showToast(err.message || "モード切替に失敗");
      } finally {
        modeBtn.disabled = false;
      }
      return;
    }

    const secModeBtn = e.target.closest("[data-ts-security-mode]");
    if (secModeBtn) {
      e.preventDefault();
      const mode = String(
        secModeBtn.getAttribute("data-ts-security-mode") || "2STEP"
      ).toUpperCase();
      settingsState.securityMode = mode;
      document.querySelectorAll("[data-ts-security-mode]").forEach((btn) => {
        btn.classList.toggle(
          "is-on",
          btn.getAttribute("data-ts-security-mode") === mode
        );
      });
      saveSettingsDebounced();
      return;
    }

    const snapBtn = e.target.closest("[data-ts-snap-url]");
    if (snapBtn) {
      e.preventDefault();
      openSnapshotLightbox(
        snapBtn.getAttribute("data-ts-snap-url"),
        snapBtn.getAttribute("data-ts-snap-title"),
        snapBtn.getAttribute("data-ts-snap-time")
      );
      return;
    }

    const chip = e.target.closest("[data-ts-schedule]");
    if (chip) {
      e.preventDefault();
      openScheduleDialog(chip.getAttribute("data-ts-schedule"));
      return;
    }

    const notifyBtn = e.target.closest("[data-ts-notify-sensor]");
    if (notifyBtn) {
      e.preventDefault();
      const sensorId = notifyBtn.getAttribute("data-ts-notify-sensor");
      const mode = notifyBtn.getAttribute("data-ts-notify-mode");
      try {
        await setNotifyMode(sensorId, mode);
      } catch (err) {
        showToast(err.message || "通知設定に失敗");
      }
      return;
    }

    const diBtn = e.target.closest("[data-ts-di-trigger]");
    if (diBtn) {
      e.preventDefault();
      diBtn.disabled = true;
      try {
        const data = await postJson("/hardware/test-di-trigger", {
          siteId: TOYOSHIMA_HOME_ID,
          diId: diBtn.getAttribute("data-ts-di-trigger"),
          building: diBtn.getAttribute("data-ts-di-building") || undefined,
          actor: "operator-pro",
        });
        showToast(data.message || "DI擬似発報を実行しました");
        await refreshToyoshimaDashboard({
          soft: false,
          forceHealthSync: true,
        });
      } catch (err) {
        showToast(err.message || "DI擬似発報に失敗しました");
      } finally {
        diBtn.disabled = false;
      }
      return;
    }

    const doBtn = e.target.closest("[data-ts-do-pulse]");
    if (doBtn) {
      e.preventDefault();
      doBtn.disabled = true;
      try {
        const data = await postJson("/hardware/test-pulse", {
          siteId: TOYOSHIMA_HOME_ID,
          outputId: doBtn.getAttribute("data-ts-do-pulse"),
          building: doBtn.getAttribute("data-ts-do-building") || undefined,
          durationMs: 1000,
          actor: "operator-pro",
        });
        showToast(data.message || "接点強制テストを送信しました");
        await refreshToyoshimaDashboard({
          soft: false,
          forceHealthSync: true,
        });
      } catch (err) {
        showToast(err.message || "接点強制テストに失敗しました");
      } finally {
        doBtn.disabled = false;
      }
      return;
    }

    const actionBtn = e.target.closest("[data-ts-action]");
    if (!actionBtn || actionBtn.tagName === "INPUT") return;
    const action = actionBtn.getAttribute("data-ts-action");

    try {
      if (action === "monthly_pdf") {
        window.open(
          `${HOME_API}/security/monthly-report?siteId=${encodeURIComponent(
            TOYOSHIMA_HOME_ID
          )}&format=pdf`,
          "_blank",
          "noopener"
        );
        return;
      }
      if (action === "sync_config") {
        actionBtn.disabled = true;
        const data = await postJson("/toyoshima/sync-config", {
          siteId: TOYOSHIMA_HOME_ID,
        });
        if (data.dashboard) renderToyoshimaDashboard(data.dashboard);
        showToast("主装置・子機へ設定を反映しました");
        actionBtn.disabled = false;
        return;
      }
      if (action === "ota_deploy") {
        actionBtn.disabled = true;
        try {
          const res = await fetch("/api/firmware/toyoshima/deploy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              channel: "production",
              siteId: TOYOSHIMA_HOME_ID,
              force: true,
            }),
          });
          const data = await res.json().catch(() => ({}));
          showToast(
            data.message ||
              "次回ハートビート時に実機が自動更新されます"
          );
          await refreshToyoshimaDashboard({
            soft: false,
            forceHealthSync: true,
          });
        } finally {
          actionBtn.disabled = false;
        }
        return;
      }
      if (action === "sim_heartbeat") {
        actionBtn.disabled = true;
        try {
          /* 主装置・子機へ擬似 HB を送り
           * 盤内温度 36.2℃ も同時セット */
          const SIM_BOARD_TEMP_C = 36.2;
          let lastDash = null;
          for (const building of ["main", "detached"]) {
            const data = await postJson("/toyoshima/heartbeat", {
              siteId: TOYOSHIMA_HOME_ID,
              building,
              deviceId: `sim-${building}`,
              actor: "operator-sim",
              board_temp: SIM_BOARD_TEMP_C,
              boardTemp: SIM_BOARD_TEMP_C,
            });
            lastDash = data.dashboard || lastDash;
          }
          lastDashSig = "";
          const status = await fetchToyoshimaStatus({
            siteId: TOYOSHIMA_SEC_ID,
            force: true,
          });
          if (lastDash) {
            lastDash.commHealth = {
              ...(lastDash.commHealth || {}),
              ...status,
              uiOnline: status.isHardwareOnline,
              isHardwareOnline: status.isHardwareOnline,
            };
            renderToyoshimaDashboard(lastDash);
          } else {
            await refreshToyoshimaDashboard({
              soft: false,
              forceHealthSync: true,
            });
          }
          applyToyoshimaHardwareStatus(status);
          showToast("擬似ハートビートを送信しました（オンライン同期）");
        } finally {
          actionBtn.disabled = false;
        }
        return;
      }
      if (action === "refresh_notify") {
        actionBtn.disabled = true;
        try {
          lastDashSig = "";
          await loadCustomerPortalNotifications();
          await refreshToyoshimaDashboard({
            soft: false,
            forceHealthSync: true,
          });
          paintCustomerNotifyList();
          showToast("通知を最新に更新しました");
        } finally {
          actionBtn.disabled = false;
        }
        return;
      }
      if (action === "mark_notify_read") {
        markVisibleNotificationsRead();
        showToast("未読を既読にしました");
        return;
      }
      if (action === "refresh_status") {
        actionBtn.disabled = true;
        actionBtn.classList.add("is-spinning");
        try {
          lastDashSig = "";
          /* ステータス API と dashboard を両方 no-store 再取得 */
          const status = await fetchToyoshimaStatus({
            siteId: TOYOSHIMA_SEC_ID,
            force: true,
          });
          await refreshToyoshimaDashboard({
            soft: false,
            forceHealthSync: true,
          });
          applyToyoshimaHardwareStatus(status);
          showToast("最新の接続状態を取得しました");
        } finally {
          actionBtn.classList.remove("is-spinning");
          actionBtn.disabled = false;
        }
        return;
      }
      if (action === "reload_cloud_stream") {
        await loadCloudStreamForm();
        showToast("共有リンク設定を再読込しました");
        return;
      }
      if (action === "save_cloud_stream") {
        actionBtn.disabled = true;
        try {
          await saveCloudStreamForm();
          showToast("クラウド共有リンクを保存しました");
        } finally {
          actionBtn.disabled = false;
        }
        return;
      }
      if (action === "bulk_lights_on" || action === "bulk_lights_off") {
        const data = await postJson("/toyoshima/bulk-lights", {
          siteId: TOYOSHIMA_HOME_ID,
          action: action === "bulk_lights_on" ? "on" : "off",
        });
        if (data.dashboard) renderToyoshimaDashboard(data.dashboard);
        showToast(
          action === "bulk_lights_on"
            ? "照明を一括ONにしました"
            : "照明を一括OFFにしました"
        );
        return;
      }
      if (action === "manual_lights_3min") {
        const data = await postJson("/toyoshima/bulk-lights", {
          siteId: TOYOSHIMA_HOME_ID,
          action: "on",
          durationSec: 180,
          actor: "customer-portal",
        });
        if (data.dashboard) renderToyoshimaDashboard(data.dashboard);
        showToast("外構ライトを3分間点灯します");
        return;
      }
      if (action === "manual_lights_off") {
        const data = await postJson("/toyoshima/bulk-lights", {
          siteId: TOYOSHIMA_HOME_ID,
          action: "off",
          actor: "customer-portal",
        });
        if (data.dashboard) renderToyoshimaDashboard(data.dashboard);
        showToast("外構ライトを消灯しました");
        return;
      }
      if (action === "alarm_clear") {
        const data = await postJson("/toyoshima/alarm-clear", {
          siteId: TOYOSHIMA_HOME_ID,
        });
        if (data.dashboard) renderToyoshimaDashboard(data.dashboard);
        showToast("アラーム対応完了");
        return;
      }
      if (action === "test_notify") {
        const data = await postJson("/toyoshima/test-notify", {
          siteId: TOYOSHIMA_HOME_ID,
        });
        showToast(
          data.pushSent
            ? "通知テストを送信しました"
            : "通知テスト（Push未送信）"
        );
        return;
      }
      if (action === "export_report") {
        const res = await fetch(
          `${HOME_API}/toyoshima/report?siteId=${encodeURIComponent(TOYOSHIMA_SEC_ID)}`,
          { cache: "no-store" }
        );
        const text = await res.text();
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `toyoshima-security-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("レポートを出力しました");
        return;
      }
      if (action === "open_log") {
        setSecurityHistorySiteIdV1(TOYOSHIMA_SEC_ID);
        openSecurityHistoryModalV1({ siteId: TOYOSHIMA_SEC_ID }).catch(
          () => {}
        );
        return;
      }

      const building = actionBtn.getAttribute("data-ts-building");
      if (building) {
        await postControl(building, action);
        await refreshToyoshimaDashboard();
      }
    } catch (err) {
      showToast(err.message || "操作に失敗しました");
      if (action === "sync_config") actionBtn.disabled = false;
    }
  });
}

export async function loadToyoshimaDashboard(opts = {}) {
  try {
    lastDashSig = "";
    const force = opts.forceHealthSync !== false;
    const data = await fetchToyoshimaDashboardJson(force);
    if (data?.ok && data.dashboard) {
      renderToyoshimaDashboard(data.dashboard, { soft: false });
      return data.dashboard;
    }
  } catch (err) {
    console.warn("[toyoshima-ui] load failed", err);
  }
  return null;
}

export function stopToyoshimaPolling() {
  if (window.__TISLY_TOYOSHIMA_POLL) {
    clearInterval(window.__TISLY_TOYOSHIMA_POLL);
    window.__TISLY_TOYOSHIMA_POLL = null;
  }
}

export function startToyoshimaPolling() {
  bindToyoshimaCustomerTabs();
  bindToyoshimaLightKickButtons();
  if (window.__TISLY_TOYOSHIMA_POLL) return;
  const tick = () => {
    const root = $("ts-dashboard-root");
    const active =
      isToyoshimaSecuritySite(window.__TISLY_SF_SITE_ID) ||
      document.body.classList.contains("is-toyoshima") ||
      root?.dataset?.mounted === "1";
    if (!active) return;
    refreshToyoshimaDashboard({ soft: true }).catch(() => {});
  };
  /* 1.5 秒周期で HB 復旧・タブ外ステータスを即時同期 */
  window.__TISLY_TOYOSHIMA_POLL = setInterval(tick, 1500);
  if (!window.__TISLY_TOYOSHIMA_VIS_BOUND) {
    window.__TISLY_TOYOSHIMA_VIS_BOUND = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") tick();
    });
  }
  if (!window.__TISLY_TOYOSHIMA_BC_UNSUB) {
    window.__TISLY_TOYOSHIMA_BC_UNSUB = subscribeToyoshimaStatus(
      (status) => {
        applyToyoshimaHardwareStatus(status);
        lastDashSig = "";
        tick();
      }
    );
  }
  tick();
}

export { TOYOSHIMA_SEC_ID };
