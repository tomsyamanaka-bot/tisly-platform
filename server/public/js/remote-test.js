const TOKEN_KEY = "tisly_remote_test_token";
const PUSH_USER_ID = "remote-test";
const REMOTE_TEST_SW_URL = "/remote-test/service-worker.js";
const REMOTE_TEST_SW_SCOPE = "/remote-test/";

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
const notifyHistoryEl = document.getElementById("notify-history");
const eventHistoryEl = document.getElementById("event-history");
const securityStatusCard = document.getElementById("security-status-card");
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
  const deviceStates = data.device?.chStates;
  if (deviceStates && deviceStates[key] !== undefined) {
    return deviceStates[key];
  }
  if (data.chStates && data.chStates[key] !== undefined) {
    return data.chStates[key];
  }
  if (ch === 1 && data.ch1State !== undefined) {
    return data.ch1State;
  }
  return "off";
}

function getInputState(data, di) {
  const key = String(di);
  const deviceStates = data.device?.inputStates;
  if (deviceStates && deviceStates[key] !== undefined) {
    return deviceStates[key];
  }
  if (data.inputStates && data.inputStates[key] !== undefined) {
    return data.inputStates[key];
  }
  return "off";
}

function renderInputBadge(di, state) {
  const el = document.getElementById(`st-di${di}`);
  if (!el) return;
  el.innerHTML = `<span class="badge ${state === "on" ? "on" : "off"}">${state}</span>`;
}

function renderChannelBadge(ch, state, pending) {
  const el = document.getElementById(`st-ch${ch}`);
  if (!el) return;
  if (pending) {
    el.innerHTML = `<span class="badge pending">指令送信済み</span>`;
  } else {
    el.innerHTML = `<span class="badge ${state === "on" ? "on" : "off"}">${state}</span>`;
  }
}

function notificationKindLabel(kind) {
  if (kind === "arm") return "警戒ON";
  if (kind === "disarm") return "警戒OFF";
  if (kind === "security") return "センサー";
  if (kind === "di") return "DI";
  return "CH";
}

function renderNotificationHistory(history) {
  if (!notifyHistoryEl) return;
  const items = Array.isArray(history) ? history : [];
  if (items.length === 0) {
    notifyHistoryEl.innerHTML =
      '<div class="log-entry"><span class="log-time">—</span> まだ通知はありません</div>';
    return;
  }
  notifyHistoryEl.innerHTML = items
    .map((entry) => {
      const time = fmtTime(entry.at ?? entry.timestamp);
      const kindLabel = notificationKindLabel(entry.kind);
      const label =
        entry.body ||
        (entry.kind === "arm" || entry.kind === "disarm"
          ? entry.to
          : `${kindLabel}${entry.channel} ${(entry.to || "").toUpperCase()}`);
      const cls =
        entry.to === "on" || entry.to === "ARM" || entry.kind === "arm" ? "on" : "off";
      const pushStatus = entry.pushSuccess
        ? '<span class="status-success">Push OK</span>'
        : `<span class="status-fail">Push NG${entry.pushError ? ` — ${entry.pushError}` : ""}</span>`;
      const entryCls = entry.pushSuccess ? "log-entry success" : "log-entry notify-fail";
      return `<div class="${entryCls}">
        <div><span class="log-time">${time}</span> <span class="notify-label ${cls}">${label}</span></div>
        <div class="status-muted">${entry.title ?? ""} · ${kindLabel} · ${pushStatus}</div>
      </div>`;
    })
    .join("");
}

function renderEventHistory(history) {
  if (!eventHistoryEl) return;
  const items = Array.isArray(history) ? history : [];
  if (items.length === 0) {
    eventHistoryEl.innerHTML =
      '<div class="log-entry"><span class="log-time">—</span> まだイベントはありません</div>';
    return;
  }
  eventHistoryEl.innerHTML = items
    .map((entry) => {
      const time = fmtTime(entry.timestamp);
      return `<div class="log-entry">
        <div><span class="log-time">${time}</span> <span class="log-label">${entry.type}</span></div>
        <div class="status-muted">${entry.device} · ${entry.input} · ${entry.state}</div>
      </div>`;
    })
    .join("");
}

