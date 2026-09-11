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
  isHardwareOnline,
  subscribeToyoshimaStatus,
} from "./use-toyoshima-status-v1.js";

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
  };
}

let lastDashSig = "";
let clientLatencyMs = null;
/** 顧客/社内タブの単一真実ソース（家のようす/お知らせ/履歴） */
let activeCustomerPane = "map";
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
};

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
  const tempLabel = health.boardTempLabel || "正常監視中";
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

function normalizeTimeHm(value, fallback) {
  const raw = String(value || "").trim();
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(raw);
  if (!m) return fallback;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
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
  ${renderCustomerAssureHealthCard(view)}
  </div>`;
}

/**
 * 顧客向け · システム安心・通信ヘルスカード
 * 危険スイッチは含めず稼働状態のみ表示
 */
function renderCustomerAssureHealthCard(view) {
  return `<section class="ts-card ts-assure-health-card" id="ts-customer-health-card" aria-label="システム安心・通信ヘルス">
    <div class="ts-assure-head-row">
      <h3 class="ts-card-head ts-assure-head">🛡 システム安心ステータス</h3>
      <button type="button" class="ts-refresh-btn" data-ts-action="refresh_status" aria-label="最新状態に更新">
        <span class="ts-refresh-ico" aria-hidden="true">🔄</span>
        <span class="ts-refresh-label">最新状態に更新</span>
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
  });
}

/** 顧客向け · 日常詳細設定（常時表示カード） */
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
        <label class="ts-slider-field" for="ts-lighting-duration">
          <span class="ts-label" id="ts-lighting-label">${lightLabel}</span>
          <div class="ts-slider-row">
            <input type="range" id="ts-lighting-duration" min="5" max="180" step="1" value="${lightSec}" />
            <span class="ts-slider-val" id="ts-lighting-duration-val">${lightSec}秒</span>
          </div>
        </label>
        ${patliteBlock}
      </section>

      <section class="ts-daily-block">
        <h4 class="ts-daily-h">② 自動点灯スケジュール設定</h4>
        <p class="ts-hint">夜間のライト自動点灯時間帯（日跨ぎ可）</p>
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
        <div id="ts-customer-notify">${notifyRows}</div>
      </section>

      <section class="ts-daily-block">
        <h4 class="ts-daily-h">④ 外構ライト手動操作</h4>
        <p class="ts-hint">帰宅時や庭の確認用（パトライトは動きません）</p>
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

/** 顧客向け · カメラプレビュー */
function renderCustomerCameraCard() {
  return `<section class="ts-card ts-camera-card">
    <h3 class="ts-card-head">📷 防犯カメラ</h3>
    <p class="ts-hint">ライブ映像と最新スナップショットを確認できます</p>
    <button type="button" class="ts-btn ts-btn-primary ts-btn-camera-cta" id="ts-customer-camera">
      防犯カメラを見る
    </button>
  </section>`;
}

/** 顧客向け · 発報履歴（月次レポートなし） */
function renderCustomerActivitySection(dash) {
  return `<section class="ts-card ts-activity-card">
    <h3 class="ts-card-head">📜 発報履歴（直近10件）</h3>
    <div class="ts-activity-log" id="ts-activity-log">${renderActivityLog(dash.timeline, 10)}</div>
    <div class="ts-snap-row ts-snap-row-log" id="ts-log-snaps">${latestSnapshots(dash.timeline, 6)
      .map(renderSnapshotThumb)
      .join("")}</div>
    <button type="button" class="ts-btn ts-btn-ghost ts-btn-wide" data-ts-action="open_log">
      詳細を見る（もっと見る）
    </button>
  </section>`;
}

/** スマート3連セグメント · 警戒モード */
function renderCustomerModeCards(dash) {
  const current = dash.customerMode || "home";
  const modes = [
    { id: "away", emoji: "🏃", label: "おでかけ警戒" },
    { id: "home", emoji: "🏠", label: "在宅見守り" },
    { id: "disarmed", emoji: "⏸️", label: "警戒解除" },
  ];
  return `<section class="ts-card ts-mode-card" id="ts-mode-card" aria-label="警戒モード">
    <h3 class="ts-card-head">🛡️ 警戒モード</h3>
    <div class="ts-mode-segment" role="radiogroup" aria-label="警戒モード切替">
      ${modes
        .map(
          (m) => `<button type="button" class="ts-mode-seg ${
            current === m.id ? "is-on" : ""
          }" data-ts-customer-mode="${m.id}" role="radio" aria-checked="${
            current === m.id ? "true" : "false"
          }">
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
      snaps.length
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
        <span class="ts-health-key">盤内温度（主装置）</span>
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

