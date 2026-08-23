/**
 * TiSLY Security — Web Push 再登録・購読 v1
 * 解除 → APNs/WebPush 再購読 → POST /api/notifications/subscribe
 */

import { showSecurityRemoteToastV1 } from "./security-floor-remote-config-v1.js";

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

function setDiagText(text) {
  const el = $("sf-push-diag");
  if (el) el.textContent = text;
}

async function refreshSecurityPushDiagV1() {
  const perm =
    typeof Notification !== "undefined"
      ? Notification.permission
      : "unsupported";
  const standalone = isStandalonePwa() ? "yes" : "no";

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    setDiagText(
      `permission: ${perm} / standalone: ${standalone} / appleAPNs: no`
    );
    return;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    if (!reg?.pushManager) {
      setDiagText(
        `permission: ${perm} / standalone: ${standalone} / appleAPNs: no`
      );
      return;
    }
    const sub = await reg.pushManager.getSubscription();
    if (!sub) {
      setDiagText(
        `permission: ${perm} / standalone: ${standalone} / appleAPNs: no`
      );
      return;
    }
    const ep = describePushEndpoint(sub.endpoint || "");
    setDiagText(
      `permission: ${perm} / standalone: ${standalone} / appleAPNs: ${
        ep.apple ? "yes" : "no"
      }`
    );
  } catch {
    setDiagText(
      `permission: ${perm} / standalone: ${standalone} / appleAPNs: no`
    );
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
  const res = await fetch("/api/notifications/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: "home-security",
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
  };
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

  void refreshSecurityPushDiagV1();
}

bindSecurityPushUiV1();

export {
  registerSecurityWebPushV1,
  refreshSecurityPushDiagV1,
};
