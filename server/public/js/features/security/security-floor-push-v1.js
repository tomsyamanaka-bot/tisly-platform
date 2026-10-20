/**
 * TiSLY Security — Web Push 再登録・購読 v1
 * 解除 → APNs/WebPush 再購読 → POST /api/notifications/subscribe
 */

import { showSecurityRemoteToastV1 } from "./security-floor-remote-config-v1.js";
import { getPropertyScope } from "../../shared/property-scope-v1.js";
import {
  getCustomerCode,
  loadTenantProfile,
} from "../../customer-tenant-session-v1.js";

function $(id) {
  return document.getElementById(id);
}

function isStandalonePwa() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean(/** @type {{ standalone?: boolean }} */ (navigator).standalone)
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function describePushEndpoint(endpoint) {
  if (!endpoint) return { host: "—", apple: false, tail: "—" };
  let host = "—";
  try {
    host = new URL(endpoint).host;
  } catch {
    /* ignore */
  }
  const apple =
    /web\.push\.apple\.com/i.test(endpoint) || /apple/i.test(host);
  const tail =
    endpoint.length > 40 ? endpoint.slice(-40) : endpoint;
  return { host, apple, tail };
}

function isCustomerPushScreen() {
  return (
    document.body?.classList?.contains("sf-customer") ||
    String(location.pathname || "").includes("/customer")
  );
}

/** いま画面に出している物件。購読と通知テストの共通コンテキスト */
function readSecurityPushContextV1() {
  const scope = getPropertyScope();
  const profile = loadTenantProfile() || {};
  let customerCode = String(
    profile.customerCode || getCustomerCode() || ""
  )
    .trim()
    .toUpperCase();
  if (customerCode === "TOSHIMA001") customerCode = "TOYOSHIMA001";
  const siteId = String(
    scope.selectedSiteId ||
      window.__TISLY_SF_SITE_ID ||
      profile.securitySiteId ||
      ""
  ).trim();
  const propertyId = String(
    scope.selectedPropertyId ||
      window.__TISLY_SELECTED_PROPERTY_ID ||
      profile.homeSiteId ||
      ""
  ).trim();
  return { customerCode, siteId, propertyId };
}

function setDiagText(text) {
  for (const id of ["sf-push-diag", "ts-push-diag"]) {
    const el = $(id);
    if (el) el.textContent = text;
  }
}

function diagLine(perm, standalone, apple) {
  const ctx = readSecurityPushContextV1();
  const site = ctx.propertyId || ctx.siteId;
  const sitePart = site ? ` / site: ${site}` : "";
  return `permission: ${perm} / standalone: ${standalone} / appleAPNs: ${apple}${sitePart}`;
}

async function refreshSecurityPushDiagV1() {
  const perm =
    typeof Notification !== "undefined"
      ? Notification.permission
      : "unsupported";
  const standalone = isStandalonePwa() ? "yes" : "no";

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    setDiagText(diagLine(perm, standalone, "no"));
    return;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    if (!reg?.pushManager) {
      setDiagText(diagLine(perm, standalone, "no"));
      return;
    }
    const sub = await reg.pushManager.getSubscription();
    if (!sub) {
      setDiagText(diagLine(perm, standalone, "no"));
      return;
    }
    const ep = describePushEndpoint(sub.endpoint || "");
    setDiagText(diagLine(perm, standalone, ep.apple ? "yes" : "no"));
  } catch {
    setDiagText(diagLine(perm, standalone, "no"));
  }
}

/**
 * @param {{ forceResubscribe?: boolean }} [opts]
 */
