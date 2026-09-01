/**
 * 豊島邸 Security ダッシュボード UI
 * 白ベース × ネイビー · スマホ視認性優先
 */

const TOYOSHIMA_SEC_ID = "SEC-JP-TOYOSHIMA-001";
const TOYOSHIMA_HOME_ID = "HOME-JP-TOYOSHIMA";
const HOME_API = "/api/home/v1";

let lastDashSig = "";
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
    start: dash.scheduleStart,
    end: dash.scheduleEnd,
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

function renderBuildingCard(building, opts = {}) {
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

function renderTimeline(timeline) {
  if (!timeline?.length) {
    return '<p class="ts-empty">まだイベントはありません</p>';
  }
  return timeline
    .slice(0, 20)
    .map((ev) => {
      const ico =
        ev.kind === "main_beam"
          ? "🏠"
          : ev.kind === "detached_road" || ev.kind === "detached_path"
            ? "🚨"
            : ev.kind === "patlite_test"
              ? "🔔"
              : "💡";
      return `<article class="ts-timeline-row">
        <span class="ts-timeline-ico">${ico}</span>
        <div class="ts-timeline-body">
          <p class="ts-timeline-title">${escapeHtml(ev.title)}</p>
          <p class="ts-timeline-sub">${escapeHtml(ev.detail || "")}</p>
        </div>
        <time class="ts-timeline-time">${formatTime(ev.at)}</time>
      </article>`;
    })
    .join("");
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

function openScheduleDialog(kind) {
  renderScheduleDialog();
  const dialog = $("ts-schedule-dialog");
  const title = $("ts-schedule-title");
  const hint = $("ts-schedule-hint");
  const startEl = $("ts-schedule-start");
  const endEl = $("ts-schedule-end");
  if (!dialog || !startEl || !endEl) return;

  const start = normalizeTimeHm(scheduleState.scheduleStart, "18:00");
  const end = normalizeTimeHm(scheduleState.scheduleEnd, "06:00");
  startEl.value = start;
  endEl.value = end;

  if (kind === "guard") {
    if (title) title.textContent = "警戒時間の設定";
    if (hint) {
      hint.textContent =
        "警戒の有効時間帯を変更します。保存後すぐに反映されます。";
    }
  } else {
    if (title) title.textContent = "ライト点灯時間の設定";
    if (hint) {
      hint.textContent =
        "防犯ライトの点灯時間帯を変更します。保存後すぐに反映されます。";
    }
  }

  dialog.dataset.scheduleKind = kind || "light";
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  }
}

async function saveScheduleFromDialog() {
  const startEl = $("ts-schedule-start");
  const endEl = $("ts-schedule-end");
  const scheduleStart = normalizeTimeHm(
    startEl?.value,
    scheduleState.scheduleStart
  );
  const scheduleEnd = normalizeTimeHm(
    endEl?.value,
    scheduleState.scheduleEnd
  );
  const homeSiteId = scheduleState.homeSiteId || TOYOSHIMA_HOME_ID;
  const guardMode =
    scheduleState.guardMode === "off" ? "off" : "scheduled";

  const res = await fetch(`${HOME_API}/security-rules`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      siteId: homeSiteId,
      actor: "customer-portal",
      guardMode,
      scheduleStart,
      scheduleEnd,
      securityPausedUntil: null,
    }),
  });
  const data = await res.json();
  if (!data?.ok) {
    throw new Error(data?.error || "保存に失敗しました");
  }

  scheduleState.scheduleStart = scheduleStart;
  scheduleState.scheduleEnd = scheduleEnd;
  scheduleState.guardMode = data.rules?.guardMode || guardMode;
  await refreshToyoshimaDashboard();
  $("ts-schedule-dialog")?.close?.();
}

function bindScheduleDialog() {
  if (window.__TISLY_TS_SCHEDULE_BOUND) return;
  window.__TISLY_TS_SCHEDULE_BOUND = true;

  $("ts-schedule-save")?.addEventListener("click", () => {
    saveScheduleFromDialog().catch((err) => {
      console.warn("[toyoshima-ui] schedule save", err);
    });
  });
}

function patchBuildingCard(building) {
  const card = document.querySelector(
    `[data-ts-building-card="${building.id}"]`
  );
  if (!card) return false;
  card.outerHTML = renderBuildingCard(building);
  return true;
}

function patchToyoshimaDashboard(dash) {
  syncScheduleState(dash);
  const heroTitle = $("ts-hero-title");
  const heroActions = $("ts-hero-actions");
  if (heroTitle) heroTitle.textContent = dash.displayName || "豊島邸";
  if (heroActions) {
    heroActions.innerHTML = renderHeroChips(dash);
  }
  patchBuildingCard(dash.main);
  patchBuildingCard(dash.detached);
  const timeline = $("ts-timeline");
  if (timeline) timeline.innerHTML = renderTimeline(dash.timeline);
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
  if (soft && root.dataset.mounted === "1" && sig === lastDashSig) {
    return;
  }
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
    ${renderBuildingCard(dash.main)}
    ${renderBuildingCard(dash.detached)}
    <section class="ts-card ts-timeline-card">
      <h3 class="ts-card-head">イベントタイムライン / 警報履歴</h3>
      <div class="ts-timeline" id="ts-timeline">${renderTimeline(dash.timeline)}</div>
    </section>`;

  root.dataset.mounted = "1";
  renderScheduleDialog();
  bindScheduleDialog();
  bindToyoshimaControls();
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
}

async function postControl(building, action) {
  await fetch(`${HOME_API}/toyoshima/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ building, action }),
  });
}

async function refreshToyoshimaDashboard(opts = {}) {
  const res = await fetch(
    `${HOME_API}/toyoshima/dashboard?siteId=${encodeURIComponent(TOYOSHIMA_SEC_ID)}`,
    { cache: "no-store" }
  );
  const data = await res.json();
  if (data?.ok && data.dashboard) {
    renderToyoshimaDashboard(data.dashboard, opts);
  }
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

    const btn = e.target.closest("[data-ts-action]");
    if (!btn || btn.tagName === "INPUT") return;
    const building = btn.getAttribute("data-ts-building");
    const action = btn.getAttribute("data-ts-action");
    try {
      await postControl(building, action);
      await refreshToyoshimaDashboard();
    } catch (err) {
      console.warn("[toyoshima-ui]", err);
    }
  });
}

export async function loadToyoshimaDashboard() {
  try {
    const res = await fetch(
      `${HOME_API}/toyoshima/dashboard?siteId=${encodeURIComponent(TOYOSHIMA_SEC_ID)}`,
      { cache: "no-store" }
    );
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
