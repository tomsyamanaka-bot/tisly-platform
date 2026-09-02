/**
 * お客様向け見守り
 * 3D俯瞰とやさしい警報表示
 * 物件セレクタはマスターから動的読込
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
import {
  hideToyoshimaDashboard,
  isToyoshimaSecuritySite,
  loadToyoshimaDashboard,
  setToyoshimaCustomerPane,
  startToyoshimaPolling,
  stopToyoshimaPolling,
  TOYOSHIMA_SEC_ID,
} from "./toyoshima-security-dashboard-v1.js";
import {
  isLoggedIn,
  refreshTenantProfile,
  requireCustomerSession,
  resolveSecuritySiteId,
} from "../../customer-tenant-session-v1.js";

const SITE_STORAGE_KEY = "tisly_customer_security_site_v1";

const state = {
  siteId: FALLBACK_DEFAULT_SITE_ID,
  siteOptions: [],
  defaultSiteId: FALLBACK_DEFAULT_SITE_ID,
  layoutSiteId: null,
  floorId: "1f",
  dash: null,
  pane: "map",
  pollTimer: null,
  alarmSig: "",
  tenantReady: false,
  tenantSiteId: null,
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

function customerSiteTitle(label) {
  return String(label || "")
    .replace(/\s*\(HOME-JP-[^)]+\)/gi, "")
    .replace(/\s*\(SEC-JP-[^)]+\)/gi, "")
    .replace(/\s*\(Toyoshima Residence\)/gi, "")
    .trim();
}

function normalizeSiteOption(row) {
  const siteId = row?.siteId || row?.id || "";
  return {
    siteId,
    displayName: customerSiteTitle(row?.displayName || siteId),
    propertyId: row?.propertyId ?? row?.homeSiteId ?? null,
    useToyoshimaDashboard: Boolean(row?.useToyoshimaDashboard),
  };
}

function resolveInitialSiteId(options, preferredId) {
  const ids = new Set(options.map((o) => o.siteId));
  const saved = sessionStorage.getItem(SITE_STORAGE_KEY);
  if (saved && ids.has(saved)) return saved;
  if (preferredId && ids.has(preferredId)) return preferredId;
  if (state.defaultSiteId && ids.has(state.defaultSiteId)) {
    return state.defaultSiteId;
  }
  return options[0]?.siteId || FALLBACK_DEFAULT_SITE_ID;
}

function syncSiteSelectorUi() {
  const sel = $("sf-site-select");
  if (!sel) return;
  sel.hidden = false;
  sel.removeAttribute("aria-hidden");
  $("sf-soc-meta")?.classList.remove("sf-tenant-fixed");
  sel.disabled = state.siteOptions.length <= 1;
  sel.value = state.siteId;
}

function fillSites(apiSites, defaultSiteId) {
  const sel = $("sf-site-select");
  if (!sel) return;

  const raw = apiSites?.length ? apiSites : listFallbackSites();
  state.siteOptions = raw.map(normalizeSiteOption).filter((s) => s.siteId);
  if (defaultSiteId) state.defaultSiteId = defaultSiteId;

  if (!state.siteOptions.length) {
    state.siteOptions = listFallbackSites().map(normalizeSiteOption);
  }

  sel.innerHTML = state.siteOptions
    .map(
      (s) =>
        `<option value="${s.siteId}">${escapeHtml(s.displayName)}</option>`
    )
    .join("");

  state.siteId = resolveInitialSiteId(
    state.siteOptions,
    state.tenantSiteId || resolveSecuritySiteId()
  );
  sel.value = state.siteId;
  window.__TISLY_SF_SITE_ID = state.siteId;
  sessionStorage.setItem(SITE_STORAGE_KEY, state.siteId);
  syncSiteSelectorUi();
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function syncCustomerHeaderTitle() {
  const row = state.siteOptions.find((s) => s.siteId === state.siteId);
  let title = row?.displayName || "TiSLY Security";
  if (!row && state.tenantReady) {
    const profile = JSON.parse(
      sessionStorage.getItem("tisly_tenant_profile_v1") ||
        localStorage.getItem("tisly_tenant_profile_v1") ||
        "null"
    );
    if (profile?.displayName) {
      title = customerSiteTitle(profile.displayName);
    }
  } else if (!row && state.dash?.displayName) {
    title = customerSiteTitle(state.dash.displayName);
  }
  const el = $("sf-title");
  if (el) el.textContent = title;
  document.title = `TiSLY · ${title}`;
}

function applySiteLayout(force = false) {
  const isToyoshima = isToyoshimaSecuritySite(state.siteId);
  document.body.classList.toggle("is-toyoshima", isToyoshima);

  if (!force && state.layoutSiteId === state.siteId) {
    return;
  }
  state.layoutSiteId = state.siteId;

  if (isToyoshima) {
    loadToyoshimaDashboard().catch(() => {});
    startToyoshimaPolling();
    setToyoshimaCustomerPane(state.pane || "map");
  } else {
    stopToyoshimaPolling();
    hideToyoshimaDashboard();
  }
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
  if (isToyoshimaSecuritySite(state.siteId)) {
    syncCustomerHeaderTitle();
    return;
  }
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
  fillSites(listFallbackSites(), FALLBACK_DEFAULT_SITE_ID);
  applySiteLayout(true);
  if (!isToyoshimaSecuritySite(state.siteId)) {
    renderDash(getFallbackCustomerDash(state.siteId));
  }
}

async function loadSites() {
  try {
    const data = await fetchJson("/api/security-floor/v1/customer-sites");
    fillSites(data.sites, data.defaultSiteId);
  } catch {
    fillSites(listFallbackSites(), FALLBACK_DEFAULT_SITE_ID);
  }
}

async function loadDash(opts = {}) {
  if (isToyoshimaSecuritySite(state.siteId)) {
    syncCustomerHeaderTitle();
    return;
  }
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

async function switchCustomerSite(nextSiteId) {
  const allowed = state.siteOptions.some((s) => s.siteId === nextSiteId);
  if (!allowed) return;
  if (nextSiteId === state.siteId) return;

  state.siteId = nextSiteId;
  state.layoutSiteId = null;
  state.dash = null;
  state.alarmSig = "";
  state.floorId = "1f";
  window.__TISLY_SF_SITE_ID = nextSiteId;
  sessionStorage.setItem(SITE_STORAGE_KEY, nextSiteId);

  syncCustomerHeaderTitle();
  applySiteLayout(true);

  if (isToyoshimaSecuritySite(state.siteId)) {
    await loadToyoshimaDashboard();
  } else {
    await loadDash();
  }
}

function startAlarmPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(() => {
    if (isToyoshimaSecuritySite(state.siteId)) return;
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
    switchCustomerSite(next).catch((err) => {
      console.warn("[security-customer] site switch", err);
      e.target.value = state.siteId;
    });
  });

  if (!window.__TISLY_SF_ALARM_BOUND) {
    window.__TISLY_SF_ALARM_BOUND = true;
    $("sf-demo-alert")?.addEventListener("click", () => {
      toggleDemoAlert().catch(() => {});
    });
  }

  if (window.__TISLY_SF_CTRL_BOUND) return;
  window.__TISLY_SF_CTRL_BOUND = true;
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
      if (isToyoshimaSecuritySite(state.siteId)) {
        setToyoshimaCustomerPane(state.pane);
        return;
      }
      const target = document.querySelector(
        `.sf-soc-shell [data-pane="${state.pane}"]`
      );
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

async function initTenantSecurity() {
  if (!requireCustomerSession()) return false;
  if (!isLoggedIn()) return false;
  await refreshTenantProfile();
  const siteId = resolveSecuritySiteId();
  if (!siteId) {
    console.warn("[security-customer] tenant site missing");
    return false;
  }
  state.tenantReady = true;
  state.tenantSiteId = siteId;
  state.layoutSiteId = null;
  window.__TISLY_SF_SITE_ID = siteId;
  return true;
}

async function boot() {
  bind();
  document.body.setAttribute("data-pane", state.pane || "map");
  const tenantOk = await initTenantSecurity();
  if (!tenantOk) return;
  await loadSites();
  applySiteLayout(true);
  syncCustomerHeaderTitle();
  if (!isToyoshimaSecuritySite(state.siteId)) {
    await loadDash();
  }
  startAlarmPolling();
}

boot().catch((err) => {
  bootFallback();
  console.warn("[security-customer] boot", err);
});
