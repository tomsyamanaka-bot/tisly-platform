import { renderPwaTopbar, isStandalonePwa } from "./tisly-pwa-shell.js";
import { registerWebPush, testPush } from "./push.js";

function isIos() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isPushSupported() {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function pushUnsupportedReason() {
  if (!("serviceWorker" in navigator)) {
    return "このブラウザは Service Worker に対応していません。PWA 対応ブラウザ（Safari / Chrome / Edge）をご利用ください。";
  }
  if (!("PushManager" in window)) {
    if (isIos() && !isStandalonePwa()) {
      return "iPhone ではホーム画面に追加した PWA からのみ Web Push に対応します（iOS 16.4 以降）。上の手順に従ってください。";
    }
    return "このブラウザは Web Push（PushManager）に対応していません。Chrome / Edge / Firefox、または iOS 16.4+ のホーム画面 PWA をご利用ください。";
  }
  if (!("Notification" in window)) {
    return "通知 API に対応していません。";
  }
  return null;
}

const TOKEN_KEY = "tisly_token";

function showMsg(ok, text) {
  const el = document.getElementById("push-msg");
  if (!el) return;
  el.className = ok ? "push-msg ok" : "push-msg err";
  el.textContent = text;
}

function pushUserId() {
  const code = sessionStorage.getItem("tisly_customer_code") || "TOMS001";
  return `${code.toLowerCase()}-pwa`;
}

function setStatus(id, text, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = ok === true ? "status-ok" : ok === false ? "status-ng" : "";
}

function refreshPlatformGuidance() {
  const iosGuide = document.getElementById("ios-pwa-guide");
  const unsupported = document.getElementById("push-unsupported");
  const reasonEl = document.getElementById("push-unsupported-reason");
  const standalone = isStandalonePwa();
  const ios = isIos();

  if (ios && !standalone) {
    iosGuide?.removeAttribute("hidden");
  } else {
    iosGuide?.setAttribute("hidden", "");
  }

  const reason = pushUnsupportedReason();
  if (!isPushSupported() && reason) {
    unsupported?.removeAttribute("hidden");
    if (reasonEl) reasonEl.textContent = reason;
    document.getElementById("btn-push-register")?.setAttribute("disabled", "true");
    document.getElementById("btn-push-test")?.setAttribute("disabled", "true");
  } else {
    unsupported?.setAttribute("hidden", "");
  }
}

async function refreshPushStatus() {
  const supported = isPushSupported();
  const reason = pushUnsupportedReason();
  setStatus(
    "status-push-support",
    supported ? "対応" : reason || "非対応（Service Worker / PushManager なし）",
    supported
  );

  const perm = typeof Notification !== "undefined" ? Notification.permission : "unsupported";
  const permLabel =
    perm === "granted" ? "許可済み" : perm === "denied" ? "拒否" : perm === "default" ? "未設定" : perm;
  setStatus("status-notification-permission", permLabel, perm === "granted");

  if (!("serviceWorker" in navigator)) {
    setStatus("status-sw-registration", "非対応", false);
    setStatus("status-push-subscription", "—", null);
    return;
  }

  try {
    const reg = await navigator.serviceWorker.getRegistration("/service-worker.js");
    if (!reg) {
      setStatus("status-sw-registration", "未登録", false);
      setStatus("status-push-subscription", "未登録（SW なし）", false);
      return;
    }
    const swState = reg.active?.state || reg.installing?.state || reg.waiting?.state || "unknown";
    const scope = reg.scope || "—";
    setStatus("status-sw-registration", `登録済み (${swState}) · scope: ${scope}`, true);

    if (!reg.pushManager) {
      setStatus("status-push-subscription", "PushManager なし", false);
      return;
    }
    const sub = await reg.pushManager.getSubscription();
    if (!sub) {
      setStatus("status-push-subscription", "未登録", false);
      return;
    }
    const endpoint = sub.endpoint || "";
    const short = endpoint.length > 48 ? `${endpoint.slice(0, 48)}…` : endpoint;
    setStatus("status-push-subscription", `登録済み · ${short}`, true);
  } catch (e) {
    setStatus("status-sw-registration", e.message || String(e), false);
    setStatus("status-push-subscription", "確認失敗", false);
  }
}

function refreshDisplayMode() {
  const standalone = isStandalonePwa();
  setStatus(
    "status-display-mode",
    standalone ? "PWA（スタンドアロン）" : "ブラウザ",
    standalone
  );
  refreshPlatformGuidance();
}

async function ensureHubRole() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const hint = document.getElementById("push-login-hint");
  if (!token) {
    hint?.removeAttribute("hidden");
    document.getElementById("btn-push-register")?.setAttribute("disabled", "true");
    document.getElementById("btn-push-test")?.setAttribute("disabled", "true");
    return false;
  }
  try {
    const res = await fetch("/api/pwa/hub", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("hub");
    const data = await res.json();
    const allowed = ["owner", "admin", "super_admin"].includes(data.role);
    if (!allowed) {
      hint.textContent = `この画面は owner / admin 向けです（現在: ${data.role}）`;
      hint?.removeAttribute("hidden");
      document.getElementById("btn-push-register")?.setAttribute("disabled", "true");
      document.getElementById("btn-push-test")?.setAttribute("disabled", "true");
      return false;
    }
    hint?.setAttribute("hidden", "");
    if (data.customerCode) {
      sessionStorage.setItem("tisly_customer_code", data.customerCode);
    }
    if (isPushSupported()) {
      document.getElementById("btn-push-register")?.removeAttribute("disabled");
      document.getElementById("btn-push-test")?.removeAttribute("disabled");
    }
    return true;
  } catch {
    hint?.removeAttribute("hidden");
    return false;
  }
}

document.getElementById("btn-push-status-refresh")?.addEventListener("click", () => {
  refreshPushStatus();
  refreshDisplayMode();
});

document.getElementById("btn-push-register")?.addEventListener("click", async () => {
  try {
    await registerWebPush(pushUserId());
    showMsg(true, "Push 登録完了");
    await refreshPushStatus();
  } catch (e) {
    showMsg(false, e.message ?? String(e));
  }
});

document.getElementById("btn-push-test")?.addEventListener("click", async () => {
  try {
    const r = await testPush();
    showMsg(!!r.success, r.success ? "テスト送信成功" : r.error ?? "送信失敗");
  } catch (e) {
    showMsg(false, e.message ?? String(e));
  }
});

if (!isPushSupported()) {
  const reason = pushUnsupportedReason();
  if (reason) showMsg(false, reason);
}

if (location.hash === "#notification-test") {
  document.getElementById("notification-test")?.scrollIntoView({ behavior: "smooth" });
}

renderPwaTopbar("push", "Push登録");
void ensureHubRole();
refreshPushStatus();
refreshDisplayMode();
