/**
 * 社内 Security の「選択中の現場のみ通知」。
 * 既定は OFF（全現場）。ON のときだけ、このブラウザの Push をその現場に絞る。
 */

import { getPropertyScope } from "../../shared/property-scope-v1.js";

const STORAGE_KEY = "tisly.staffNotifyFocus.v1";

function $(id) {
  return document.getElementById(id);
}

function emptyFocus() {
  return { enabled: false, siteId: "", propertyId: "" };
}

export function readStaffNotifyFocusLocalV1() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyFocus();
    const data = JSON.parse(raw);
    return {
      enabled: Boolean(data.enabled),
      siteId: String(data.siteId || ""),
      propertyId: String(data.propertyId || ""),
    };
  } catch {
    return emptyFocus();
  }
}

function writeStaffNotifyFocusLocalV1(state) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      enabled: Boolean(state.enabled),
      siteId: String(state.siteId || ""),
      propertyId: String(state.propertyId || ""),
    })
  );
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

async function currentPushEndpoint() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "";
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager?.getSubscription();
    return String(sub?.endpoint || "");
  } catch {
    return "";
  }
}

function tellServiceWorker(state) {
  const worker = navigator.serviceWorker?.controller;
  if (!worker) return;
  const siteIds = [state.siteId, state.propertyId].filter(Boolean);
  worker.postMessage({
    type: "STAFF_NOTIFY_FOCUS",
    enabled: Boolean(state.enabled),
    siteIds,
  });
}

async function syncStaffNotifyFocusV1(state) {
  const next = {
    enabled: Boolean(state.enabled),
    siteId: String(state.siteId || ""),
    propertyId: String(state.propertyId || ""),
  };
  writeStaffNotifyFocusLocalV1(next);
  tellServiceWorker(next);
  const toggle = $("sf-notify-focus-toggle");
  if (toggle) {
    toggle.checked = next.enabled;
    toggle.setAttribute("aria-checked", next.enabled ? "true" : "false");
  }
  const endpoint = await currentPushEndpoint();
  if (!endpoint) return { ok: true, localOnly: true };
  const res = await fetch("/api/notifications/staff-focus", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint,
      enabled: next.enabled,
      siteId: next.siteId,
      propertyId: next.propertyId,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `通知絞り込みの保存に失敗 (${res.status})`);
  }
  return data;
}

async function hydrateFromServer() {
  const endpoint = await currentPushEndpoint();
  if (!endpoint) {
    const local = readStaffNotifyFocusLocalV1();
    tellServiceWorker(local);
    return local;
  }
  const res = await fetch(
    `/api/notifications/staff-focus?endpoint=${encodeURIComponent(endpoint)}`
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) return readStaffNotifyFocusLocalV1();
  const server = {
    enabled: Boolean(data.enabled),
    siteId: String(data.siteId || ""),
    propertyId: String(data.propertyId || ""),
  };
  writeStaffNotifyFocusLocalV1(server);
  tellServiceWorker(server);
  return server;
}

function mountStaffNotifyFocusToggleV1() {
  const box = $("sf-notify-focus");
  const toggle = $("sf-notify-focus-toggle");
  if (!box || !toggle) return;
  if (document.body?.classList?.contains("sf-customer")) {
    box.hidden = true;
    return;
  }
  const local = readStaffNotifyFocusLocalV1();
  toggle.checked = local.enabled;
  toggle.setAttribute("aria-checked", local.enabled ? "true" : "false");

  toggle.addEventListener("change", () => {
    const site = currentSiteFocus();
    syncStaffNotifyFocusV1({
      enabled: toggle.checked,
      siteId: site.siteId,
      propertyId: site.propertyId,
    }).catch((err) => {
      console.warn("[staff-notify-focus]", err);
    });
  });

  window.addEventListener("tisly-property-scope-change", () => {
    if (!toggle.checked) return;
    const site = currentSiteFocus();
    syncStaffNotifyFocusV1({
      enabled: true,
      siteId: site.siteId,
      propertyId: site.propertyId,
    }).catch((err) => {
      console.warn("[staff-notify-focus]", err);
    });
  });

  window.addEventListener("tisly-staff-push-subscribed", () => {
    const site = currentSiteFocus();
    syncStaffNotifyFocusV1({
      enabled: toggle.checked,
      siteId: site.siteId,
      propertyId: site.propertyId,
    }).catch((err) => {
      console.warn("[staff-notify-focus]", err);
    });
  });

  hydrateFromServer()
    .then((state) => {
      toggle.checked = Boolean(state.enabled);
      toggle.setAttribute("aria-checked", state.enabled ? "true" : "false");
      if (!state.enabled) return;
      const site = currentSiteFocus();
      if (!site.siteId) return;
      if (site.siteId === state.siteId && site.propertyId === state.propertyId) {
        return;
      }
      return syncStaffNotifyFocusV1({
        enabled: true,
        siteId: site.siteId,
        propertyId: site.propertyId,
      });
    })
    .catch((err) => {
      console.warn("[staff-notify-focus]", err);
    });
}

mountStaffNotifyFocusToggleV1();
