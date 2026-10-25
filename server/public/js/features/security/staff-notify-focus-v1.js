/**
 * 社内 Security の「選択中の現場のみ通知」。
 * 既定は OFF（全現場）。ON/OFF は現場ごとに別々に保存する。
 */

import { getPropertyScope } from "../../shared/property-scope-v1.js";

const STORAGE_KEY = "tisly.staffNotifyFocus.v1";
const ENDPOINT_KEY = "tisly.staffNotifyFocus.endpoint.v1";
const STAFF_PUSH_USER_ID = "toms-ops";

function $(id) {
  return document.getElementById(id);
}

function emptyStore() {
  return { bySite: {}, activeSiteId: "" };
}

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const data = JSON.parse(raw);
    if (data?.bySite && typeof data.bySite === "object") {
      return {
        bySite: data.bySite,
        activeSiteId: String(data.activeSiteId || ""),
      };
    }
    const bySite = {};
    const siteId = String(data?.siteId || "");
    if (siteId) bySite[siteId] = Boolean(data?.enabled);
    return { bySite, activeSiteId: siteId };
  } catch {
    return emptyStore();
  }
}

function writeStore(store) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      bySite: store.bySite || {},
      activeSiteId: String(store.activeSiteId || ""),
    })
  );
}

export function readStaffNotifyFocusLocalV1() {
  const site = currentSiteFocus();
  const store = readStore();
  const siteId = site.siteId || store.activeSiteId;
  return {
    enabled: Boolean(siteId && store.bySite[siteId]),
    siteId,
    propertyId: site.propertyId,
  };
}

function rememberLocalSite(siteId, enabled) {
  const store = readStore();
  if (siteId) store.bySite[siteId] = Boolean(enabled);
  store.activeSiteId = siteId || store.activeSiteId;
  writeStore(store);
}

function currentSiteFocus() {
  const scope = getPropertyScope();
  const select = $("sf-site-select");
  const siteId = String(
    scope.selectedSiteId || select?.value || window.__TISLY_SF_SITE_ID || ""
  ).trim();
  const propertyId = String(
    scope.selectedPropertyId || window.__TISLY_SELECTED_PROPERTY_ID || siteId
  ).trim();
  return { siteId, propertyId };
}

function siteFromEvent(event) {
  const detail = event?.detail;
  const siteId = String(detail?.selectedSiteId || detail?.siteId || "").trim();
  if (!siteId) return currentSiteFocus();
  const propertyId = String(
    detail?.selectedPropertyId || detail?.propertyId || siteId
  ).trim();
  return { siteId, propertyId };
}

function rememberEndpoint(endpoint) {
  const value = String(endpoint || "").trim();
  if (!value) return "";
  try {
    localStorage.setItem(ENDPOINT_KEY, value);
  } catch {
    /* 保存できない端末でも配信側のユーザー設定は残る */
  }
  return value;
}

function rememberedEndpoint() {
  try {
    return String(localStorage.getItem(ENDPOINT_KEY) || "").trim();
  } catch {
    return "";
  }
}

async function currentPushEndpoint() {
  if (!("serviceWorker" in navigator)) return rememberedEndpoint();
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      const sub = await reg.pushManager?.getSubscription();
      if (sub?.endpoint) return rememberEndpoint(sub.endpoint);
    }
  } catch {
    /* 購読を読めないときは直前のエンドポイントを使う */
  }
  return rememberedEndpoint();
}

function paintToggle(enabled) {
  const toggle = $("sf-notify-focus-toggle");
  if (!toggle) return;
  toggle.checked = Boolean(enabled);
  toggle.setAttribute("aria-checked", enabled ? "true" : "false");
}

function tellServiceWorker(state) {
  const siteIds = [state.siteId, state.propertyId].filter(Boolean);
  const message = {
    type: "STAFF_NOTIFY_FOCUS",
    enabled: Boolean(state.enabled),
    siteIds,
  };
  const post = (worker) => {
    try {
      worker?.postMessage(message);
    } catch {
      /* 制御外のワーカー */
    }
  };
  post(navigator.serviceWorker?.controller);
  navigator.serviceWorker
    ?.getRegistrations?.()
    .then((regs) => {
      for (const reg of regs) post(reg.active);
    })
    .catch(() => {});
}

async function preferenceQuery(site) {
  const endpoint = await currentPushEndpoint();
  const params = new URLSearchParams({ userId: STAFF_PUSH_USER_ID });
  if (endpoint) params.set("endpoint", endpoint);
  if (site?.siteId) params.set("siteId", site.siteId);
  if (site?.propertyId) params.set("propertyId", site.propertyId);
  return { endpoint, params };
}

function applyServerMap(data, site, enabled) {
  const store = readStore();
  if (data?.muteBySite && typeof data.muteBySite === "object") {
    store.bySite = { ...data.muteBySite };
  }
  if (site?.siteId) store.bySite[site.siteId] = Boolean(enabled);
  store.activeSiteId = String(data?.activeSiteId || site?.siteId || "");
  writeStore(store);
}

