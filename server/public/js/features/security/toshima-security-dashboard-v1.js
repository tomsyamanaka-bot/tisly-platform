/**
 * 豊島邸 Security ダッシュボード UI
 * 白ベース × ネイビー · スマホ視認性優先
 */

const TOSHIMA_SEC_ID = "SEC-JP-TOSHIMA-001";
const HOME_API = "/api/home/v1";

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
            <span>DO1 1号機</span>
          </label>
          <label class="ts-toggle">
            <input type="checkbox" data-ts-building="main" data-ts-action="do2_on" data-ts-off="do2_off" ${d2?.on ? "checked" : ""} />
            <span>DO2 2号機</span>
          </label>
        </div>
        <p class="ts-sub">24V パトライト (DO3)</p>
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
          <span class="ts-label">DO1 100V ライト</span>
          ${doStatus(d1 || { on: false })}
        </div>
        <div class="ts-row">
          <span class="ts-label">DO2 パトライト</span>
          ${doStatus(d2 || { on: false, blinking: d2?.blinking })}
        </div>
      </div>`;
  }

  return `<article class="ts-card" data-ts-building-card="${building.id}">
    <header class="ts-card-head">
      <h3>${escapeHtml(building.label)}</h3>
      <span class="ts-en">${escapeHtml(building.labelEn)}</span>
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

export function isToshimaSecuritySite(siteId) {
  return String(siteId || "").trim() === TOSHIMA_SEC_ID;
}

export function renderToshimaDashboard(dash) {
  const root = $("ts-dashboard-root");
  if (!root || !dash) return;

  root.hidden = false;
  root.innerHTML = `
    <section class="ts-hero">
      <p class="ts-hero-title">${escapeHtml(dash.displayName)}</p>
      <p class="ts-hero-sub">${escapeHtml(dash.guardModeLabel)} · ライト ${escapeHtml(dash.lightsScheduleLabel)}</p>
    </section>
    ${renderBuildingCard(dash.main)}
    ${renderBuildingCard(dash.detached)}
    <section class="ts-card ts-timeline-card">
      <h3 class="ts-card-head">イベントタイムライン / 警報履歴</h3>
      <div class="ts-timeline" id="ts-timeline">${renderTimeline(dash.timeline)}</div>
    </section>`;

  bindToshimaControls();
}

export function hideToshimaDashboard() {
  const root = $("ts-dashboard-root");
  if (root) {
    root.hidden = true;
    root.innerHTML = "";
  }
}

async function postControl(building, action) {
  await fetch(`${HOME_API}/toshima/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ building, action }),
  });
}

async function refreshToshimaDashboard() {
  const res = await fetch(
    `${HOME_API}/toshima/dashboard?siteId=${encodeURIComponent(TOSHIMA_SEC_ID)}`,
    { cache: "no-store" }
  );
  const data = await res.json();
  if (data?.ok && data.dashboard) {
    renderToshimaDashboard(data.dashboard);
  }
}

function bindToshimaControls() {
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
      await refreshToshimaDashboard();
    } catch (err) {
      console.warn("[toshima-ui]", err);
    }
  });

  root.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-ts-action]");
    if (!btn || btn.tagName === "INPUT") return;
    const building = btn.getAttribute("data-ts-building");
    const action = btn.getAttribute("data-ts-action");
    try {
      await postControl(building, action);
      await refreshToshimaDashboard();
    } catch (err) {
      console.warn("[toshima-ui]", err);
    }
  });
}

export async function loadToshimaDashboard() {
  try {
    const res = await fetch(
      `${HOME_API}/toshima/dashboard?siteId=${encodeURIComponent(TOSHIMA_SEC_ID)}`,
      { cache: "no-store" }
    );
    const data = await res.json();
    if (data?.ok && data.dashboard) {
      renderToshimaDashboard(data.dashboard);
      return data.dashboard;
    }
  } catch (err) {
    console.warn("[toshima-ui] load failed", err);
  }
  return null;
}

export function startToshimaPolling() {
  if (window.__TISLY_TOSHIMA_POLL) return;
  window.__TISLY_TOSHIMA_POLL = setInterval(() => {
    if (isToshimaSecuritySite(window.__TISLY_SF_SITE_ID)) {
      refreshToshimaDashboard().catch(() => {});
    }
  }, 3000);
}

export { TOSHIMA_SEC_ID };