function renderSecurityStatus(data) {
  const mode = data.securityMode ?? "DISARM";
  const armed = mode === "ARM";
  const modeEl = document.getElementById("st-security-mode");
  if (modeEl) {
    modeEl.innerHTML = `<span class="badge ${armed ? "arm" : "disarm"}">${mode}</span>`;
  }
  const deviceEl = document.getElementById("st-security-device");
  if (deviceEl) deviceEl.textContent = data.deviceName ?? data.securityDemoConfig?.deviceName ?? "—";
  const armEl = document.getElementById("st-last-arm");
  if (armEl) armEl.textContent = fmtTime(data.lastArmAt);
  const disarmEl = document.getElementById("st-last-disarm");
  if (disarmEl) disarmEl.textContent = fmtTime(data.lastDisarmAt);
  if (securityStatusCard) {
    securityStatusCard.classList.toggle("security-armed", armed);
    securityStatusCard.classList.toggle("security-disarmed", !armed);
  }
}

function renderStatus(data) {
  // pendingCommand から保留中のチャンネル番号を抽出（例: "ch8_on" → 8）
  const pendingMatch = data.pendingCommand ? data.pendingCommand.match(/^ch(\d+)_(on|off)$/) : null;
  const pendingCh = pendingMatch ? Number(pendingMatch[1]) : null;

  for (let di = 1; di <= CHANNEL_COUNT; di++) {
    renderInputBadge(di, getInputState(data, di));
  }
  for (let ch = 1; ch <= CHANNEL_COUNT; ch++) {
    renderChannelBadge(ch, getChannelState(data, ch), ch === pendingCh);
  }
  document.getElementById("st-pending").textContent = data.pendingCommand ?? "なし";
  document.getElementById("st-notify").textContent = fmtTime(data.lastNotifyAt);
  document.getElementById("st-poll").textContent = fmtTime(data.lastPollAt);

  document.getElementById("dbg-command").textContent = data.lastCommand ?? "—";
  document.getElementById("dbg-ip").textContent = data.lastAccessIp ?? "—";
  document.getElementById("dbg-poll").textContent = fmtTime(data.lastPollAt);

  renderPushServerStatus(data);
  renderDeviceStatus(data.device);
  renderSecurityStatus(data);
  renderEventHistory(data.eventHistoryDisplay ?? data.eventHistory);
  renderNotificationHistory(data.notificationHistory);
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

function canUsePushActions() {
  return isStandalonePwa() && isPushSupported() && !!getToken();
}

function refreshPlatformGuidance() {
  const iosGuide = document.getElementById("ios-pwa-guide");
  const browserHint = document.getElementById("browser-mode-hint");
  const unsupported = document.getElementById("push-unsupported");
  const reasonEl = document.getElementById("push-unsupported-reason");
  const standalone = isStandalonePwa();
  const ios = isIos();
  const registerBtn = document.getElementById("btn-push-register");
  const testBtn = document.getElementById("btn-push-test");

  if (ios && !standalone) {
    iosGuide?.removeAttribute("hidden");
  } else {
    iosGuide?.setAttribute("hidden", "");
  }

  if (!standalone && isPushSupported()) {
    browserHint?.removeAttribute("hidden");
  } else {
    browserHint?.setAttribute("hidden", "");
  }

  const reason = pushUnsupportedReason();
  if (!isPushSupported() && reason) {
    unsupported?.removeAttribute("hidden");
    if (reasonEl) reasonEl.textContent = reason;
    registerBtn?.setAttribute("disabled", "true");
    testBtn?.setAttribute("disabled", "true");
    return;
  }

  unsupported?.setAttribute("hidden", "");
  if (canUsePushActions()) {
    registerBtn?.removeAttribute("disabled");
    testBtn?.removeAttribute("disabled");
  } else {
    registerBtn?.setAttribute("disabled", "true");
    testBtn?.setAttribute("disabled", "true");
  }
}

async function refreshPushStatus() {
  const perm = typeof Notification !== "undefined" ? Notification.permission : "unsupported";
  const permLabel =
    perm === "granted" || perm === "denied" || perm === "default" ? perm : perm;
  setStatus("status-notification-permission", permLabel, perm === "granted");

  const standalone = isStandalonePwa();
  setStatus("status-display-mode", standalone ? "PWA" : "ブラウザ", standalone);

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
    const reg =
      (await navigator.serviceWorker.getRegistration(REMOTE_TEST_SW_SCOPE)) ||
      (await navigator.serviceWorker.getRegistration(REMOTE_TEST_SW_URL));
    if (!reg) {
      setStatus("status-sw-registration", "未登録", false);
      setStatus("status-push-subscription", "未登録", false);
      refreshPlatformGuidance();
      return;
    }
    setStatus("status-sw-registration", "登録済み", true);

    if (!reg.pushManager) {
      setStatus("status-push-subscription", "PushManager なし", false);
      refreshPlatformGuidance();
      return;
    }
    const sub = await reg.pushManager.getSubscription();
    setStatus("status-push-subscription", sub ? "登録済み" : "未登録", !!sub);
  } catch (e) {
    setStatus("status-sw-registration", e.message || String(e), false);
    setStatus("status-push-subscription", "確認失敗", false);
  }

  try {
    const vapidRes = await fetch("/api/push/vapid-public-key");
    const vapidData = await vapidRes.json();
    const configured = vapidRes.ok && !!vapidData.publicKey;
    setStatus("status-vapid", configured ? "設定済み" : "未設定", configured);
  } catch {
    setStatus("status-vapid", "確認失敗", false);
  }

  if (getToken()) {
    try {
      const pushStatus = await api("GET", "/api/push/status");
      setStatus(
        "status-server-subscriptions",
        typeof pushStatus.subscriptionCount === "number"
          ? `${pushStatus.subscriptionCount} 件`
          : "—",
        pushStatus.subscriptionCount > 0
      );
      if (typeof pushStatus.vapidConfigured === "boolean") {
        setStatus(
          "status-vapid",
          pushStatus.vapidConfigured ? "設定済み" : "未設定",
          pushStatus.vapidConfigured
        );
      }
    } catch {
      /* token or server error — vapid-public-key result remains */
    }
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
  if (device) {
    data.device = device;
    if (device.chStates) {
      data.chStates = device.chStates;
    }
    if (device.inputStates) {
      data.inputStates = device.inputStates;
    }
  }
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

document.getElementById("btn-arm")?.addEventListener("click", () =>
  runAction("警戒ON", () => api("POST", "/api/remote-test/arm"), { successOnOk: true })
);
document.getElementById("btn-disarm")?.addEventListener("click", () =>
  runAction("警戒OFF", () => api("POST", "/api/remote-test/disarm"), { successOnOk: true })
);
document.getElementById("btn-intrusion-sim")?.addEventListener("click", () =>
  runAction("侵入シミュレーション", () => api("POST", "/api/remote-test/demo/intrusion-simulation"), {
    successOnOk: true,
  })
);
document.getElementById("btn-push-test")?.addEventListener("click", () =>
  runAction("Push テスト", () => api("POST", "/api/push/test"), { format: "notify" })
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
    if (!isStandalonePwa()) {
      throw new Error("PWA（ホーム画面追加）からのみ Push 登録できます");
    }
    if (!isPushSupported()) {
      throw new Error(pushUnsupportedReason() ?? "Web Push 非対応");
    }
    const vapidRes = await fetch("/api/push/vapid-public-key");
    const vapidData = await vapidRes.json();
    if (!vapidRes.ok || !vapidData.publicKey) {
      throw new Error(vapidData.error ?? vapidData.hint ?? "VAPID 未設定 — サーバーで npm run vapid:setup");
    }
    const reg = await navigator.serviceWorker.register(REMOTE_TEST_SW_URL, {
      scope: REMOTE_TEST_SW_SCOPE,
    });
    await navigator.serviceWorker.ready;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("通知が拒否されました");
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidData.publicKey),
    });
    const json = sub.toJSON();
    const result = await api("POST", "/api/push/subscribe", {
      subscription: { endpoint: json.endpoint, keys: json.keys },
    });
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