function renderSettingsCard(dash) {
  const lightSec = dash.lightingDurationSec ?? 45;
  const periSec = dash.perimeterTimeoutSec ?? 120;
  return `<section class="ts-card ts-settings-card" id="ts-settings-card">
    <h3 class="ts-card-head">⚙️ 詳細設定</h3>
    <label class="ts-slider-field" for="ts-lighting-duration">
      <span class="ts-label">DOライト点灯維持時間</span>
      <div class="ts-slider-row">
        <input type="range" id="ts-lighting-duration" min="5" max="180" step="1" value="${lightSec}" />
        <span class="ts-slider-val" id="ts-lighting-duration-val">${lightSec}秒</span>
      </div>
    </label>
    <label class="ts-slider-field" for="ts-perimeter-timeout">
      <span class="ts-label">段階接近判定 制限時間</span>
      <div class="ts-slider-row">
        <input type="range" id="ts-perimeter-timeout" min="30" max="300" step="5" value="${periSec}" />
        <span class="ts-slider-val" id="ts-perimeter-timeout-val">${periSec}秒</span>
      </div>
    </label>
    <p class="ts-hint">スライダー変更は自動保存されます</p>
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
    <div class="ts-btn-row">
      <button type="button" class="ts-btn" data-ts-action="bulk_lights_on">💡 照明を一括ON</button>
      <button type="button" class="ts-btn ts-btn-ghost" data-ts-action="bulk_lights_off">💡 照明を一括OFF</button>
    </div>
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
            <span>1号機（出力1）</span>
          </label>
          <label class="ts-toggle">
            <input type="checkbox" data-ts-building="main" data-ts-action="do2_on" data-ts-off="do2_off" ${d2?.on ? "checked" : ""} />
            <span>2号機（出力2）</span>
          </label>
        </div>
        <p class="ts-sub">24V パトライト（出力3）</p>
        <div class="ts-row">
          ${doStatus(d3 || { on: false })}
          <button type="button" class="ts-btn" data-ts-building="main" data-ts-action="patlite_test">手動テスト</button>
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
    headers: { "Content-Type": "application/json" },
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
    if (daily && !daily.querySelector(":active, :focus")) {
      daily.outerHTML = renderCustomerDailySettings(dash);
    } else {
      const lightSlider = $("ts-lighting-duration");
      if (lightSlider && !lightSlider.matches(":active")) {
        lightSlider.value = String(settingsState.lightingDurationSec);
        const lv = $("ts-lighting-duration-val");
        if (lv) lv.textContent = `${settingsState.lightingDurationSec}秒`;
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
export function setToyoshimaCustomerPane(pane) {
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
      };
      if (!isCustomerPortal()) {
        payload.perimeterTimeoutSec = settingsState.perimeterTimeoutSec;
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
        ${renderCustomerDailySettings(dash)}
        ${renderCustomerCameraCard()}
      </div>
      <div class="ts-tab-pane" data-ts-pane="alert">
        <div id="ts-alarm-root">${renderAlarmCard(dash, { customer: true })}</div>
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
        <div id="ts-settings-root">${renderSettingsCard(dash)}</div>
        ${renderCloudStreamCard()}
        ${renderBuildingCard(dash.main)}
        ${renderBuildingCard(dash.detached)}
      </div>
      <div class="ts-tab-pane" data-ts-pane="alert">
        <div id="ts-alarm-root">${renderAlarmCard(dash)}</div>
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
  renderLogDialog();
  ensureSnapshotLightbox();
  bindScheduleDialog();
  bindSettingsSliders();
  if (!customer) {
    bindToyoshimaPush();
    refreshToyoshimaPushDiag();
    loadMonthlyReportIntoDash(dash).catch(() => {});
    loadCloudStreamForm().catch(() => {});
  } else {
    bindCustomerCamera();
    ensureCustomerDailySettingsMounted(dash);
  }
  bindToyoshimaControls();
  restoreActiveCustomerPane();
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
  showToast(`${data.modeLabel || "警戒モード"} に切り替えました`);
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
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("#ts-customer-camera");
    if (!btn) return;
    btn.disabled = true;
    try {
      const { openCustomerCameraPreview } = await import(
        "../../camera-webrtc-viewer-v1.js"
      );
      await openCustomerCameraPreview();
    } catch (err) {
      showToast(err.message || "カメラを開けません");
    } finally {
      btn.disabled = false;
    }
  });
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
        const full = $("ts-log-full");
        const dashRes = await fetch(
          `${HOME_API}/toyoshima/dashboard?siteId=${encodeURIComponent(TOYOSHIMA_SEC_ID)}`,
          { cache: "no-store" }
        );
        const dashData = await dashRes.json();
        if (full && dashData?.dashboard?.timeline) {
          full.innerHTML = renderTimelineFull(dashData.dashboard.timeline);
        }
        $("ts-log-dialog")?.showModal?.();
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
