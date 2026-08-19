/**
 * お客様向け見守り
 * 3D俯瞰とやさしい警報表示
 */

import {
  formatAlarmTime,
  renderGuardModes,
  renderIsoStack,
  renderSocLayerButtons,
} from "./security-floor-map-v1.js";

const state = {
  siteId: "SEC-JP-TSUKUBA-001",
  floorId: "all",
  dash: null,
  cameraId: null,
  pane: "map",
};

function $(id) {
  return document.getElementById(id);
}

async function fetchJson(url, opts) {
  const res = await fetch(url, {
    cache: "no-store",
    ...opts,
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.error || "読込失敗");
  }
  return data;
}

function fillSites(sites) {
  const sel = $("sf-site-select");
  if (!sel) return;
  sel.innerHTML = sites
    .map(
      (s) =>
        `<option value="${s.id}">${s.displayName}</option>`
    )
    .join("");
  sel.value = state.siteId;
}

function setLiveScene(cameraId, soc) {
  const feed = $("sf-live-feed");
  const cam = (soc?.cameras || []).find(
    (c) => c.id === cameraId
  );
  const scene = cam?.scene || "lobby";
  if (feed) {
    feed.className = `sf-live-feed scene-${scene}`;
  }
  if ($("sf-cam-title")) {
    $("sf-cam-title").textContent = cam
      ? cam.customerLabel || cam.label
      : "カメラ";
  }
}

function renderDash(dash) {
  state.dash = dash;
  $("sf-status-emoji").textContent = dash.statusEmoji;
  $("sf-status-label").textContent = dash.statusLabel;
  $("sf-guard-label").textContent = dash.guardModeLabel;
  const floors = dash.floors || [];
  $("sf-floor-tabs").innerHTML = renderSocLayerButtons(
    floors,
    state.floorId
  );
  $("sf-map-wrap").innerHTML = renderIsoStack(
    dash,
    state.floorId,
    {}
  );
  $("sf-modes").innerHTML = renderGuardModes(dash.guardMode);
  $("sf-notes").innerHTML = (dash.notes || [])
    .map((n) => `<li>${n}</li>`)
    .join("");
  const open = (dash.soc?.alarmLogs || []).filter(
    (l) => l.status !== "done"
  );
  if ($("sf-alarm-list")) {
    $("sf-alarm-list").innerHTML = open
      .map(
        (a) => `<li><b>${a.location}</b><span>${a.kindLabel} · ${formatAlarmTime(a.at)}</span></li>`
      )
      .join("") || "<li>異常はありません</li>";
  }
  if ($("sf-log-body")) {
    $("sf-log-body").innerHTML = (dash.soc?.alarmLogs || [])
      .slice(0, 12)
      .map((l) => {
        const st =
          l.status === "done" ? "確認済み" : "お知らせ";
        return `<tr><td>${formatAlarmTime(l.at)}</td><td>${l.location}</td><td>${l.kindLabel}</td><td>${st}</td></tr>`;
      })
      .join("");
  }
  const cams = dash.soc?.cameras || [];
  if ($("sf-cam-thumbs")) {
    $("sf-cam-thumbs").innerHTML = cams
      .map(
        (c) => `<button type="button" class="sf-thumb scene-${c.scene}" data-cam="${c.id}">${c.customerLabel || c.label}</button>`
      )
      .join("");
  }
  if (!state.cameraId) {
    state.cameraId = dash.soc?.selectedCameraId || null;
  }
  setLiveScene(state.cameraId, dash.soc);
}

async function loadSites() {
  const data = await fetchJson(
    "/api/security-floor/v1/sites"
  );
  fillSites(data.sites);
}

async function loadDash() {
  const data = await fetchJson(
    `/api/security-floor/v1/customer?siteId=${encodeURIComponent(state.siteId)}`
  );
  renderDash(data.dashboard);
}

async function setMode(mode) {
  const data = await fetchJson(
    "/api/security-floor/v1/guard-mode",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId: state.siteId,
        mode,
      }),
    }
  );
  renderDash(data.dashboard);
}

function bind() {
  $("sf-site-select")?.addEventListener("change", (e) => {
    state.siteId = e.target.value;
    state.cameraId = null;
    loadDash().catch(() => {});
  });
  $("sf-floor-tabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-floor]");
    if (!btn || btn.disabled) return;
    state.floorId = btn.getAttribute("data-floor");
    if (state.dash) renderDash(state.dash);
  });
  $("sf-modes")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mode]");
    if (!btn) return;
    setMode(btn.getAttribute("data-mode")).catch(() => {});
  });
  $("sf-cam-thumbs")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cam]");
    if (!btn) return;
    state.cameraId = btn.getAttribute("data-cam");
    setLiveScene(state.cameraId, state.dash?.soc);
  });
  $("sf-map-wrap")?.addEventListener("click", (e) => {
    const pin = e.target.closest("[data-camera]");
    if (!pin) return;
    state.cameraId = pin.getAttribute("data-camera");
    setLiveScene(state.cameraId, state.dash?.soc);
  });
  document.querySelectorAll(".sf-mobile-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.pane = btn.getAttribute("data-pane");
      document
        .querySelectorAll(".sf-mobile-tabs button")
        .forEach((b) =>
          b.classList.toggle("is-on", b === btn)
        );
      document.body.setAttribute("data-pane", state.pane);
    });
  });
}

bind();
Promise.all([loadSites(), loadDash()]).catch((err) => {
  $("sf-status-label").textContent =
    err.message || "読み込めませんでした";
});
