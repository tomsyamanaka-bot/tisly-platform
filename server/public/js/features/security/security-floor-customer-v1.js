/**
 * お客様向け見守り
 * 3D俯瞰とやさしい警報表示
 * ログイン後は自邸1件に完全固定
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
} from "./toyoshima-security-dashboard-v1.js";
import {
  getCustomerCode,
  getCustomerToken,
  isLoggedIn,
  loadTenantProfile,
  refreshTenantProfile,
  requireCustomerSession,
  resolveSecuritySiteId,
} from "../../customer-tenant-session-v1.js";
import { setPropertyScope } from "../../shared/property-scope-v1.js";
import { openCustomerCameraPreview } from "../../camera-webrtc-viewer-v1.js";
import { resolveHomeSiteId } from "./security-floor-remote-config-v1.js";

const HOME_API = "/api/home/v1";

const state = {
  siteId: FALLBACK_DEFAULT_SITE_ID,
  siteOptions: [],
  propertyId: null,
  layoutSiteId: null,
  floorId: "1f",
  dash: null,
  pane: "map",
  pollTimer: null,
  alarmSig: "",
  tenantReady: false,
  tenantSiteId: null,
  locked: true,
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
  const headers = { ...(opts?.headers || {}) };
  const token = getCustomerToken();
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    cache: "no-store",
    ...opts,
    headers,
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

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ensureFixedSiteLabel() {
  const meta = $("sf-soc-meta");
  if (!meta) return null;
  let fixed = $("sf-site-fixed-label");
  if (fixed) return fixed;
  fixed = document.createElement("span");
  fixed.id = "sf-site-fixed-label";
  fixed.className = "sf-site-fixed-label";
  fixed.setAttribute("aria-label", "ご契約のおうち");
  const sel = $("sf-site-select");
  if (sel) meta.insertBefore(fixed, sel);
  else meta.prepend(fixed);
  return fixed;
}

/** セレクタ非表示 · 自邸名のみ表示 */
function lockSiteSelectorUi(displayName) {
  const sel = $("sf-site-select");
  const title = customerSiteTitle(displayName) || "ご契約のおうち";
  if (sel) {
    sel.innerHTML = `<option value="${escapeHtml(state.siteId)}">${escapeHtml(title)}</option>`;
    sel.value = state.siteId;
    sel.hidden = true;
    sel.disabled = true;
    sel.setAttribute("aria-hidden", "true");
  }
  $("sf-soc-meta")?.classList.add("sf-tenant-fixed");
  const fixed = ensureFixedSiteLabel();
  if (fixed) {
    fixed.textContent = title;
    fixed.hidden = false;
  }
}

function publishTenantScope(displayName) {
  setPropertyScope({
    siteId: state.siteId,
    propertyId: state.propertyId || state.siteId,
    displayName: customerSiteTitle(displayName),
    locked: true,
    source: "customer-tenant",
    persist: false,
  });
}

function syncCustomerHeaderTitle() {
  const row = state.siteOptions.find((s) => s.siteId === state.siteId);
  let title = row?.displayName || "TiSLY Security";
  if (!row && state.tenantReady) {
    const profile = loadTenantProfile();
    if (profile?.displayName) {
      title = customerSiteTitle(profile.displayName);
    }
  } else if (!row && state.dash?.displayName) {
    title = customerSiteTitle(state.dash.displayName);
  }
  title = customerSiteTitle(title);
  const el = $("sf-title");
  if (el) el.textContent = title;
  document.title = `TiSLY · ${title}`;
  const fixed = $("sf-site-fixed-label");
  if (fixed) fixed.textContent = title;
}

/**
 * テナント自邸のみを確定（他物件遮断）
 */
