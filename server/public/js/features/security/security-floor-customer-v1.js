/**
 * お客様向け
 * フロア俯瞰 · 発報発光 · 警備切替
 */

import {
  pickDefaultFloor,
  renderFloorMapSvg,
  renderFloorTabs,
  renderGuardModes,
} from "./security-floor-map-v1.js";

const state = {
  siteId: "SEC-JP-TSUKUBA-001",
  floorId: "1f",
  dash: null,
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

function renderDash(dash) {
  state.dash = dash;
  $("sf-status-emoji").textContent = dash.statusEmoji;
  $("sf-status-label").textContent = dash.statusLabel;
  $("sf-guard-label").textContent = dash.guardModeLabel;
  const floors = dash.floors || [];
  const enabled = floors.some(
    (f) => f.id === state.floorId && f.enabled
  );
  if (!enabled) {
    state.floorId = pickDefaultFloor(floors);
  }
  $("sf-floor-tabs").innerHTML = renderFloorTabs(
    floors,
    state.floorId
  );
  $("sf-map-wrap").innerHTML = renderFloorMapSvg(
    dash.rooms,
    dash.sensors,
    state.floorId
  );
  $("sf-modes").innerHTML = renderGuardModes(
    dash.guardMode
  );
  $("sf-notes").innerHTML = (dash.notes || [])
    .map((n) => `<li>${n}</li>`)
    .join("");
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
}

bind();
Promise.all([loadSites(), loadDash()]).catch((err) => {
  $("sf-status-label").textContent =
    err.message || "読み込めませんでした";
});