async function registerSecurityWebPushV1(opts = {}) {
  const forceResubscribe = !!opts.forceResubscribe;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Web Push 非対応（iOS はホーム画面に追加した PWA から）");
  }
  const vapidRes = await fetch("/api/notifications/vapid-public-key");
  const vapidData = await vapidRes.json();
  if (!vapidRes.ok || !vapidData.publicKey) {
    throw new Error("VAPID 未設定 — サーバーで npm run vapid:setup");
  }
  const reg = await navigator.serviceWorker.register("/service-worker.js");
  await navigator.serviceWorker.ready;

  if (forceResubscribe) {
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      try {
        await existing.unsubscribe();
      } catch (err) {
        console.warn("[sf-push] unsubscribe failed:", err);
      }
    }
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(`通知が許可されていません (permission=${permission})`);
  }

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidData.publicKey),
  });
  const json = sub.toJSON();
  if (!json?.endpoint || !json?.keys?.p256dh || !json?.keys?.auth) {
    throw new Error("購読エンドポイント取得失敗（keys/endpoint なし）");
  }
  const ctx = readSecurityPushContextV1();
  const res = await fetch("/api/notifications/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: "home-security",
      audience: isCustomerPushScreen() ? "customer" : "toms",
      siteId: ctx.siteId || undefined,
      propertyId: ctx.propertyId || undefined,
      customerCode: ctx.customerCode || undefined,
      subscription: { endpoint: json.endpoint, keys: json.keys },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `登録失敗 (${res.status})`);
  const ep = describePushEndpoint(json.endpoint);
  data._debug = {
    permission,
    appleAPNs: ep.apple,
    endpointTail: ep.tail,
    standalone: isStandalonePwa(),
    siteId: ctx.siteId,
    propertyId: ctx.propertyId,
    customerCode: ctx.customerCode,
  };
  return data;
}

async function sendSecurityPushTestV1() {
  const ctx = readSecurityPushContextV1();
  const toyoshima =
    ctx.customerCode === "TOYOSHIMA001" ||
    /TOYOSHIMA|TOSHIMA/.test(`${ctx.siteId} ${ctx.propertyId}`);
  const siteId = toyoshima
    ? ctx.propertyId || ctx.siteId || "HOME-JP-TOYOSHIMA"
    : ctx.siteId || "SEC-JP-ITABASHI-LIVE";
  const url = toyoshima
    ? "/api/home/v1/toyoshima/test-notify"
    : "/api/security-floor/v1/test-notify";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      siteId,
      customerCode: ctx.customerCode || undefined,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `通知テスト失敗 (${res.status})`);
  }
  if (data.push && data.push.success === false) {
    throw new Error(data.push.hint || data.push.error || "Push未送信");
  }
  if (data.pushSent === false) {
    throw new Error("通知テスト（Push未送信）");
  }
  return data;
}

function bindSecurityPushUiV1() {
  if (window.__TISLY_SF_PUSH_BOUND) return;
  window.__TISLY_SF_PUSH_BOUND = true;

  $("sf-push-reregister")?.addEventListener("click", async () => {
    const btn = $("sf-push-reregister");
    if (btn) btn.disabled = true;
    try {
      const data = await registerSecurityWebPushV1({
        forceResubscribe: true,
      });
      const d = data._debug || {};
      showSecurityRemoteToastV1(
        `再登録完了 · permission=${d.permission || "?"} · appleAPNs=${
          d.appleAPNs ? "yes" : "no"
        }`
      );
      await refreshSecurityPushDiagV1();
    } catch (err) {
      showSecurityRemoteToastV1(err.message || String(err));
      await refreshSecurityPushDiagV1();
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  if (isCustomerPushScreen()) {
    $("sf-demo-alert")?.addEventListener("click", async () => {
      const btn = $("sf-demo-alert");
      if (btn) btn.disabled = true;
      try {
        await sendSecurityPushTestV1();
        showSecurityRemoteToastV1("通知テストを送信しました");
      } catch (err) {
        showSecurityRemoteToastV1(err.message || String(err));
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  void refreshSecurityPushDiagV1();
}

bindSecurityPushUiV1();

export {
  registerSecurityWebPushV1,
  refreshSecurityPushDiagV1,
  readSecurityPushContextV1,
  sendSecurityPushTestV1,
};
