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
let lastTvData = null;
let lastDemoAlert = null;
let tvViewIndex = 0;
const TV_VIEWS = ["overview", "cameras", "devices"];
const TV_VIEW_LABELS = { overview: "概要", cameras: "カメラ", devices: "設備" };

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

function applyTvView() {
  const normal = document.getElementById("tv-normal");
  if (!normal) return;
  const sections = {
    overview: ["tv-sites", "tv-summary", "tv-device-health", "tv-recovery"],
    cameras: ["tv-cameras"],
    devices: ["tv-devices"],
  };
  for (const id of ["tv-sites", "tv-summary", "tv-device-health", "tv-cameras", "tv-devices", "tv-recovery"]) {
    const el = document.getElementById(id);
    if (!el) continue;
    const view = TV_VIEWS[tvViewIndex];
    const show =
      view === "overview"
        ? sections.overview.includes(id)
        : view === "cameras"
          ? id === "tv-cameras"
          : id === "tv-devices";
    el.style.display = show ? "" : "none";
  }
  const label = document.getElementById("tv-view-label");
  if (label) label.textContent = `表示: ${TV_VIEW_LABELS[TV_VIEWS[tvViewIndex]] ?? ""}`;
}

function showTvDetail() {
  const overlay = document.getElementById("tv-detail-overlay");
  const body = document.getElementById("tv-detail-body");
  if (!overlay || !body) return;
  const lines = [];
  if (lastDemoAlert) {
    lines.push(`通知: ${lastDemoAlert.severity ?? ""} — ${lastDemoAlert.message ?? ""}`);
  }
  if (lastTvData?.summary) {
    const s = lastTvData.summary;
    lines.push(`設備 ${s.deviceCount} / オンライン ${s.onlineCount} / オフライン ${s.offlineCount}`);
  }
  if (lastTvData?.alerts?.[0]) {
    const a = lastTvData.alerts[0];
    lines.push(`最新アラート: ${a.message ?? a.event_type}`);
  }
  body.textContent = lines.join("\n") || "詳細情報なし";
  overlay.hidden = false;
}

function hideTvDetail() {
  const overlay = document.getElementById("tv-detail-overlay");
  if (overlay) overlay.hidden = true;
}

function hideDemoAlertOverlay() {
  const overlay = document.getElementById("tv-alert-overlay");
  const normal = document.getElementById("tv-normal");
  if (overlay) {
    overlay.hidden = true;
    overlay.classList.remove("tv-alert-overlay--demo");
  }
  if (normal) normal.style.visibility = "visible";
  clearInterval(alertTimer);
}

function render(data) {
  lastTvData = data;
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
  applyTvView();
}

export function showDemoAlert(alert) {
  lastDemoAlert = alert;
  const overlay = document.getElementById("tv-alert-overlay");
  const normal = document.getElementById("tv-normal");
  const msg = document.getElementById("tv-alert-message");
  const titleEl = document.getElementById("tv-alert-title");
  const timer = document.getElementById("tv-alert-timer");
  if (!overlay || !normal || !msg) return;
  hideTvDetail();
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
    if (sec <= 0) hideDemoAlertOverlay();
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
    const alertOverlay = document.getElementById("tv-alert-overlay");
    const alertOpen = alertOverlay && !alertOverlay.hidden;

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (alertOpen) return;
      tvViewIndex = (tvViewIndex + TV_VIEWS.length - 1) % TV_VIEWS.length;
      applyTvView();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (alertOpen) return;
      tvViewIndex = (tvViewIndex + 1) % TV_VIEWS.length;
      applyTvView();
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      moveFocus(-1, 0);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      moveFocus(1, 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (alertOpen || lastDemoAlert) showTvDetail();
      else focusables[focusIndex]?.click?.();
    } else if (e.key === "Escape" || e.key === "Backspace" || e.key === "BrowserBack") {
      e.preventDefault();
      if (alertOpen) hideDemoAlertOverlay();
      else hideTvDetail();
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
