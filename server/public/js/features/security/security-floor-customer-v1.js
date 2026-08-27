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
  applySecurityOrbit,
  bindSecurityOrbit,
  setSecurityDrumFloor,
} from "./security-floor-orbit-v1.js";
import {
  FALLBACK_DEFAULT_SITE_ID,
  applyLocalGuardMode,
  getFallbackCustomerDash,
  listFallbackSites,
  markSecurityUiReady,
} from "./security-floor-fallback-v1.js";
import { updateSecurityIso3d } from "./security-floor-iso3d-v1.js";

const state = {
  siteId: FALLBACK_DEFAULT_SITE_ID,
  floorId: "1f",
  dash: null,
  pane: "map",
  pollTimer: null,
  alarmSig: "",
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
  const allow = new Set(["SEC-JP-ITABASHI-LIVE"]);
  const raw = sites?.length ? sites : listFallbackSites();
  const list = [...raw]
    .filter((s) => allow.has(s.siteId || s.id))
    .sort((a, b) => {
      const aid = a.siteId || a.id;
      const bid = b.siteId || b.id;
      if (aid === "SEC-JP-ITABASHI-LIVE") return -1;
      if (bid === "SEC-JP-ITABASHI-LIVE") return 1;
      return 0;
    });
  if (!list.length) {
    list.push({
      id: "SEC-JP-ITABASHI-LIVE",
      siteId: "SEC-JP-ITABASHI-LIVE",
      displayName: "板橋自宅",
      countryCode: "JP",
    });
  }
  sel.innerHTML = list
    .map((s) => {
      const id = s.siteId || s.id;
      const label =
        id === "SEC-JP-ITABASHI-LIVE"
          ? "板橋自宅 (HOME-JP-ITABASHI-LIVE)"
          : s.displayName;
      return `<option value="${id}">${label}</option>`;
    })
    .join("");
  state.siteId = "SEC-JP-ITABASHI-LIVE";
  sel.value = state.siteId;
  sel.disabled = list.length <= 1;
}

function syncCustomerHeaderTitle() {
  const title = "板橋自宅 (HOME-JP-ITABASHI-LIVE)";
  const el = $("sf-title");
  if (el) el.textContent = title;
  document.title = `TiSLY · ${title}`;
}

function openAlarms(soc) {
  return (soc?.alarmLogs || []).filter((l) => l.status !== "done");
}

function alarmSignature(dash) {
  const open = openAlarms(dash?.soc);
  return [
    dash?.status || "",
    String(open.length),
    open.map((a) => `${a.id}:${a.at}:${a.kindLabel}`).join("|"),
  ].join("::");
}

