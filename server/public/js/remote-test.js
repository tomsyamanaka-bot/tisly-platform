const TOKEN_KEY = "tisly_remote_test_token";

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

function appendLog(label, payload) {
  const line = `[${new Date().toLocaleTimeString("ja-JP")}] ${label}\n${JSON.stringify(payload, null, 2)}\n\n`;
  logEl.textContent = line + logEl.textContent;
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

function renderStatus(data) {
  const ch1 = data.ch1State ?? "off";
  document.getElementById("st-ch1").innerHTML =
    `<span class="badge ${ch1 === "on" ? "on" : "off"}">${ch1}</span>`;
  document.getElementById("st-pending").textContent = data.pendingCommand ?? "なし";
  document.getElementById("st-notify").textContent = fmtTime(data.lastNotifyAt);
  document.getElementById("st-poll").textContent = fmtTime(data.lastPollAt);

  document.getElementById("dbg-notify").textContent = fmtTime(data.lastNotifyAt);
  document.getElementById("dbg-command").textContent = data.lastCommand ?? "—";
  document.getElementById("dbg-ip").textContent = data.lastAccessIp ?? "—";
  document.getElementById("dbg-poll").textContent = fmtTime(data.lastPollAt);
}

let pollTimer = null;

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    refreshStatus(true).catch(() => {});
  }, 5000);
}

async function refreshStatus(silent = false) {
  const data = await api("GET", "/api/remote-test/status");
  renderStatus(data);
  if (!silent) appendLog("状態確認", data);
  return data;
}

async function runAction(label, fn) {
  try {
    const data = await fn();
    if (data.ch1State !== undefined) renderStatus(data);
    appendLog(label, data);
  } catch (err) {
    appendLog(`${label} ERROR`, { error: err.message ?? String(err) });
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
  startPolling();
  refreshStatus(true).catch((err) => appendLog("起動時状態取得", { error: err.message }));
});

document.getElementById("btn-status")?.addEventListener("click", () => runAction("状態確認", refreshStatus));
document.getElementById("btn-notify")?.addEventListener("click", () =>
  runAction("通知テスト", () => api("POST", "/api/remote-test/notify"))
);
document.getElementById("btn-ch1-on")?.addEventListener("click", () =>
  runAction("CH1 ON", () => api("POST", "/api/remote-test/ch1/on"))
);
document.getElementById("btn-ch1-off")?.addEventListener("click", () =>
  runAction("CH1 OFF", () => api("POST", "/api/remote-test/ch1/off"))
);

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
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      throw new Error("Web Push 非対応ブラウザ");
    }
    const { publicKey } = await fetch("/api/notifications/vapid-public-key").then((r) => r.json());
    if (!publicKey) throw new Error("VAPID 未設定");
    const reg = await navigator.serviceWorker.register("/service-worker.js");
    await navigator.serviceWorker.ready;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("通知が拒否されました");
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    const json = sub.toJSON();
    return fetch("/api/notifications/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "remote-test",
        subscription: { endpoint: json.endpoint, keys: json.keys },
      }),
    }).then((r) => r.json());
  })
);

document.getElementById("btn-push-test")?.addEventListener("click", () =>
  runAction("Push テスト", () => api("POST", "/api/remote-test/notify"))
);

bindTokenInputEvents();

const saved = getToken();
if (saved && tokenInput) tokenInput.value = saved;
syncSaveButton();

if (saved) {
  startPolling();
  refreshStatus(true).catch((err) => appendLog("起動時状態取得", { error: err.message }));
} else if (logEl) {
  logEl.textContent = "トークンを入力して保存してください。\n";
}
