const TOKEN_KEY = "tisly_remote_test_token";
const PUSH_USER_ID = "remote-test";

function isStandalonePwa() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function isIos() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isSafari() {
  const ua = navigator.userAgent;
  if (!/Safari/.test(ua)) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Chromium/.test(ua);
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
    return "Service Worker 非対応ブラウザです。";
  }
  if (!("PushManager" in window)) {
    if (isIos() && !isStandalonePwa()) {
      return "iPhone ではホーム画面に追加した PWA からのみ Web Push に対応します（iOS 16.4 以降）。上の手順に従ってください。";
    }
    return "Web Push（PushManager）非対応です。iOS 16.4+ のホーム画面 PWA をご利用ください。";
  }
  if (!("Notification" in window)) {
    return "通知 API に対応していません。";
  }
  return null;
}

function getToken() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? raw.trim() : "";
  } catch {
    return "";
  }
}

function setToken(value) {
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
    return true;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function authHeaders(extra = {}) {
  const token = getToken();
  return {
    ...extra,
    "X-Remote-Test-Token": token,
    Authorization: `Bearer ${token}`,
  };
}

async function api(method, path, body) {
  const token = getToken();
  if (!token) throw new Error("トークン未設定 — 上で REMOTE_TEST_TOKEN を保存してください");

  const res = await fetch(path, {
    method,
    headers: authHeaders(body ? { "Content-Type": "application/json" } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (res.status === 403) throw new Error("403 — トークン不一致");
  if (res.status === 503) throw new Error("503 — サーバーに REMOTE_TEST_TOKEN 未設定");
  if (!res.ok) throw new Error(`${res.status}: ${data.error ?? text}`);

  return data;
}

const logEl = document.getElementById("log");
const tokenInput = document.getElementById("token-input");
const saveTokenBtn = document.getElementById("btn-save-token");

function clearLogPlaceholder() {
  if (!logEl) return;
  const onlyPlaceholder =
    logEl.children.length === 1 &&
    logEl.textContent.includes("待機中");
  if (onlyPlaceholder) logEl.innerHTML = "";
}

function appendLog(label, payload, options = {}) {
  if (!logEl) return;
  clearLogPlaceholder();

  const time = new Date().toLocaleTimeString("ja-JP");
  const entry = document.createElement("div");
  entry.className = "log-entry";
  if (options.success) entry.classList.add("success");

  if (options.format === "notify") {
    entry.innerHTML = formatNotifyLogHtml(time, label, payload);
  } else {
    const text = `[${time}] ${label}\n${JSON.stringify(payload, null, 2)}`;
    entry.textContent = text;
  }

  logEl.prepend(entry);
}

function channelStatusLine(name, ok, error) {
  const cls = ok ? "status-success" : "status-fail";
  const status = ok ? "SUCCESS" : `FAILED${error ? ` — ${error}` : ""}`;
  return `<div><span class="status-muted">${name}:</span> <span class="${cls}">${status}</span></div>`;
}

function formatNotifyLogHtml(time, label, data) {
  const wp = data.channels?.web_push;
  const lines = [
    `<div><span class="log-time">[${time}]</span> <span class="log-label">${label}</span></div>`,
    channelStatusLine("web_push", wp?.success === true, wp?.error),
  ];

  if (data.primaryChannel) {
    lines.push(`<div class="status-muted">primary: ${data.primaryChannel}</div>`);
  }
  if (data.lastPushSuccessAt) {
    lines.push(`<div class="status-muted">Push 成功時刻: ${fmtTime(data.lastPushSuccessAt)}</div>`);
  }
  if (data.message) {
    lines.push(`<div class="status-muted">message: ${data.message}</div>`);
  }
  if (data.hint) {
    lines.push(`<div class="status-fail">${data.hint}</div>`);
  }

  return lines.join("\n");
}

function tokenFromInput() {
  return (tokenInput?.value ?? "").trim();
}

function syncSaveButton() {
  if (!saveTokenBtn || !tokenInput) return;
  saveTokenBtn.disabled = tokenFromInput().length === 0;
}

function fmtTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ja-JP");
  } catch {
    return iso;
  }
}

function setStatus(id, text, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = ok === true ? "status-ok" : ok === false ? "status-ng" : "";
}

function showPushMsg(ok, text) {
  const el = document.getElementById("push-msg");
  if (!el) return;
  el.className = ok ? "ok" : "err";
  el.textContent = text;
}

function renderPushServerStatus(data) {
  const push = data.push ?? {};
  setStatus(
    "status-vapid",
    push.vapidConfigured ? "設定済み" : "未設定",
    push.vapidConfigured
  );
  setStatus(
    "status-server-subscriptions",
    typeof push.subscriptionCount === "number"
      ? `${push.subscriptionCount} 件`
      : "—",
    push.subscriptionCount > 0
  );

  const result = data.lastPushResult ?? push.lastResult;
  const successAt = data.lastPushSuccessAt ?? push.lastSuccessAt;
  const pushResultEl = document.getElementById("st-push-result");
  if (pushResultEl) {
    if (!result) {
      pushResultEl.textContent = "—";
      pushResultEl.className = "";
    } else if (result.success) {
      pushResultEl.textContent = "SUCCESS";
      pushResultEl.className = "status-ok";
    } else {
      pushResultEl.textContent = `FAILED — ${result.error ?? "不明"}`;
      pushResultEl.className = "status-ng";
    }
  }
  const pushSuccessEl = document.getElementById("st-push-success");
  if (pushSuccessEl) {
    pushSuccessEl.textContent = fmtTime(successAt);
  }
}

const CHANNEL_COUNT = 8;

function getChannelState(data, ch) {
  const key = String(ch);
  if (data.chStates && data.chStates[key] !== undefined) {
    return data.chStates[key];
  }
  if (ch === 1 && data.ch1State !== undefined) {
    return data.ch1State;
  }
  return "off";
}

function renderChannelBadge(ch, state) {
  const el = document.getElementById(`st-ch${ch}`);
  if (!el) return;
  el.innerHTML = `<span class="badge ${state === "on" ? "on" : "off"}">${state}</span>`;
}

function renderStatus(data) {
  for (let ch = 1; ch <= CHANNEL_COUNT; ch++) {
    renderChannelBadge(ch, getChannelState(data, ch));
  }
  document.getElementById("st-pending").textContent = data.pendingCommand ?? "なし";
  document.getElementById("st-notify").textContent = fmtTime(data.lastNotifyAt);
  document.getElementById("st-poll").textContent = fmtTime(data.lastPollAt);

  document.getElementById("dbg-command").textContent = data.lastCommand ?? "—";
  document.getElementById("dbg-ip").textContent = data.lastAccessIp ?? "—";
  document.getElementById("dbg-poll").textContent = fmtTime(data.lastPollAt);

  renderPushServerStatus(data);
  renderDeviceStatus(data.device);
}

function renderDeviceStatus(device) {
  const dev = device ?? {};
  const onlineEl = document.getElementById("st-device-online");
  if (onlineEl) {
    if (dev.online === true) {
      onlineEl.innerHTML = '<span class="badge on">online</span>';
    } else if (dev.offline === true || dev.online === false) {
      onlineEl.innerHTML = '<span class="badge off">offline</span>';
    } else {
      onlineEl.textContent = "—";
    }
  }
  const lastSeenEl = document.getElementById("st-device-lastseen");
  if (lastSeenEl) lastSeenEl.textContent = fmtTime(dev.lastSeen);
  const fwEl = document.getElementById("st-device-firmware");
  if (fwEl) fwEl.textContent = dev.firmwareVersion ?? "—";
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
    if (getToken()) {
      document.getElementById("btn-push-register")?.removeAttribute("disabled");
      document.getElementById("btn-push-test")?.removeAttribute("disabled");
    }
  }
}

async function refreshPushStatus() {
  const supported = isPushSupported();
  const reason = pushUnsupportedReason();
  setStatus(
    "status-push-support",
    supported ? "対応" : reason || "非対応",
    supported
  );

  const perm = typeof Notification !== "undefined" ? Notification.permission : "unsupported";
  const permLabel =
    perm === "granted" ? "許可済み" : perm === "denied" ? "拒否" : perm === "default" ? "未設定" : perm;
  setStatus("status-notification-permission", permLabel, perm === "granted");

  const standalone = isStandalonePwa();
  setStatus(
    "status-display-mode",
    standalone ? "PWA（スタンドアロン）" : "ブラウザ",
    standalone
  );

  const safari = isSafari();
  const ios = isIos();
  let browserLabel = "—";
  if (ios && safari) browserLabel = "Safari（iOS）";
  else if (ios) browserLabel = "iOS（Safari 以外）";
  else if (safari) browserLabel = "Safari";
  else browserLabel = navigator.userAgent.split(" ").pop()?.slice(0, 24) ?? "その他";
  setStatus("status-browser", browserLabel, ios ? safari && standalone : null);

  if (!("serviceWorker" in navigator)) {
    setStatus("status-sw-registration", "非対応", false);
    setStatus("status-push-subscription", "—", null);
    refreshPlatformGuidance();
    return;
  }

  try {
    const reg = await navigator.serviceWorker.getRegistration("/service-worker.js");
    if (!reg) {
      setStatus("status-sw-registration", "未登録", false);
      setStatus("status-push-subscription", "未登録（SW なし）", false);
      refreshPlatformGuidance();
      return;
    }
    const swState = reg.active?.state || reg.installing?.state || reg.waiting?.state || "unknown";
    setStatus("status-sw-registration", `登録済み (${swState})`, true);

    if (!reg.pushManager) {
      setStatus("status-push-subscription", "PushManager なし", false);
      refreshPlatformGuidance();
      return;
    }
    const sub = await reg.pushManager.getSubscription();
    if (!sub) {
      setStatus("status-push-subscription", "未登録", false);
    } else {
      const endpoint = sub.endpoint || "";
      const short = endpoint.length > 40 ? `${endpoint.slice(0, 40)}…` : endpoint;
      setStatus("status-push-subscription", `登録済み · ${short}`, true);
    }
  } catch (e) {
    setStatus("status-sw-registration", e.message || String(e), false);
    setStatus("status-push-subscription", "確認失敗", false);
  }

  refreshPlatformGuidance();
}

let pollTimer = null;

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    refreshStatus(true).catch(() => {});
  }, 5000);
}

