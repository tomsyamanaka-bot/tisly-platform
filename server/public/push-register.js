/**
 * TiSLY PWA Web Push registration helper
 * Usage: import from dashboard or <script type="module" src="/push-register.js">
 */

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registerPushSubscription(userId = "admin-default") {
  if (!isPushSupported()) {
    throw new Error("このブラウザは Web Push に対応していません");
  }
  const keyRes = await fetch("/api/notifications/vapid-public-key");
  const { publicKey } = await keyRes.json();
  if (!publicKey) {
    throw new Error("VAPID 公開鍵が未設定です（サーバー .env を確認）");
  }
  const swPath = "/service-worker.js";
  const reg = await navigator.serviceWorker.register(swPath);
  await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("通知が許可されていません");
  }
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  const json = sub.toJSON();
  const res = await fetch("/api/notifications/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      subscription: { endpoint: json.endpoint, keys: json.keys },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Subscribe failed (${res.status})`);
  }
  return res.json();
}

export async function sendTestNotification(channel = "web_push") {
  const res = await fetch("/api/notifications/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Test failed");
  return data;
}

export function bindPushUi({
  registerBtnId = "btn-push-register",
  testBtnId = "btn-push-test",
  messageElId = "push-msg",
  userId = "admin-default",
} = {}) {
  const registerBtn = document.getElementById(registerBtnId);
  const testBtn = document.getElementById(testBtnId);
  const msgEl = document.getElementById(messageElId);

  const show = (ok, text) => {
    if (!msgEl) return;
    msgEl.className = ok ? "msg ok" : "msg err";
    msgEl.textContent = text;
  };

  if (!isPushSupported()) {
    show(false, "Web Push 非対応ブラウザです");
    registerBtn?.setAttribute("disabled", "true");
    testBtn?.setAttribute("disabled", "true");
    return;
  }

  registerBtn?.addEventListener("click", async () => {
    try {
      await registerPushSubscription(userId);
      show(true, "Push 登録完了");
    } catch (e) {
      show(false, e.message ?? String(e));
    }
  });

  testBtn?.addEventListener("click", async () => {
    try {
      const r = await sendTestNotification();
      show(!!r.success, r.success ? "テスト送信成功" : r.error ?? "送信失敗");
    } catch (e) {
      show(false, e.message ?? String(e));
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => bindPushUi());
} else {
  bindPushUi();
}
