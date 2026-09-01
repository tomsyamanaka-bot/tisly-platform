/**
 * TiSLY PWA — プッシュ通知バー v1
 * カード一覧ヘッダー向け購読UI
 */

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
  return arr;
}

function describePushEndpoint(endpoint) {
  if (!endpoint) return { host: "—", tail: "—", apple: false };
  let host = "—";
  try {
    host = new URL(endpoint).host;
  } catch {
    /* ignore */
  }
  const apple =
    /web\.push\.apple\.com/i.test(endpoint) || /apple/i.test(host);
  const tail = endpoint.length > 40 ? endpoint.slice(-40) : endpoint;
  return { host, tail, apple };
}

function byPrefix(prefix, suffix) {
  return document.getElementById(`${prefix}-${suffix}`);
}

function setPushStatus(prefix, text, ok) {
  const el = byPrefix(prefix, "push-status");
  if (!el) return;
  el.textContent = text;
  el.style.color =
    ok === true ? "#166534" : ok === false ? "#b91c1c" : "";
}

function setPushRegisteredUi(prefix, registered) {
  const registerBtn = byPrefix(prefix, "push-register");
  const registeredWrap = byPrefix(prefix, "push-registered");
  if (registerBtn) registerBtn.hidden = !!registered;
  if (registeredWrap) registeredWrap.hidden = !registered;
}

/**
 * 購読状態に応じてボタン/バッジを切替
 * @param {string} prefix
 */
export async function refreshTislyPushBarUiV1(prefix = "hm") {
  const perm =
    typeof Notification !== "undefined" ? Notification.permission : "unsupported";
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean(/** @type {{ standalone?: boolean }} */ (navigator).standalone);

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    setPushRegisteredUi(prefix, false);
    setPushStatus(
      prefix,
      "この端末は Web Push 非対応（iOS はホーム画面追加が必要）",
      false
    );
    return;
  }

  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    if (!reg?.pushManager) {
      setPushRegisteredUi(prefix, false);
      setPushStatus(prefix, "Service Worker 未登録", false);
      return;
    }
    const sub = await reg.pushManager.getSubscription();
    if (!sub) {
      setPushRegisteredUi(prefix, false);
      setPushStatus(prefix, "プッシュ通知は未登録です", false);
      return;
    }
    const ep = describePushEndpoint(sub.endpoint || "");
    setPushRegisteredUi(prefix, true);
    setPushStatus(
      prefix,
      perm === "granted"
        ? `通知受信中（登録済み）${ep.apple ? " · APNs" : ""}`
        : `登録済み · 許可=${perm}`,
      perm === "granted"
    );
    void standalone;
  } catch (err) {
    setPushRegisteredUi(prefix, false);
    setPushStatus(prefix, err.message || String(err), false);
  }
}

/**
 * @param {{ forceResubscribe?: boolean, userId?: string }} [opts]
 */
export async function registerTislyWebPushV1(opts = {}) {
  const forceResubscribe = !!opts.forceResubscribe;
  const userId = opts.userId || "home-security";
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
        console.warn("[tisly-push] unsubscribe failed:", err);
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
      userId,
      subscription: { endpoint: json.endpoint, keys: json.keys },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `登録失敗 (${res.status})`);
  return data;
}

/**
 * 玄関呼出・ミリ波検知の模擬Push
 * @param {string} [siteId]
 */
export async function sendTislySecurityTestPushV1(siteId = "") {
  const resolved =
    siteId ||
    new URLSearchParams(location.search).get("siteId") ||
    document.getElementById("hm-site-select")?.value ||
    "HOME-JP-ITABASHI-LIVE";
  const res = await fetch("/api/security-floor/v1/test-notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siteId: resolved }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `送信失敗 (${res.status})`);
  if (data.push && data.push.success === false) {
    const detail =
      data.push.hint ||
      data.push.error ||
      (Array.isArray(data.push.attempts) && data.push.attempts.length
        ? data.push.attempts
            .map((a) => `${a.statusLabel}${a.error ? `: ${a.error}` : ""}`)
            .join(" / ")
        : "Push 送信失敗");
    throw new Error(detail);
  }
  return data;
}

/**
 * @param {{
 *   prefix?: string,
 *   userId?: string,
 *   showToast?: (msg: string) => void,
 *   getSiteId?: () => string,
 * }} [options]
 */
export function bindTislyPushBarV1(options = {}) {
  const prefix = options.prefix || "hm";
  const userId = options.userId || "home-security";
  const showToast = options.showToast || (() => {});
  const getSiteId = options.getSiteId || (() => "");

  const boundKey = `__TISLY_PUSH_BOUND_${prefix}`;
  if (window[boundKey]) return;
  window[boundKey] = true;

  byPrefix(prefix, "push-register")?.addEventListener("click", async () => {
    const btn = byPrefix(prefix, "push-register");
    if (btn) btn.disabled = true;
    try {
      await registerTislyWebPushV1({ userId });
      showToast("プッシュ通知を有効化しました");
      await refreshTislyPushBarUiV1(prefix);
    } catch (err) {
      showToast(err.message || String(err));
      setPushStatus(prefix, err.message || String(err), false);
      await refreshTislyPushBarUiV1(prefix);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  byPrefix(prefix, "push-test")?.addEventListener("click", async () => {
    const btn = byPrefix(prefix, "push-test");
    if (btn) btn.disabled = true;
    try {
      const data = await sendTislySecurityTestPushV1(getSiteId());
      const sent = data.push?.sent;
      const attempted = data.push?.attempted;
      showToast(
        typeof sent === "number" && typeof attempted === "number"
          ? `テスト通知送信 OK (${sent}/${attempted})`
          : "テスト通知を送信しました"
      );
    } catch (err) {
      showToast(err.message || String(err));
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  void refreshTislyPushBarUiV1(prefix);
}
