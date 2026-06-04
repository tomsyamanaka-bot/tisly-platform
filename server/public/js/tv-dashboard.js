import { getAdminToken, setAdminToken } from "./api.js";

const pathMatch = location.pathname.match(/\/tv\/([^/]+)/i);
const customerCode = pathMatch ? pathMatch[1].toUpperCase() : "";
const REFRESH_MS = 15000;
const ALERT_SEC = 10;
const WS_PATH = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;

let lastAlertId = null;
let alertTimer = null;
let focusIndex = 0;
let focusables = [];

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
        `<div class="tv-site-chip" tabindex="0"><span>${s.site_name}</span>
         <span class="${s.status === "alarm" ? "offline" : ""}">${s.status === "alarm" ? "警報" : "正常"}</span></div>`
    )
    .join("");

  const s = data.summary;
  document.getElementById("tv-summary").innerHTML = `
    <div class="tv-metric" tabindex="0"><div class="label">設備</div><div class="value">${s.deviceCount}</div></div>
    <div class="tv-metric" tabindex="0"><div class="label">オンライン</div><div class="value">${s.onlineCount}</div></div>
    <div class="tv-metric" tabindex="0"><div class="label">オフライン</div><div class="value">${s.offlineCount}</div></div>
    <div class="tv-metric" tabindex="0"><div class="label">状態</div><div class="value">${
      s.overallStatus === "normal" ? "正常" : s.overallStatus === "warning" ? "警告" : "異常"
    }</div></div>
  `;

  const dh = data.deviceHealth ?? {};
  const healthEl = document.getElementById("tv-device-health");
  if (healthEl) {
    healthEl.innerHTML = `
      <h2 class="tv-section-title">Device Health</h2>
      <div class="tv-summary">
        <div class="tv-metric"><div class="label">総数</div><div class="value">${dh.total ?? s.deviceCount}</div></div>
        <div class="tv-metric online"><div class="label">ONLINE</div><div class="value">${dh.online ?? s.onlineCount}</div></div>
        <div class="tv-metric warn"><div class="label">WARNING</div><div class="value">${dh.warning ?? 0}</div></div>
        <div class="tv-metric offline"><div class="label">OFFLINE</div><div class="value">${dh.offline ?? s.offlineCount}</div></div>
      </div>`;
  }

  document.getElementById("tv-cameras").innerHTML = (data.cameras ?? [])
    .slice(0, 4)
    .map(
      (d) =>
        `<div class="tv-camera-frame ${d.online ? "" : "offline"}" tabindex="0">
          <div class="cam-label">${d.label ?? d.deviceId}</div>
          <div class="cam-placeholder">カメラ枠</div>
        </div>`
    )
    .join("");

  document.getElementById("tv-devices").innerHTML = (data.devices ?? [])
    .map(
      (d) =>
        `<div class="tv-device ${d.online ? "" : "offline"}" tabindex="0">
          <div>${d.deviceType}</div>
          <strong>${d.label ?? d.deviceId}</strong>
          <div>${d.online ? "ONLINE" : "OFFLINE"}</div>
        </div>`
    )
    .join("");

  document.getElementById("tv-recovery").textContent = `Recovery: ${data.recoveryStatus ?? "—"}`;

  const pin = data.certPinning ?? {};
  const pinEl = document.getElementById("tv-pinning-info");
  if (pinEl) {
    pinEl.innerHTML = `証明書ピン: ${pin.enabled ? "ON" : "OFF"} · FP: ${(pin.fingerprint ?? "—").slice(0, 24)}… · 最終確認: ${pin.lastVerified ?? "未検証"}`;
  }

  const alert = data.alerts?.[0];
  if (alert && alert.id !== lastAlertId) {
    showDemoAlert({
      severity: alert.severity,
      message: alert.message || alert.event_type,
      title: "アラート",
    });
    lastAlertId = alert.id;
  }

  refreshFocusables();
}

export function showDemoAlert(alert) {
  const overlay = document.getElementById("tv-alert-overlay");
  const normal = document.getElementById("tv-normal");
  const msg = document.getElementById("tv-alert-message");
  const titleEl = overlay?.querySelector("h2");
  const timer = document.getElementById("tv-alert-timer");
  if (!overlay || !normal || !msg) return;
  if (titleEl) titleEl.textContent = alert.title ?? "デモ通知";
  overlay.hidden = false;
  overlay.classList.add("tv-alert-overlay--demo");
  normal.style.visibility = "hidden";
  msg.textContent = `${alert.severity ?? "ALARM"}: ${alert.message ?? alert.body ?? ""}`;

  let sec = ALERT_SEC;
  if (timer) timer.textContent = String(sec);
  clearInterval(alertTimer);
  alertTimer = setInterval(() => {
    sec -= 1;
    if (timer) timer.textContent = String(sec);
    if (sec <= 0) {
      clearInterval(alertTimer);
      overlay.hidden = true;
      overlay.classList.remove("tv-alert-overlay--demo");
      normal.style.visibility = "visible";
    }
  }, 1000);
}

function refreshFocusables() {
  focusables = [...document.querySelectorAll("#tv-normal [tabindex='0'], #tv-normal a")];
  focusables.forEach((el, i) => {
    el.classList.toggle("tv-focus", i === focusIndex);
  });
}

function moveFocus(dx, dy) {
  if (!focusables.length) return;
  const cols = 2;
  if (dy !== 0) {
    focusIndex = (focusIndex + dy * cols + focusables.length) % focusables.length;
  } else if (dx !== 0) {
    focusIndex = (focusIndex + dx + focusables.length) % focusables.length;
  }
  refreshFocusables();
  focusables[focusIndex]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function wireTvRemote() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(0, -1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(0, 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      moveFocus(-1, 0);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      moveFocus(1, 0);
    } else if (e.key === "Enter") {
      focusables[focusIndex]?.click?.();
    } else if (e.key === "Escape" || e.key === "Backspace" || e.key === "BrowserBack") {
      const overlay = document.getElementById("tv-alert-overlay");
      if (overlay && !overlay.hidden) {
        overlay.hidden = true;
        document.getElementById("tv-normal").style.visibility = "visible";
        clearInterval(alertTimer);
      }
    }
  });
}

function connectTvWs() {
  if (!customerCode || typeof WebSocket === "undefined") return;
  const ws = new WebSocket(WS_PATH);
  ws.onopen = () => {
    ws.send(
      JSON.stringify({ type: "subscribe", channel: "tv", customerCode })
    );
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.payload?.channel === "tv_mirror" || msg.topic?.includes(`/tv/${customerCode}`)) {
        showDemoAlert({
          title: msg.payload.title ?? "営業デモ通知",
          severity: msg.payload.severity ?? "alarm",
          message: msg.payload.message ?? msg.payload.body,
        });
        void refresh();
      }
    } catch {
      /* */
    }
  };
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
wireTvRemote();
connectTvWs();
refresh();
setInterval(refresh, REFRESH_MS);
