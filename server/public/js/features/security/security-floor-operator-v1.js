/**
 * 社内向け
 * フロア俯瞰 · 発報発光 · 警備モード
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
  site: null,
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

function fillSiteSelect(sites) {
  const sel = $("sf-site-select");
  if (!sel) return;
  sel.innerHTML = sites
    .map(
      (s) =>
        `<option value="${s.id}">${s.displayName}（${s.countryCode}）</option>`
    )
    .join("");
  sel.value = state.siteId;
}

function renderSite(site) {
  state.site = site;
  $("sf-status-emoji").textContent = site.hasAlert
    ? "🔴"
    : "🟢";
  $("sf-status-label").textContent = site.hasAlert
    ? "発報があります"
    : "正常です";
  $("sf-plan").textContent =
    `${site.planCode} / ${site.planStatus} / ${site.currency}`;
  const floors = site.floors || [];
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
    site.rooms,
    site.sensors,
    state.floorId
  );
  $("sf-modes").innerHTML = renderGuardModes(
    site.guardMode
  );
  $("sf-notes").innerHTML = (site.notes || [])
    .map((n) => `<li>${n}</li>`)
    .join("");
}

async function loadOperator() {
  const data = await fetchJson(
    `/api/security-floor/v1/operator?siteId=${encodeURIComponent(state.siteId)}`
  );
  fillSiteSelect(data.dashboard.sites.map((s) => ({
    id: s.siteId,
    displayName: s.displayName,
    countryCode: s.countryCode,
  })));
  $("sf-sum-total").textContent = String(
    data.dashboard.totalSites
  );
  $("sf-sum-alert").textContent = String(
    data.dashboard.alertCount
  );
  renderSite(data.site);
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
  renderSite(data.operatorSite);
}

async function toggleLivingAlert() {
  const site = state.site;
  if (!site) return;
  const sensor = (site.sensors || []).find(
    (s) => s.kind === "mmwave"
  );
  if (!sensor) return;
  const next =
    sensor.state === "alert" ? "normal" : "alert";
  const data = await fetchJson(
    "/api/security-floor/v1/sensor-state",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId: state.siteId,
        sensorId: sensor.id,
        state: next,
      }),
    }
  );
  renderSite(data.operatorSite);
}

function bind() {
  $("sf-site-select")?.addEventListener("change", (e) => {
    state.siteId = e.target.value;
    loadOperator().catch(() => {});
  });
  $("sf-floor-tabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-floor]");
    if (!btn || btn.disabled) return;
    state.floorId = btn.getAttribute("data-floor");
    if (state.site) renderSite(state.site);
  });
  $("sf-modes")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mode]");
    if (!btn) return;
    setMode(btn.getAttribute("data-mode")).catch(() => {});
  });
  $("sf-demo-alert")?.addEventListener("click", () => {
    toggleLivingAlert().catch(() => {});
  });
}

bind();
loadOperator().catch((err) => {
  $("sf-status-label").textContent =
    err.message || "読み込めませんでした";
});
