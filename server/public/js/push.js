import { apiGet, apiPost } from "./api.js";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function registerWebPush(userId = "admin-default") {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("このブラウザは Web Push に対応していません");
  }
  const { publicKey } = await apiGet("/api/notifications/vapid-public-key");
  if (!publicKey) {
    throw new Error("VAPID 公開鍵が未設定です（サーバー .env を確認）");
  }
  const reg = await navigator.serviceWorker.register("/sw.js");
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
  return apiPost("/api/notifications/subscribe", {
    userId,
    subscription: { endpoint: json.endpoint, keys: json.keys },
  });
}

export async function testPush() {
  return apiPost("/api/notifications/test/web_push");
}
