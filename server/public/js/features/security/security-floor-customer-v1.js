/**
 * お客様向け見守り
 * 3D俯瞰とやさしい警報表示
 * API 成否に関わらず即時描画する
 */

import {
  formatAlarmTime,
  renderGuardModes,
  renderIsoStack,
  renderSocLayerButtons,
} from "./security-floor-map-v1.js";
import {
  FALLBACK_DEFAULT_SITE_ID,
  applyLocalGuardMode,
  getFallbackCustomerDash,
  listFallbackSites,
  markSecurityUiReady,
} from "./security-floor-fallback-v1.js";

const state = {
  siteId: FALLBACK_DEFAULT_SITE_ID,
  floorId: "all",
  dash: null,
  cameraId: null,
  pane: "map",
};

function $(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function setHtml(id, html) {
  const el = $(id);
  if (el) el.innerHTML = html;
}

async function fetchJson(url, opts) {
  const res = await fetch(url, {
    cache: "no-store",
    ...opts,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("応答を解析できません");
  }
  if (!data?.ok) {
    throw new Error(data?.error || "読込失敗");
  }
  return data;
}

function fillSites(sites) {
  const sel = $("sf-site-select");
  if (!sel) return;
  const list = sites?.length ? sites : listFallbackSites();
  sel.innerHTML = list
    .map((s) => {
      const id = s.siteId || s.id;
      return `<option value="${id}">${s.displayName}</option>`;
    })
    .join("");
  sel.value = state.siteId;
}

function setLiveScene(cameraId, soc) {
  const feed = $("sf-live-feed");
  const cam = (soc?.cameras || []).find((c) => c.id === cameraId);
  const scene = cam?.scene || "lobby";
  if (feed) {
    feed.className = `sf-live-feed scene-${scene}`;
  }
  setText(
    "sf-cam-title",
    cam ? cam.customerLabel || cam.label : "カメラ"
  );
}

function renderDash(dash) {
  if (!dash) return;
  try {
    state.dash = dash;
    setText("sf-status-emoji", dash.statusEmoji || "🟢");
    setText(
      "sf-status-label",
      dash.statusLabel || "正常に動いています"
    );
    setText("sf-guard-label", dash.guardModeLabel || "—");
    const floors = dash.floors || [];
    setHtml("sf-floor-tabs", renderSocLayerButtons(floors, state.floorId));
    setHtml("sf-map-wrap", renderIsoStack(dash, state.floorId, {}));
    setHtml("sf-modes", renderGuardModes(dash.guardMode));
    setHtml(
      "sf-notes",
      (dash.notes || []).map((n) => `<li>${n}</li>`).join("")
    );
    const open = (dash.soc?.alarmLogs || []).filter(
      (l) => l.status !== "done"
    );
    setHtml(
      "sf-alarm-list",
      open
        .map(
          (a) => `<li><b>${a.location}</b><span>${a.kindLabel} · ${formatAlarmTime(a.at)}</span></li>`
        )
        .join("") || "<li>異常はありません</li>"
    );
    setHtml(
      "sf-log-body",
      (dash.soc?.alarmLogs || [])
        .slice(0, 12)
        .map((l) => {
          const st = l.status === "done" ? "確認済み" : "お知らせ";
          return `<tr><td>${formatAlarmTime(l.at)}</td><td>${l.location}</td><td>${l.kindLabel}</td><td>${st}</td></tr>`;
        })
        .join("")
    );
    const cams = dash.soc?.cameras || [];
    setHtml(
      "sf-cam-thumbs",
      cams
        .map(
          (c) => `<button type="button" class="sf-thumb scene-${c.scene}" data-cam="${c.id}">${c.customerLabel || c.label}</button>`
        )
        .join("")
    );
    if (!state.cameraId) {
      state.cameraId = dash.soc?.selectedCameraId || null;
    }
    setLiveScene(state.cameraId, dash.soc);
    markSecurityUiReady();
  } catch (err) {
    setText("sf-status-label", "表示を再構築しました");
    console.warn("[security-customer]", err);
  }
}

function bootFallback() {
  fillSites(listFallbackSites());
  renderDash(getFallbackCustomerDash(state.siteId));
}

async function loadSites() {
  try {
    const data = await fetchJson("/api/security-floor/v1/sites");
    fillSites(data.sites);
  } catch {
    fillSites(listFallbackSites());
  }
}

async function loadDash() {
  try {
    const data = await fetchJson(
      `/api/security-floor/v1/customer?siteId=${encodeURIComponent(state.siteId)}`
    );
    if (data.dashboard) renderDash(data.dashboard);
  } catch (err) {
    if (!state.dash) bootFallback();
    console.warn("[security-customer] API fallback", err);
  }
}

async function setMode(mode) {
  try {
    const data = await fetchJson("/api/security-floor/v1/guard-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: state.siteId, mode }),
    });
    renderDash(data.dashboard || applyLocalGuardMode(state.dash, mode));
  } catch {
    renderDash(applyLocalGuardMode(state.dash, mode));
  }
}

function bind() {
  $("sf-site-select")?.addEventListener("change", (e) => {
    state.siteId = e.target.value;
    state.cameraId = null;
    bootFallback();
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
  $("sf-cam-next")?.addEventListener("click", () => {
    const cams = state.dash?.soc?.cameras || [];
    if (!cams.length) return;
    const i = cams.findIndex((c) => c.id === state.cameraId);
    state.cameraId = cams[(i + 1) % cams.length].id;
    setLiveScene(state.cameraId, state.dash?.soc);
  });
  $("sf-cam-expand")?.addEventListener("click", () => {
    $("sf-live-dialog")?.showModal?.();
  });
  $("sf-cam-play")?.addEventListener("click", () => {
    $("sf-live-dialog")?.showModal?.();
  });
  document.querySelectorAll(".sf-mobile-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.pane = btn.getAttribute("data-pane");
      document
        .querySelectorAll(".sf-mobile-tabs button")
        .forEach((b) => b.classList.toggle("is-on", b === btn));
      document.body.setAttribute("data-pane", state.pane);
    });
  });
}

try {
  bind();
  bootFallback();
  Promise.all([loadSites(), loadDash()]).catch(() => {});
} catch (err) {
  bootFallback();
  console.warn("[security-customer] boot", err);
}
