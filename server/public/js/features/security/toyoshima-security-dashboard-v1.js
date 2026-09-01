/**
 * 豊島邸 Security ダッシュボード UI
 * 白ベース × ネイビー · スマホ視認性優先
 */

import {
  registerSecurityWebPushV1,
  refreshSecurityPushDiagV1,
} from "./security-floor-push-v1.js";

const TOYOSHIMA_SEC_ID = "SEC-JP-TOYOSHIMA-001";
const TOYOSHIMA_HOME_ID = "HOME-JP-TOYOSHIMA";
const HOME_API = "/api/home/v1";
const NOTIFY_MODES = ["critical", "silent", "off"];
const NOTIFY_LABELS = {
  critical: "緊急通知ON",
  silent: "サイレント",
  off: "OFF",
};

let lastDashSig = "";
let clientLatencyMs = null;
let scheduleState = {
  homeSiteId: TOYOSHIMA_HOME_ID,
  guardMode: "scheduled",
  scheduleStart: "18:00",
  scheduleEnd: "06:00",
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

function renderHeroChips(dash) {
  const guardLabel = dash.guardModeLabel || "警戒時間";
  const lightLabel = dash.lightsScheduleLabel || "—";
  return `<button type="button" class="ts-hero-chip" data-ts-schedule="guard" aria-haspopup="dialog">
      <span class="ts-hero-chip-label">警戒</span>
      <span class="ts-hero-chip-value">${escapeHtml(guardLabel)}</span>
    </button>
    <button type="button" class="ts-hero-chip" data-ts-schedule="light" aria-haspopup="dialog">
      <span class="ts-hero-chip-label">ライト点灯</span>
      <span class="ts-hero-chip-value">${escapeHtml(lightLabel)}</span>
    </button>`;
}

function renderHealthGrid(dash) {
  const health = dash.commHealth || {};
  const latency =
    clientLatencyMs != null ? `${clientLatencyMs} ms` : "計測中…";
  const lastComm = health.lastCommAt
    ? `${formatJstCommTime(health.lastCommAt)} / ${escapeHtml(health.lastCommLabel || "—")}`
    : "—";
  return `<section class="ts-card ts-health-card" id="ts-health-card">
    <h3 class="ts-card-head">📡 実機通信ステータス</h3>
    <div class="ts-health-grid">
      <div class="ts-health-cell">
        <span class="ts-health-key">ネットワーク遅延</span>
        <span class="ts-health-val" id="ts-latency-val">${escapeHtml(latency)}</span>
      </div>
      <div class="ts-health-cell">
        <span class="ts-health-key">稼働ステータス</span>
        <span class="ts-health-val" id="ts-online-val">${escapeHtml(health.onlineSummary || "—")}</span>
      </div>
      <div class="ts-health-cell ts-health-cell-wide">
        <span class="ts-health-key">最新通信時刻</span>
        <span class="ts-health-val" id="ts-last-comm-val">${lastComm}</span>
      </div>
    </div>
  </section>`;
}

function renderAlarmCard(dash) {
  const alarm = dash.alarm || { active: false, message: "発報はありません" };
  return `<section class="ts-card ts-alarm-card ${alarm.active ? "is-live" : ""}" id="ts-alarm-card">
    <h3 class="ts-card-head">🚨 アラーム発報</h3>
    <p class="ts-alarm-status ${alarm.active ? "is-alert" : ""}" id="ts-alarm-status">${escapeHtml(alarm.message)}</p>
    <button type="button" class="ts-btn ts-btn-ghost" data-ts-action="alarm_clear" ${alarm.active ? "" : "disabled"}>
      アラーム対応完了
    </button>
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

function renderActivityLog(timeline, limit = 10) {
  const rows = (timeline || []).slice(0, limit);
  if (!rows.length) {
    return '<p class="ts-empty">まだできごとはありません</p>';
  }
  return rows
    .map((ev) => {
      const ico =
        ev.kind === "main_beam"
          ? "🏠"
          : ev.kind === "detached_road" || ev.kind === "detached_path"
            ? "🚨"
            : ev.kind === "patlite_test"
              ? "🔔"
              : "💡";
      return `<article class="ts-log-row">
        <span class="ts-log-ico">${ico}</span>
        <div class="ts-log-body">
          <p class="ts-log-title">${escapeHtml(ev.title)}</p>
          <p class="ts-log-sub">${escapeHtml(ev.detail || "")}</p>
        </div>
        <time class="ts-log-time">${formatTime(ev.at)}</time>
      </article>`;
    })
    .join("");
}

function renderActivitySection(dash) {
  return `<section class="ts-card ts-activity-card">
    <h3 class="ts-card-head">📜 動作ログ（直近10件）</h3>
    <div class="ts-activity-log" id="ts-activity-log">${renderActivityLog(dash.timeline, 10)}</div>
    <button type="button" class="ts-btn ts-btn-ghost ts-btn-wide" data-ts-action="open_log">
      詳細を見る（もっと見る）
    </button>
  </section>`;
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

async function postControl(building, action) {
  await postJson("/toyoshima/control", { building, action });
}

function patchToyoshimaDashboard(dash) {
  syncScheduleState(dash);
  const heroTitle = $("ts-hero-title");
  const heroActions = $("ts-hero-actions");
  if (heroTitle) heroTitle.textContent = dash.displayName || "豊島邸";
  if (heroActions) heroActions.innerHTML = renderHeroChips(dash);

  const health = dash.commHealth || {};
  const latency =
    clientLatencyMs != null ? `${clientLatencyMs} ms` : "計測中…";
  const lastComm = health.lastCommAt
    ? `${formatJstCommTime(health.lastCommAt)} / ${escapeHtml(health.lastCommLabel || "—")}`
    : "—";
  const latencyEl = $("ts-latency-val");
  const onlineEl = $("ts-online-val");
  const lastCommEl = $("ts-last-comm-val");
  if (latencyEl) latencyEl.textContent = latency;
  if (onlineEl) {
    onlineEl.textContent = health.onlineSummary || "—";
  }
  if (lastCommEl) lastCommEl.textContent = lastComm;

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

  const timeline = $("ts-timeline");
  if (timeline) timeline.innerHTML = renderTimelineFull(dash.timeline);
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

export function renderToyoshimaDashboard(dash, opts = {}) {
  const soft = !!opts.soft;
  const root = $("ts-dashboard-root");
  if (!root || !dash) return;

  syncScheduleState(dash);
  const sig = dashSignature(dash);
  if (soft && root.dataset.mounted === "1" && sig === lastDashSig) return;
  lastDashSig = sig;

  if (root.dataset.mounted === "1" && soft) {
    root.hidden = false;
    patchToyoshimaDashboard(dash);
    return;
  }

  root.hidden = false;
  root.innerHTML = `
    <section class="ts-hero">
      <p class="ts-hero-title" id="ts-hero-title">${escapeHtml(dash.displayName || "豊島邸")}</p>
      <div class="ts-hero-actions" id="ts-hero-actions">${renderHeroChips(dash)}</div>
    </section>
    <button type="button" class="ts-sync-btn" data-ts-action="sync_config">
      📡 主装置・子機へ設定を反映
    </button>
    <div id="ts-health-root">${renderHealthGrid(dash)}</div>
    <div id="ts-alarm-root">${renderAlarmCard(dash)}</div>
    <div id="ts-notify-root">${renderNotifyCard(dash)}</div>
    ${renderBuildingCard(dash.main)}
    ${renderBuildingCard(dash.detached)}
    ${renderOpsCard()}
    ${renderActivitySection(dash)}
    <section class="ts-card ts-timeline-card" hidden aria-hidden="true">
      <div class="ts-timeline" id="ts-timeline"></div>
    </section>`;

  root.dataset.mounted = "1";
  renderScheduleDialog();
  renderLogDialog();
  bindScheduleDialog();
  bindToyoshimaPush();
  bindToyoshimaControls();
  refreshToyoshimaPushDiag();
}

export function hideToyoshimaDashboard() {
  const root = $("ts-dashboard-root");
  if (root) {
    root.hidden = true;
    root.innerHTML = "";
    delete root.dataset.mounted;
    delete root.dataset.bound;
  }
  lastDashSig = "";
  clientLatencyMs = null;
}

async function refreshToyoshimaDashboard(opts = {}) {
  const t0 = performance.now();
  const res = await fetch(
    `${HOME_API}/toyoshima/dashboard?siteId=${encodeURIComponent(TOYOSHIMA_SEC_ID)}`,
    { cache: "no-store" }
  );
  clientLatencyMs = Math.round(performance.now() - t0);
  const data = await res.json();
  if (data?.ok && data.dashboard) {
    renderToyoshimaDashboard(data.dashboard, opts);
  }
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
  showToast(`${NOTIFY_LABELS[mode] || mode} に変更しました`);
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

export async function loadToyoshimaDashboard() {
  try {
    const t0 = performance.now();
    const res = await fetch(
      `${HOME_API}/toyoshima/dashboard?siteId=${encodeURIComponent(TOYOSHIMA_SEC_ID)}`,
      { cache: "no-store" }
    );
    clientLatencyMs = Math.round(performance.now() - t0);
    const data = await res.json();
    if (data?.ok && data.dashboard) {
      renderToyoshimaDashboard(data.dashboard);
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
  window.__TISLY_TOYOSHIMA_POLL = setInterval(() => {
    if (isToyoshimaSecuritySite(window.__TISLY_SF_SITE_ID)) {
      refreshToyoshimaDashboard({ soft: true }).catch(() => {});
    }
  }, 3000);
}

export { TOYOSHIMA_SEC_ID };