/** 現場を変えたとき。前のチェックは送らず、選択中の現場だけを記録する。 */
async function rememberActiveSiteV1(site, endpoint) {
  const res = await fetch("/api/user/preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint,
      userId: STAFF_PUSH_USER_ID,
      siteId: site.siteId,
      activeSiteId: site.siteId,
      propertyId: site.propertyId,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `通知絞り込みの保存に失敗 (${res.status})`);
  }
  return data;
}

async function saveMuteForCurrentSiteV1(site, enabled) {
  const endpoint = await currentPushEndpoint();
  const body = {
    endpoint,
    userId: STAFF_PUSH_USER_ID,
    enabled: Boolean(enabled),
    muteOtherSites: Boolean(enabled),
    siteId: site.siteId,
    activeSiteId: site.siteId,
    propertyId: site.propertyId,
  };
  const pref = await fetch("/api/user/preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const prefData = await pref.json().catch(() => ({}));
  if (!pref.ok || prefData.ok === false) {
    throw new Error(
      prefData.error || `通知絞り込みの保存に失敗 (${pref.status})`
    );
  }
  if (endpoint) {
    const res = await fetch("/api/notifications/staff-focus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `通知絞り込みの保存に失敗 (${res.status})`);
    }
  }
  applyServerMap(prefData, site, enabled);
  tellServiceWorker({ enabled, siteId: site.siteId, propertyId: site.propertyId });
  return prefData;
}

async function loadMuteForSiteV1(site) {
  const { endpoint, params } = await preferenceQuery(site);
  const res = await fetch(`/api/user/preferences?${params.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const store = readStore();
    return {
      ok: false,
      enabled: Boolean(site.siteId && store.bySite[site.siteId]),
      endpoint,
      data,
    };
  }
  return {
    ok: true,
    enabled: Boolean(data.muteOtherSites),
    endpoint,
    data,
  };
}

let preferenceQueue = Promise.resolve();

function enqueuePreference(task) {
  const run = preferenceQueue.then(task, task);
  preferenceQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function mountStaffNotifyFocusToggleV1() {
  const box = $("sf-notify-focus");
  const toggle = $("sf-notify-focus-toggle");
  if (!box || !toggle) return;
  if (document.body?.classList?.contains("sf-customer")) {
    box.hidden = true;
    return;
  }
  const initial = readStaffNotifyFocusLocalV1();
  paintToggle(initial.enabled);
  let hydrated = false;
  let siteSeq = 0;

  async function showSiteMute(site) {
    const seq = ++siteSeq;
    if (!site?.siteId) return;
    const cached = Boolean(readStore().bySite[site.siteId]);
    paintToggle(cached);
    tellServiceWorker({
      enabled: cached,
      siteId: site.siteId,
      propertyId: site.propertyId,
    });
    const loaded = await loadMuteForSiteV1(site);
    if (seq !== siteSeq) return;
    paintToggle(loaded.enabled);
    applyServerMap(loaded.data, site, loaded.enabled);
    tellServiceWorker({
      enabled: loaded.enabled,
      siteId: site.siteId,
      propertyId: site.propertyId,
    });
    if (!loaded.ok || seq !== siteSeq) return;
    await enqueuePreference(() => rememberActiveSiteV1(site, loaded.endpoint));
  }

  toggle.addEventListener("change", () => {
    const site = currentSiteFocus();
    siteSeq += 1;
    paintToggle(toggle.checked);
    rememberLocalSite(site.siteId, toggle.checked);
    enqueuePreference(() => saveMuteForCurrentSiteV1(site, toggle.checked)).catch(
      (err) => {
        console.warn("[staff-notify-focus]", err);
      }
    );
  });

  function onSiteChanged(event) {
    if (!hydrated) return;
    const site = siteFromEvent(event);
    showSiteMute(site).catch((err) => {
      console.warn("[staff-notify-focus]", err);
    });
  }

  window.addEventListener("tisly-property-scope-change", onSiteChanged);
  $("sf-site-select")?.addEventListener("change", () => {
    if (!hydrated) return;
    showSiteMute(currentSiteFocus()).catch((err) => {
      console.warn("[staff-notify-focus]", err);
    });
  });

  window.addEventListener("tisly-staff-push-subscribed", (event) => {
    const endpoint = event?.detail?.endpoint;
    if (endpoint) rememberEndpoint(endpoint);
    const site = currentSiteFocus();
    enqueuePreference(() =>
      saveMuteForCurrentSiteV1(site, toggle.checked)
    ).catch((err) => {
      console.warn("[staff-notify-focus]", err);
    });
  });

  hydrated = true;
  showSiteMute(currentSiteFocus())
    .then(() => {
      hydrated = true;
    })
    .catch((err) => {
      hydrated = true;
      console.warn("[staff-notify-focus]", err);
    });
}

mountStaffNotifyFocusToggleV1();
