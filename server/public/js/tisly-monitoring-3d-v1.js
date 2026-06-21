import { MONITORING_DEVICE_ICONS, resolveMonitoringSiteFromPath } from "./tisly-monitoring-layout-v1.js";

const POLL_MS = 8000;
const siteId = new URLSearchParams(location.search).get("siteId") || resolveMonitoringSiteFromPath();
const isTvMode = new URLSearchParams(location.search).get("mode") === "tv";

let dashboard = null;
let logFilter = "all";
let logView = "cards";
let selectedCameraId = null;
let lastAlertId = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

if (isTvMode) document.body.classList.add("mon3d-tv");

function apiGet(path) {
  return fetch(path).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  });
}

function apiPost(path, body) {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  }).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  });
}

function formatTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts.includes("T") ? ts : `${ts.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function levelClass(level) {
  if (level === "侵入警報") return "level-alert";
  if (level === "警報") return "level-warning";
  return "level-info";
}

function pinStatusClass(status, deviceId, alert) {
  if (alert?.deviceId === deviceId) return "status-alert is-blink";
  if (status === "warning") return "status-warning";
  if (status === "alert") return "status-alert";
  return "status-normal";
}

function renderFloorJump(floors) {
  const root = $("#mon3d-floor-jump");
  if (!root) return;
  root.innerHTML = floors
    .map(
      (f) =>
        `<button type="button" data-floor-id="${f.floorId}">${f.floorName}</button>`
    )
    .join("");
  root.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => focusFloor(btn.dataset.floorId));
  });
}

function renderFloors(site, alert) {
  const stack = $("#mon3d-floor-stack");
  if (!stack) return;
  stack.innerHTML = site.floors
    .map((floor) => {
      const isAlertFloor = alert?.floorId === floor.floorId;
      const pins = floor.devices
        .map((dev) => {
          const icon = MONITORING_DEVICE_ICONS[dev.deviceType] ?? "📍";
          const cls = pinStatusClass(dev.status, dev.deviceId, alert);
          return `<button type="button" class="mon3d-device-pin ${cls}" data-device-id="${dev.deviceId}"
            style="left:${dev.x}%;top:${dev.y}%" title="${dev.deviceName}">
            ${icon}<span class="pin-label">${dev.areaName}</span></button>`;
        })
        .join("");
      return `<article class="mon3d-floor-card${isAlertFloor ? " is-alert" : ""}" id="floor-${floor.floorId}" data-floor-id="${floor.floorId}">
        <div class="mon3d-floor-header">
          <h3>${floor.floorName}</h3>
          <span class="mon3d-muted">${floor.devices.length} 機器</span>
        </div>
        <div class="mon3d-floor-scene" style="--floor-accent:${floor.accent}">${pins}</div>
      </article>`;
    })
    .join("");

  stack.querySelectorAll(".mon3d-device-pin").forEach((pin) => {
    pin.addEventListener("click", () => {
      const dev = findDevice(pin.dataset.deviceId);
      if (dev?.linkedCameraId || dev?.deviceType === "camera") {
        selectCamera(dev.linkedCameraId || dev.deviceId, dev.deviceName);
      }
    });
  });
}

function findDevice(deviceId) {
  if (!dashboard?.site) return null;
  for (const floor of dashboard.site.floors) {
    const hit = floor.devices.find((d) => d.deviceId === deviceId);
    if (hit) return hit;
  }
  return null;
}

function focusFloor(floorId, behavior = "smooth") {
  const el = document.getElementById(`floor-${floorId}`);
  if (el) el.scrollIntoView({ behavior, block: "center" });
}

function renderAlertCard(alert) {
  const card = $("#mon3d-alert-card");
  const banner = $("#mon3d-alert-banner");
  if (!alert) {
    card.hidden = true;
    banner.hidden = true;
    return;
  }
  card.hidden = false;
  banner.hidden = false;
  $("#mon3d-alert-level").textContent = alert.level;
  $("#mon3d-alert-headline").textContent = alert.headline;
  $("#mon3d-alert-place").textContent = `${alert.floorName} ${alert.areaName}`;
  $("#mon3d-alert-device").textContent = alert.deviceName;
  $("#mon3d-alert-time").textContent = formatTime(alert.timestamp);
  $("#mon3d-alert-status").textContent = "未対応";
  banner.textContent = alert.headline;

  if (alert.linkedCameraId) {
    selectCamera(alert.linkedCameraId, alert.deviceName);
  }

  if (alert.id !== lastAlertId) {
    lastAlertId = alert.id;
    focusFloor(alert.floorId, isTvMode ? "auto" : "smooth");
  }
}

function renderStats(stats) {
  $("#mon3d-stat-alert").textContent = String(stats.alertCount ?? 0);
  $("#mon3d-stat-warning").textContent = String(stats.warningCount ?? 0);
  $("#mon3d-stat-info").textContent = String(stats.infoCount ?? 0);
  $("#mon3d-stat-acked").textContent = String(stats.ackedCount ?? 0);
}

function renderCameras(site, alert) {
  const cameras = site.defaultCameras ?? [];
  const switchRoot = $("#mon3d-camera-switch");
  switchRoot.innerHTML = cameras
    .map(
      (c) =>
        `<button type="button" data-camera-id="${c.cameraId}" class="${selectedCameraId === c.cameraId ? "active" : ""}">${c.label}</button>`
    )
    .join("");
  switchRoot.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cam = cameras.find((c) => c.cameraId === btn.dataset.cameraId);
      selectCamera(cam.cameraId, cam.label);
    });
  });
  if (!selectedCameraId && cameras[0]) {
    const pick =
      alert?.linkedCameraId &&
      cameras.some((c) => c.cameraId === alert.linkedCameraId)
        ? alert.linkedCameraId
        : cameras[0].cameraId;
    const label = cameras.find((c) => c.cameraId === pick)?.label ?? "カメラ";
    selectCamera(pick, label);
  }
}

function selectCamera(cameraId, label) {
  selectedCameraId = cameraId;
  $("#mon3d-camera-label").textContent = label;
  $$("#mon3d-camera-switch button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.cameraId === cameraId);
  });
}

function renderLogs(logs) {
  const body = $("#mon3d-log-body");
  const filtered = logs.filter((log) => {
    if (logFilter === "alarm") return log.level === "侵入警報" || log.level === "警報";
    if (logFilter === "info") return log.level === "情報";
    if (logFilter === "acked") return log.status === "acked";
    return true;
  });

  if (logView === "table") {
    body.className = "mon3d-log-cards view-table";
    body.innerHTML = `<table class="mon3d-log-table"><thead><tr>
      <th>時刻</th><th>レベル</th><th>フロア</th><th>場所</th><th>機器</th><th>内容</th><th>状態</th>
    </tr></thead><tbody>${filtered
      .map(
        (log) => `<tr class="${levelClass(log.level)}">
        <td>${formatTime(log.timestamp)}</td>
        <td>${log.level}</td>
        <td>${log.floorName}</td>
        <td>${log.areaName}</td>
        <td>${log.deviceName}</td>
        <td>${log.content}</td>
        <td>${log.status === "acked" ? "対応済" : "未対応"}</td>
      </tr>`
      )
      .join("")}</tbody></table>`;
    return;
  }

  body.className = "mon3d-log-cards";
  body.innerHTML = filtered
    .map(
      (log) => `<article class="mon3d-log-card ${levelClass(log.level)}">
      <time>${formatTime(log.timestamp)}</time>
      <p class="log-level">${log.level}</p>
      <p class="log-place">${log.floorName} · ${log.areaName} · ${log.deviceName}</p>
      <p class="log-content">${log.content}</p>
    </article>`
    )
    .join("");
}

async function loadCustomerLinks(deviceId) {
  if (!deviceId) return;
  try {
    const data = await apiGet(
      `/api/monitoring/v1/customer-links?siteId=${encodeURIComponent(siteId)}&deviceId=${encodeURIComponent(deviceId)}`
    );
    $("#mon3d-link-equipment").href = data.links.equipmentUrl;
    $("#mon3d-link-materials").href = data.links.materialsUrl;
  } catch {
    /* ignore */
  }
}

async function refreshDashboard() {
  const data = await apiGet(`/api/monitoring/v1/dashboard?siteId=${encodeURIComponent(siteId)}`);
  dashboard = data;
  $("#mon3d-site-title").textContent = data.site.siteName;
  $("#mon3d-site-sub").textContent =
    data.site.siteKind === "home" ? "戸建て 3D俯瞰監視" : "施設 3D俯瞰監視";
  renderFloorJump(data.site.floors);
  renderFloors(data.site, data.activeAlert);
  renderAlertCard(data.activeAlert);
  renderStats(data.stats);
  renderCameras(data.site, data.activeAlert);
  renderLogs(data.recentLogs);
  if (data.activeAlert?.deviceId) {
    await loadCustomerLinks(data.activeAlert.deviceId);
  }
}

async function ackAlert() {
  if (!dashboard?.activeAlert) return;
  await apiPost(`/api/monitoring/v1/ack/${encodeURIComponent(dashboard.activeAlert.id)}`);
  lastAlertId = null;
  await refreshDashboard();
}

async function testAlert() {
  const floorId = dashboard?.activeAlert?.floorId ?? "1f";
  await apiPost("/api/monitoring/v1/test-alert", { siteId, floorId: "1f" });
  await refreshDashboard();
}

function tickClock() {
  const el = $("#mon3d-clock");
  if (el) el.textContent = new Date().toLocaleTimeString("ja-JP");
}

$("#mon3d-btn-refresh")?.addEventListener("click", () => refreshDashboard().catch(console.error));
$("#mon3d-btn-test")?.addEventListener("click", () => testAlert().catch(console.error));
$("#mon3d-btn-ack")?.addEventListener("click", () => ackAlert().catch(console.error));
$("#mon3d-btn-camera")?.addEventListener("click", () => {
  const alert = dashboard?.activeAlert;
  if (alert?.linkedCameraId) selectCamera(alert.linkedCameraId, alert.deviceName);
  document.querySelector(".mon3d-right-panel")?.scrollIntoView({ behavior: "smooth" });
});
$("#mon3d-btn-log-focus")?.addEventListener("click", () => {
  $(".mon3d-log-section")?.scrollIntoView({ behavior: "smooth" });
});

$$(".mon3d-log-tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".mon3d-log-tabs button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    logFilter = btn.dataset.logFilter;
    if (dashboard) renderLogs(dashboard.recentLogs);
  });
});

$$(".mon3d-view-toggle button").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".mon3d-view-toggle button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    logView = btn.dataset.logView;
    if (dashboard) renderLogs(dashboard.recentLogs);
  });
});

$$(".mon3d-bottom-nav button").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".mon3d-bottom-nav button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.dataset.scroll;
    if (target === "map") $("#mon3d-floor-stack")?.scrollIntoView({ behavior: "smooth" });
    if (target === "alert") $("#mon3d-alert-card")?.scrollIntoView({ behavior: "smooth" });
    if (target === "camera") $(".mon3d-right-panel")?.scrollIntoView({ behavior: "smooth" });
    if (target === "logs") $(".mon3d-log-section")?.scrollIntoView({ behavior: "smooth" });
  });
});

tickClock();
setInterval(tickClock, 1000);
refreshDashboard().catch(console.error);
setInterval(() => refreshDashboard().catch(console.error), POLL_MS);