function applyTenantSingleSite(sites, preferredId) {
  const profile = loadTenantProfile();
  const tenantId =
    preferredId ||
    state.tenantSiteId ||
    resolveSecuritySiteId() ||
    FALLBACK_DEFAULT_SITE_ID;

  const fromApi = (sites || []).find((s) => s.siteId === tenantId);
  const fallback = listFallbackSites().find(
    (s) => (s.siteId || s.id) === tenantId
  );
  const displayName = customerSiteTitle(
    fromApi?.displayName ||
      profile?.displayName ||
      fallback?.displayName ||
      "ご契約のおうち"
  );
  const propertyId =
    fromApi?.propertyId ||
    fromApi?.homeSiteId ||
    profile?.homeSiteId ||
    fallback?.propertyId ||
    null;

  state.locked = true;
  state.siteId = tenantId;
  state.propertyId = propertyId;
  state.siteOptions = [
    {
      siteId: tenantId,
      displayName,
      propertyId,
      useToyoshimaDashboard:
        Boolean(fromApi?.useToyoshimaDashboard) ||
        Boolean(profile?.useToyoshimaDashboard) ||
        isToyoshimaSecuritySite(tenantId),
    },
  ];
  lockSiteSelectorUi(displayName);
  publishTenantScope(displayName);
  syncCustomerHeaderTitle();
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
  const profile = loadTenantProfile();
  applyTenantSingleSite(
    listFallbackSites().map((s) => ({
      siteId: s.siteId || s.id,
      displayName: s.displayName,
      propertyId: s.propertyId || null,
      useToyoshimaDashboard: isToyoshimaSecuritySite(s.siteId || s.id),
    })),
    profile?.securitySiteId || resolveSecuritySiteId()
  );
  applySiteLayout(true);
  if (!isToyoshimaSecuritySite(state.siteId)) {
    renderDash(getFallbackCustomerDash(state.siteId));
  }
}

async function loadTenantSites() {
  try {
    const data = await fetchJson("/api/security-floor/v1/customer-sites");
    applyTenantSingleSite(data.sites, data.defaultSiteId);
  } catch {
    applyTenantSingleSite([], resolveSecuritySiteId());
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

let customerLightSaveTimer = null;

function bindCustomerLightSlider() {
  const slider = $("sf-customer-lighting-duration");
  if (!slider || slider.dataset.bound === "1") return;
  slider.dataset.bound = "1";
  slider.addEventListener("input", () => {
    const sec = Number(slider.value) || 45;
    setText("sf-customer-lighting-duration-val", `${sec}秒`);
    clearTimeout(customerLightSaveTimer);
    customerLightSaveTimer = setTimeout(() => {
      saveCustomerLightDuration(sec).catch(() => {});
    }, 600);
  });
}

async function loadCustomerLightDuration() {
  if (isToyoshimaSecuritySite(state.siteId)) return;
  const homeSiteId = resolveHomeSiteId(state.siteId);
  try {
    const data = await fetchJson(
      `${HOME_API}/security-rules?siteId=${encodeURIComponent(homeSiteId)}`
    );
    const sec = data.rules?.lightingDurationSec ?? 45;
    const slider = $("sf-customer-lighting-duration");
    if (slider) slider.value = String(sec);
    setText("sf-customer-lighting-duration-val", `${sec}秒`);
  } catch {
    /* 未取得でもスライダーは操作可能 */
  }
}

async function saveCustomerLightDuration(sec) {
  const homeSiteId = resolveHomeSiteId(state.siteId);
  await fetchJson(`${HOME_API}/security-rules`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      siteId: homeSiteId,
      actor: "customer-portal",
      lightingDurationSec: sec,
      di1DurationSec: sec,
    }),
  });
}

function bindCustomerCamera() {
  $("sf-customer-camera")?.addEventListener("click", () => {
    openCustomerCameraPreview().catch((err) => {
      console.warn("[security-customer] camera", err);
    });
  });
}

function bind() {
  bindCustomerLightSlider();
  bindCustomerCamera();
  document.addEventListener("tisly-sf-floor", (e) => {
    const id = e.detail?.id;
    if (id) state.floorId = id;
  });
  // 顧客は物件切替不可（選択変更を無視）
  $("sf-site-select")?.addEventListener("change", (e) => {
    e.target.value = state.siteId;
  });

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
    console.warn("[security-customer] tenant site missing", getCustomerCode());
    return false;
  }
  state.tenantReady = true;
  state.tenantSiteId = siteId;
  state.layoutSiteId = null;
  state.locked = true;
  return true;
}

async function boot() {
  bind();
  document.body.setAttribute("data-pane", state.pane || "map");
  const tenantOk = await initTenantSecurity();
  if (!tenantOk) return;
  await loadTenantSites();
  applySiteLayout(true);
  syncCustomerHeaderTitle();
  if (!isToyoshimaSecuritySite(state.siteId)) {
    await loadDash();
    await loadCustomerLightDuration();
  }
  startAlarmPolling();
}

boot().catch((err) => {
  bootFallback();
  console.warn("[security-customer] boot", err);
});