function renderDash(dash, opts = {}) {
  if (!dash) return;
  try {
    const soft = !!opts.soft;
    const nextSig = alarmSignature(dash);
    if (soft && state.dash && nextSig === state.alarmSig) {
      return;
    }
    state.dash = dash;
    state.alarmSig = nextSig;
    syncCustomerHeaderTitle();
    const open = openAlarms(dash.soc);
    const alerting = open.length > 0 || dash.status === "alert";
    setText("sf-status-emoji", alerting ? "🚨" : "🟢");
    setText(
      "sf-status-label",
      alerting
        ? "異常があります"
        : dash.statusLabel || "正常に動いています"
    );
    setText("sf-guard-label", dash.guardModeLabel || "—");
    if (!soft) {
      const floors = dash.floors || [];
      setHtml(
        "sf-floor-tabs",
        renderSocLayerButtons(floors, state.floorId, dash)
      );
      setHtml(
        "sf-map-wrap",
        renderIsoStack(dash, state.floorId, { showCameras: false })
      );
      setHtml("sf-modes", renderGuardModes(dash.guardMode));
      setHtml(
        "sf-notes",
        (dash.notes || []).map((n) => `<li>${n}</li>`).join("")
      );
    }
    $("sf-alarm-panel")?.classList.toggle("is-live", open.length > 0);
    setHtml(
      "sf-alarm-list",
      open
        .map(
          (a) =>
            `<li><b>🔴 【発報中】${a.kindLabel || "センサー検知"}</b><span>（${formatAlarmTime(a.at)}）</span></li>`
        )
        .join("") || "<li>異常はありません</li>"
    );
    const logs = dash.soc?.alarmLogs || [];
    const recent = logs.slice(0, 10);
    setHtml(
      "sf-log-compact",
      recent
        .map((l) => {
          const ico = /侵入|警報|開放|人感|センサー検知/.test(l.kindLabel || "")
            ? "🚨"
            : /ライト|照明/.test(l.kindLabel || "")
              ? "💡"
              : "🛡️";
          return `<article class="sf-log-row">
            <span class="sf-log-ico">${ico}</span>
            <div class="sf-log-main">
              <p class="sf-log-title">${l.kindLabel} · ${l.location}</p>
              <p class="sf-log-sub">${l.deviceLabel || ""}</p>
            </div>
            <time class="sf-log-time">${formatAlarmTime(l.at)}</time>
          </article>`;
        })
        .join("") ||
        '<p class="sf-log-empty">まだできごとはありません</p>'
    );
    setHtml(
      "sf-log-body",
      logs
        .map((l) => {
          const st = l.status === "done" ? "確認済み" : "お知らせ";
          return `<tr><td>${formatAlarmTime(l.at)}</td><td>${l.location}</td><td>${l.kindLabel}</td><td>${st}</td></tr>`;
        })
        .join("")
    );
    if (!soft) {
      bindSecurityOrbit();
      applySecurityOrbit();
      setSecurityDrumFloor(state.floorId);
      updateSecurityIso3d(dash, state.floorId, { showCameras: false }).catch(
        (e) => {
          console.warn("[security-customer] iso3d", e);
        }
      );
      markSecurityUiReady();
    } else {
      try {
        window.TislySecurityIso3d?.setAlert?.(alerting);
      } catch (_e) {
        /* ignore */
      }
    }
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

async function loadDash(opts = {}) {
  try {
    const data = await fetchJson(
      `/api/security-floor/v1/customer?siteId=${encodeURIComponent(state.siteId)}`
    );
    if (data.dashboard) renderDash(data.dashboard, opts);
  } catch (err) {
    if (!state.dash) bootFallback();
    console.warn("[security-customer] API fallback", err);
  }
}

function startAlarmPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(() => {
    loadDash({ soft: true }).catch(() => {});
  }, 2000);
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

async function toggleDemoAlert() {
  try {
    const data = await fetchJson("/api/security-floor/v1/test-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: state.siteId }),
    });
    if (data.dashboard) renderDash(data.dashboard);
    else await loadDash();
  } catch {
    await loadDash();
  }
}

function bind() {
  document.addEventListener("tisly-sf-floor", (e) => {
    const id = e.detail?.id;
    if (id) state.floorId = id;
  });
  $("sf-site-select")?.addEventListener("change", (e) => {
    const next = e.target.value;
    state.siteId =
      next === "SEC-JP-ITABASHI-LIVE"
        ? next
        : "SEC-JP-ITABASHI-LIVE";
    e.target.value = state.siteId;
    bootFallback();
    loadDash().catch(() => {});
  });

  if (!window.__TISLY_SF_ALARM_BOUND) {
    window.__TISLY_SF_ALARM_BOUND = true;
    $("sf-demo-alert")?.addEventListener("click", () => {
      toggleDemoAlert().catch(() => {});
    });
  }

  startAlarmPolling();

  if (window.__TISLY_SF_CTRL_BOUND) return;
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
  $("sf-log-open-detail")?.addEventListener("click", () => {
    $("sf-log-dialog")?.showModal?.();
  });
  document.querySelectorAll(".sf-mobile-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.pane = btn.getAttribute("data-pane");
      document
        .querySelectorAll(".sf-mobile-tabs button")
        .forEach((b) => b.classList.toggle("is-on", b === btn));
      document.body.setAttribute("data-pane", state.pane);
      const target = document.querySelector(
        `.sf-soc-shell [data-pane="${state.pane}"]`
      );
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
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