async function refreshStatus(silent = false) {
  const [data, device] = await Promise.all([
    api("GET", "/api/remote-test/status"),
    api("GET", "/api/remote-test/device").catch(() => null),
  ]);
  if (device) data.device = device;
  renderStatus(data);
  if (!silent) appendLog("状態確認", data);
  return data;
}

async function runAction(label, fn, options = {}) {
  try {
    const data = await fn();
    if (data.chStates !== undefined || data.ch1State !== undefined || data.push !== undefined) {
      renderStatus(data);
    }
    const pushOk = data.channels?.web_push?.success === true || data.ok === true;
    appendLog(label, data, {
      format: options.format,
      success: options.format === "notify" ? pushOk : options.successOnOk && data.ok,
    });
    if (options.format === "notify") {
      showPushMsg(pushOk, pushOk ? "Push テスト送信成功" : data.hint ?? data.channels?.web_push?.error ?? "送信失敗");
    }
  } catch (err) {
    appendLog(`${label} ERROR`, { error: err.message ?? String(err) });
    if (options.format === "notify") {
      showPushMsg(false, err.message ?? String(err));
    }
  }
}

function bindTokenInputEvents() {
  if (!tokenInput) return;
  ["input", "change", "keyup", "paste", "blur"].forEach((evt) => {
    tokenInput.addEventListener(evt, () => {
      if (evt === "paste") setTimeout(syncSaveButton, 0);
      else syncSaveButton();
    });
  });
}

