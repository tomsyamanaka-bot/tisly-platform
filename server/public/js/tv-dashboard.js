import { getAdminToken, setAdminToken } from "./api.js";

const pathMatch = location.pathname.match(/\/tv\/([^/]+)/i);
const customerCode = pathMatch ? pathMatch[1].toUpperCase() : "";
const REFRESH_MS = 15000;
const ALERT_SEC = 10;

let lastAlertId = null;
let alertTimer = null;

function authHeaders() {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function ensureToken() {
  if (getAdminToken()) return;
  const res = await fetch("/api/auth/customer/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerCode,
      username: `${customerCode.toLowerCase()}.viewer`,
      password: "demo-remote-2026",
    }),
  });
  if (res.ok) {
    const data = await res.json();
    setAdminToken(data.token);
  }
}

async function fetchTv() {
  const res = await fetch(`/api/customer/${customerCode}/tv`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function tickClock() {
  const el = document.getElementById("tv-clock");
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function render(data) {
  const color = data.branding?.company_color ?? "#1a7f37";
  document.documentElement.style.setProperty("--tv-accent", color);
  document.getElementById("tv-company").textContent =
    data.branding?.company_name ?? data.customer.customer_name;
  document.getElementById("tv-code").textContent = data.customer.customer_code;
  if (data.branding?.logo_url) {
    const img = document.getElementById("tv-logo");
    img.src = data.branding.logo_url;
    img.hidden = false;
  }

  document.getElementById("tv-sites").innerHTML = (data.sites ?? [])
    .map(
      (s) =>
        `<div class="tv-site-chip"><span>${s.site_name}</span>
         <span class="${s.status === "alarm" ? "offline" : ""}">${s.status === "alarm" ? "警報" : "正常"}</span></div>`
    )
    .join("");

  const s = data.summary;
  document.getElementById("tv-summary").innerHTML = `
    <div class="tv-metric"><div class="label">設備</div><div class="value">${s.deviceCount}</div></div>
    <div class="tv-metric"><div class="label">オンライン</div><div class="value">${s.onlineCount}</div></div>
    <div class="tv-metric"><div class="label">オフライン</div><div class="value">${s.offlineCount}</div></div>
    <div class="tv-metric"><div class="label">状態</div><div class="value">${
      s.overallStatus === "normal" ? "正常" : s.overallStatus === "warning" ? "警告" : "異常"
    }</div></div>
  `;

  document.getElementById("tv-cameras").innerHTML = (data.cameras ?? [])
    .slice(0, 4)
    .map(
      (d) =>
        `<div class="tv-camera-frame ${d.online ? "" : "offline"}">
          <div class="cam-label">${d.label ?? d.deviceId}</div>
          <div class="cam-placeholder">カメラ枠</div>
        </div>`
    )
    .join("");

  document.getElementById("tv-devices").innerHTML = (data.devices ?? [])
    .map(
      (d) =>
        `<div class="tv-device ${d.online ? "" : "offline"}">
          <div>${d.deviceType}</div>
          <strong>${d.label ?? d.deviceId}</strong>
          <div>${d.online ? "ONLINE" : "OFFLINE"}</div>
        </div>`
    )
    .join("");

  document.getElementById("tv-recovery").textContent = `Recovery: ${data.recoveryStatus ?? "—"}`;

  const alert = data.alerts?.[0];
  if (alert && alert.id !== lastAlertId) {
    showAlert(alert);
    lastAlertId = alert.id;
  }
}

function showAlert(alert) {
  const overlay = document.getElementById("tv-alert-overlay");
  const normal = document.getElementById("tv-normal");
  const msg = document.getElementById("tv-alert-message");
  const timer = document.getElementById("tv-alert-timer");
  overlay.hidden = false;
  normal.style.visibility = "hidden";
  msg.textContent = `${alert.severity}: ${alert.message || alert.event_type}`;

  let sec = ALERT_SEC;
  timer.textContent = String(sec);
  clearInterval(alertTimer);
  alertTimer = setInterval(() => {
    sec -= 1;
    timer.textContent = String(sec);
    if (sec <= 0) {
      clearInterval(alertTimer);
      overlay.hidden = true;
      normal.style.visibility = "visible";
    }
  }, 1000);
}

async function refresh() {
  try {
    await ensureToken();
    const data = await fetchTv();
    render(data);
  } catch (e) {
    console.error(e);
  }
}

tickClock();
setInterval(tickClock, 1000);
refresh();
setInterval(refresh, REFRESH_MS);
