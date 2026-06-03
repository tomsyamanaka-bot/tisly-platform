import { renderPwaTopbar } from "./tisly-pwa-shell.js";

const TOKEN_KEY = "tisly_token";
const MEMO_KEY = "tisly_maint_memo";

function apiHeaders() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiGet(path) {
  const res = await fetch(path, { headers: apiHeaders() });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

function customerCode() {
  return document.getElementById("maint-customer")?.value || "TOMS001";
}

async function loadDevices() {
  const code = customerCode();
  const list = document.getElementById("maint-devices");
  list.innerHTML = "<li>読込中…</li>";
  try {
    const data = await apiGet(`/api/customer/${code}/devices`);
    const devices = data.devices ?? data ?? [];
    list.innerHTML = (Array.isArray(devices) ? devices : [])
      .slice(0, 12)
      .map(
        (d) =>
          `<li>${d.label ?? d.deviceId} — <strong>${d.deviceStatus ?? d.status ?? "—"}</strong></li>`
      )
      .join("") || "<li>デバイスなし</li>";
  } catch {
    list.innerHTML = "<li>ログインが必要です（App Hub から）</li>";
  }
}

async function loadHeartbeat() {
  const code = customerCode();
  const el = document.getElementById("maint-heartbeat");
  try {
    const data = await apiGet(`/api/customer/${code}/devices/timeline`);
    const events = data.events ?? data.timeline ?? [];
    el.textContent = `直近イベント: ${Array.isArray(events) ? events.length : 0} 件`;
  } catch {
    el.textContent = "Heartbeat: 要ログイン";
  }
}

async function loadNotifications() {
  const code = customerCode();
  const list = document.getElementById("maint-notifications");
  try {
    const data = await apiGet(`/api/customer/${code}/events?limit=8`);
    const items = data.events ?? data.items ?? [];
    list.innerHTML = (Array.isArray(items) ? items : [])
      .slice(0, 8)
      .map((n) => `<li>${n.action ?? n.type ?? "通知"} — ${n.at ?? n.createdAt ?? ""}</li>`)
      .join("") || "<li>履歴なし</li>";
  } catch {
    list.innerHTML = "<li>要ログイン（App Hub）</li>";
  }
}

async function loadRecovery() {
  const list = document.getElementById("maint-recovery");
  try {
    const data = await apiGet("/api/recovery/overview");
    list.innerHTML = `<li>アクティブ: ${data.overview?.activeIncidents ?? data.activeIncidents ?? 0}</li>`;
  } catch {
    list.innerHTML = "<li>Recovery API は管理者トークンが必要な場合があります</li>";
  }
}

document.getElementById("maint-customer")?.addEventListener("change", () => {
  const code = customerCode();
  document.getElementById("link-install-history").href = `/customer/${code}/install/home`;
  loadDevices();
  loadHeartbeat();
  loadNotifications();
});

document.getElementById("btn-maint-save-memo")?.addEventListener("click", () => {
  localStorage.setItem(MEMO_KEY, document.getElementById("maint-memo")?.value ?? "");
});

document.getElementById("maint-memo")?.value = localStorage.getItem(MEMO_KEY) ?? "";

document.getElementById("maint-mqtt").textContent =
  navigator.onLine ? "MQTT: オンライン（ゲートウェイ経由）" : "MQTT: オフライン";

const code = sessionStorage.getItem("tisly_customer_code") || "TOMS001";
document.getElementById("maint-customer").value = code;
document.getElementById("link-install-history").href = `/customer/${code}/install/home`;

renderPwaTopbar("maintenance", "保守");
loadDevices();
loadHeartbeat();
loadNotifications();
loadRecovery();