saveTokenBtn?.addEventListener("click", () => {
  const v = tokenFromInput();
  if (!v) {
    appendLog("トークン", { error: "空のトークンは保存できません" });
    syncSaveButton();
    return;
  }
  const result = setToken(v);
  if (result !== true) {
    appendLog("トークン保存 ERROR", { error: `localStorage 不可: ${result}` });
    return;
  }
  appendLog("トークン保存", { ok: true });
  syncSaveButton();
  refreshPlatformGuidance();
  startPolling();
  refreshStatus(true).catch((err) => appendLog("起動時状態取得", { error: err.message }));
});

document.getElementById("btn-status")?.addEventListener("click", () => runAction("状態確認", refreshStatus));
document.getElementById("btn-push-test")?.addEventListener("click", () =>
  runAction("Push テスト", () => api("POST", "/api/remote-test/notify"), { format: "notify" })
);
document.querySelectorAll(".btn-ch-on").forEach((btn) => {
  btn.addEventListener("click", () => {
    const ch = Number(btn.getAttribute("data-channel"));
    if (!ch) return;
    runAction(`CH${ch} ON`, () => api("POST", `/api/remote-test/ch${ch}/on`));
  });
});

document.querySelectorAll(".btn-ch-off").forEach((btn) => {
  btn.addEventListener("click", () => {
    const ch = Number(btn.getAttribute("data-channel"));
    if (!ch) return;
    runAction(`CH${ch} OFF`, () => api("POST", `/api/remote-test/ch${ch}/off`));
  });
});

document.getElementById("btn-push-status-refresh")?.addEventListener("click", () => {
  refreshPushStatus();
});

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

document.getElementById("btn-push-register")?.addEventListener("click", () =>
  runAction("Push 登録", async () => {
    if (!isPushSupported()) {
      throw new Error(pushUnsupportedReason() ?? "Web Push 非対応");
    }
    const { publicKey } = await fetch("/api/notifications/vapid-public-key").then((r) => r.json());
    if (!publicKey) throw new Error("VAPID 未設定 — サーバーで npm run vapid:setup");
    const reg = await navigator.serviceWorker.register("/service-worker.js");
    await navigator.serviceWorker.ready;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("通知が拒否されました");
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    const json = sub.toJSON();
    const result = await fetch("/api/notifications/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: PUSH_USER_ID,
        subscription: { endpoint: json.endpoint, keys: json.keys },
      }),
    }).then((r) => r.json());
    showPushMsg(true, "Push 登録完了");
    await refreshPushStatus();
    if (getToken()) {
      await refreshStatus(true);
    }
    return result;
  })
);

bindTokenInputEvents();

const saved = getToken();
if (saved && tokenInput) tokenInput.value = saved;
syncSaveButton();

refreshPushStatus();
refreshPlatformGuidance();

if (saved) {
  startPolling();
  refreshStatus(true).catch((err) => appendLog("起動時状態取得", { error: err.message }));
} else if (logEl) {
  logEl.innerHTML = '<div class="log-entry">トークンを入力して保存してください。</div>';
}
