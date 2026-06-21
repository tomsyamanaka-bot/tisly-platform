import { MONITORING_DEVICE_ICONS, resolveMonitoringSiteFromPath } from "./tisly-monitoring-layout-v1.js";

const POLL_MS = 8000;
const params = new URLSearchParams(location.search);
const siteId = params.get("siteId") || resolveMonitoringSiteFromPath();
const isTvMode = params.get("mode") === "tv";

let dashboard = null;
let logFilter = "all";
let logView = "disaster";
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

function formatTimeShort(ts) {
  if (!ts) return "—";
  const d = new Date(ts.includes("T") ? ts : `${ts.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function levelClass(level) {
  if (level === "侵入警報") return "level-alert";
  if (level === "警報") return "level-warning";
  return "level-info";
}

function disasterRowClass(level) {
  if (level === "侵入警報") return "level-intrusion";
  if (level === "警報") return "level-alarm";
  if (level === "注意") return "level-caution";
  return "level-info";
}

function priorityBadge(level) {
  if (level === "侵入警報") return { cls: "intrusion", label: "侵入" };
  if (level === "警報") return { cls: "alarm", label: "警報" };
  if (level === "注意") return { cls: "caution", label: "注意" };
  return { cls: "info", label: "情報" };
}

function pinStatusClass(status, deviceId, alert) {
  if (alert?.deviceId === deviceId) return "status-alert is-blink";
  if (status === "warning") return "status-warning";
  if (status === "alert") return "status-alert";
  return "status-normal";
}

function buildArchitecture(floorId, siteKind) {
  if (floorId === "perimeter" && siteKind === "home") {
    return `<div class="mon3d-arch-layer mon3d-scene-perimeter">
      <div class="mon3d-arch-shadow"></div>
      <div class="mon3d-fence"></div>
      <div class="mon3d-garden"></div>
      <div class="mon3d-parking"></div>
      <div class="mon3d-house-footprint"></div>
      <div class="mon3d-entrance-path"></div>
      <div class="mon3d-back-door-zone"></div>
      <div class="mon3d-glow-light" style="left:18%;top:28%"></div>
    </div>`;
  }
  if (floorId === "1f" && siteKind === "home") {
    return `<div class="mon3d-arch-layer mon3d-scene-interior">
      <div class="mon3d-arch-shadow"></div>
      <div class="mon3d-room" style="left:8%;top:12%;width:84%;height:72%">
        <span class="mon3d-room-label">1階 間取り</span>
      </div>
      <div class="mon3d-room" style="left:12%;top:18%;width:35%;height:38%"><span class="mon3d-room-label">リビング</span></div>
      <div class="mon3d-room" style="left:52%;top:18%;width:35%;height:38%"><span class="mon3d-room-label">ホール</span></div>
      <div class="mon3d-room" style="left:38%;top:62%;width:24%;height:18%"><span class="mon3d-room-label">玄関</span></div>
      <div class="mon3d-room" style="left:8%;top:30%;width:14%;height:28%"><span class="mon3d-room-label">勝手口</span></div>
      <div class="mon3d-glass" style="left:48%;top:18%;width:2%;height:38%"></div>
      <div class="mon3d-glass" style="left:86%;top:18%;width:2%;height:38%"></div>
      <div class="mon3d-glow-light" style="left:28%;top:32%"></div>
    </div>`;
  }
  if (floorId === "2f" && siteKind === "home") {
    return `<div class="mon3d-arch-layer mon3d-scene-interior">
      <div class="mon3d-arch-shadow"></div>
      <div class="mon3d-room" style="left:8%;top:12%;width:84%;height:72%">
        <span class="mon3d-room-label">2階 間取り</span>
      </div>
      <div class="mon3d-room" style="left:12%;top:18%;width:38%;height:40%"><span class="mon3d-room-label">寝室</span></div>
      <div class="mon3d-room" style="left:54%;top:18%;width:34%;height:40%"><span class="mon3d-room-label">2階ホール</span></div>
      <div class="mon3d-room" style="left:42%;top:62%;width:18%;height:20%"><span class="mon3d-room-label">階段</span></div>
      <div class="mon3d-glass" style="left:50%;top:18%;width:2%;height:40%"></div>
    </div>`;
  }
  if (floorId === "roof") {
    return `<div class="mon3d-arch-layer mon3d-scene-interior">
      <div class="mon3d-arch-shadow"></div>
      <div class="mon3d-house-footprint" style="left:50%;top:45%;width:55%;height:40%"></div>
    </div>`;
  }
  return `<div class="mon3d-arch-layer mon3d-scene-interior"><div class="mon3d-arch-shadow"></div></div>`;
}

function renderAlertRings(dev, alert) {
  if (alert?.deviceId !== dev.deviceId) return "";
  return `<span class="mon3d-alert-ring" style="left:${dev.x}%;top:${dev.y}%"></span>
    <span class="mon3d-alert-ring" style="left:${dev.x}%;top:${dev.y}%"></span>
    <span class="mon3d-alert-ring" style="left:${dev.x}%;top:${dev.y}%"></span>`;
}

function renderFloorJump(floors, alert) {
  const root = $("#mon3d-floor-jump");
  if (!root) return;
  root.innerHTML = floors
    .map(
      (f) =>
        `<button type="button" data-floor-id="${f.floorId}" class="${alert?.floorId === f.floorId ? "is-active" : ""}">${f.floorName}</button>`
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
      const arch = buildArchitecture(floor.floorId, site.siteKind);
      const pins = floor.devices
        .map((dev) => {
          const icon = MONITORING_DEVICE_ICONS[dev.deviceType] ?? "📍";
          const cls = pinStatusClass(dev.status, dev.deviceId, alert);
          const rings = renderAlertRings(dev, alert);
          return `${rings}<button type="button" class="mon3d-device-pin ${cls}" data-device-id="${dev.deviceId}"
            style="left:${dev.x}%;top:${dev.y}%" title="${dev.deviceName}">
            ${icon}<span class="pin-label">${dev.areaName}</span></button>`;
        })
        .join("");
      const badge = isAlertFloor
        ? `<span class="mon3d-floor-badge alert-active">発報中</span>`
        : `<span class="mon3d-floor-badge">${floor.devices.length} 機器</span>`;
      return `<article class="mon3d-floor-card${isAlertFloor ? " is-alert" : ""}" id="floor-${floor.floorId}" data-floor-id="${floor.floorId}">
        <div class="mon3d-floor-header">
          <h3>${floor.floorName}</h3>
          ${badge}
        </div>
        <div class="mon3d-floor-scene" style="--floor-accent:${floor.accent}">${arch}${pins}</div>
      </article>`;
    })
    .join("");

  stack.querySelectorAll(".mon3d-device-pin").forEach((pin) => {
    pin.addEventListener("click", () => {
      const dev = findDevice(pin.dataset.deviceId);
      if (dev?.linkedCameraId || dev?.deviceType === "camera") {
        selectCamera(dev.linkedCameraId || dev.deviceId, dev.deviceName, dev.areaName);
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
  const panelAlert = $("#mon3d-panel-active-alert");
  if (!alert) {
    card.hidden = true;
    banner.hidden = true;
    if (panelAlert) panelAlert.hidden = true;
    updateGuardStatus(false);
    return;
  }
  card.hidden = false;
  banner.hidden = false;
  if (panelAlert) panelAlert.hidden = false;

  $("#mon3d-alert-level").textContent = alert.level;
  $("#mon3d-alert-headline").textContent = alert.headline;
  $("#mon3d-alert-place").textContent = `${alert.floorName} ${alert.areaName}`;
  $("#mon3d-alert-device").textContent = alert.deviceName;
  $("#mon3d-alert-time").textContent = formatTime(alert.timestamp);
  $("#mon3d-alert-status").textContent = "未対応";

  $("#mon3d-banner-level").textContent = alert.level;
  $("#mon3d-banner-place").textContent = `${alert.floorName} ${alert.areaName}`;
  $("#mon3d-banner-time").textContent = formatTimeShort(alert.timestamp);

  const panelHeadline = $("#mon3d-panel-alert-headline");
  const panelMeta = $("#mon3d-panel-alert-meta");
  if (panelHeadline) panelHeadline.textContent = alert.headline;
  if (panelMeta) panelMeta.textContent = `${alert.floorName} · ${alert.areaName} · ${formatTime(alert.timestamp)}`;

  if (alert.linkedCameraId) {
    selectCamera(alert.linkedCameraId, alert.deviceName, alert.areaName, true);
  }

  updateGuardStatus(true, alert.timestamp);
  $("#mon3d-last-detection") && ($("#mon3d-last-detection").textContent = formatTime(alert.timestamp));

  if (alert.id !== lastAlertId) {
    lastAlertId = alert.id;
    focusFloor(alert.floorId, isTvMode ? "auto" : "smooth");
  }
}

function updateGuardStatus(hasAlert, lastTs) {
  const armed = hasAlert || (dashboard?.stats?.alertCount ?? 0) > 0;
  const cls = armed ? "guard-armed" : "guard-normal";
  const label = armed ? "警戒中" : "正常";
  ["#mon3d-guard-status", "#mon3d-side-guard"].forEach((sel) => {
    const el = $(sel);
    if (el) {
      el.textContent = label;
      el.className = `mon3d-guard-badge ${cls}`;
    }
  });
  if (!hasAlert && lastTs) return;
  if (!hasAlert && dashboard?.recentLogs?.[0]) {
    const last = dashboard.recentLogs[0];
    $("#mon3d-last-detection") && ($("#mon3d-last-detection").textContent = formatTime(last.timestamp));
  }
}

function renderStats(stats) {
  $("#mon3d-stat-alert").textContent = String(stats.alertCount ?? 0);
  $("#mon3d-stat-warning").textContent = String(stats.warningCount ?? 0);
  $("#mon3d-stat-info").textContent = String(stats.infoCount ?? 0);
  $("#mon3d-stat-acked").textContent = String(stats.ackedCount ?? 0);
}

function renderSensorList(site, alert) {
  const root = $("#mon3d-sensor-list");
  if (!root) return;
  const sensors = [];
  for (const floor of site.floors) {
    for (const dev of floor.devices) {
      if (dev.deviceType === "camera" || dev.deviceType === "light") continue;
      const isAlert = alert?.deviceId === dev.deviceId;
      let statusCls = "ok";
      let statusLabel = "正常";
      if (isAlert || dev.status === "alert") {
        statusCls = "alert";
        statusLabel = "発報";
      } else if (dev.status === "warning") {
        statusCls = "warn";
        statusLabel = "注意";
      }
      sensors.push(`<li><span class="sensor-name">${dev.deviceName}</span><span class="sensor-status ${statusCls}">${statusLabel}</span></li>`);
    }
  }
  root.innerHTML = sensors.slice(0, 10).join("");
}

function renderOnlineCount(site) {
  let total = 0;
  let online = 0;
  for (const floor of site.floors) {
    for (const dev of floor.devices) {
      total += 1;
      if (dev.status !== "offline") online += 1;
    }
  }
  const el = $("#mon3d-online-devices");
  if (el) el.textContent = `${online}/${total}`;
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
      selectCamera(cam.cameraId, cam.label, cam.label, alert?.linkedCameraId === cam.cameraId);
    });
  });
  if (!selectedCameraId && cameras[0]) {
    const pick =
      alert?.linkedCameraId && cameras.some((c) => c.cameraId === alert.linkedCameraId)
        ? alert.linkedCameraId
        : cameras[0].cameraId;
    const cam = cameras.find((c) => c.cameraId === pick);
    selectCamera(pick, cam?.label ?? "カメラ", cam?.label, !!alert?.linkedCameraId);
  }
}

function selectCamera(cameraId, label, location, alertLinked = false) {
  selectedCameraId = cameraId;
  $("#mon3d-camera-label").textContent = label;
  const locEl = $("#mon3d-camera-location");
  if (locEl) locEl.textContent = location ? `📍 ${location}` : "発報地点と連動";
  const frame = $("#mon3d-camera-frame");
  if (frame) frame.classList.toggle("is-alert-linked", alertLinked);
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

  if (logView === "disaster") {
    body.className = "mon3d-log-disaster";
    body.innerHTML = `<table class="mon3d-disaster-table"><thead><tr>
      <th>優先度</th><th>時刻</th><th>フロア</th><th>場所</th><th>機器</th><th>内容</th><th>状態</th>
    </tr></thead><tbody>${filtered
      .map((log) => {
        const badge = priorityBadge(log.level);
        return `<tr class="${disasterRowClass(log.level)}">
          <td><span class="priority-badge ${badge.cls}">${badge.label}</span></td>
          <td>${formatTime(log.timestamp)}</td>
          <td>${log.floorName}</td>
          <td>${log.areaName}</td>
          <td>${log.deviceName}</td>
          <td>${log.content}</td>
          <td>${log.status === "acked" ? "対応済" : "未対応"}</td>
        </tr>`;
      })
      .join("")}</tbody></table>`;
    return;
  }

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

function setupTvLink() {
  const tvBtn = $("#mon3d-btn-tv");
  if (!tvBtn) return;
  const p = new URLSearchParams(location.search);
  p.set("mode", "tv");
  p.set("siteId", siteId);
  tvBtn.href = `${location.pathname}?${p.toString()}`;
  if (isTvMode) tvBtn.textContent = "通常表示";
}

async function refreshDashboard() {
  const data = await apiGet(`/api/monitoring/v1/dashboard?siteId=${encodeURIComponent(siteId)}`);
  dashboard = data;
  $("#mon3d-site-title").textContent = data.site.siteName;
  $("#mon3d-site-sub").textContent =
    data.site.siteKind === "home"
      ? "TiSLY Security Command Center — 戸建て監視"
      : "TiSLY Security Command Center — 施設監視";
  renderFloorJump(data.site.floors, data.activeAlert);
  renderFloors(data.site, data.activeAlert);
  renderAlertCard(data.activeAlert);
  renderStats(data.stats);
  renderSensorList(data.site, data.activeAlert);
  renderOnlineCount(data.site);
  renderCameras(data.site, data.activeAlert);
  renderLogs(data.recentLogs);
  if (data.activeAlert?.deviceId) {
    await loadCustomerLinks(data.activeAlert.deviceId);
  } else {
    updateGuardStatus(false);
  }
}

async function ackAlert() {
  if (!dashboard?.activeAlert) return;
  await apiPost(`/api/monitoring/v1/ack/${encodeURIComponent(dashboard.activeAlert.id)}`);
  lastAlertId = null;
  await refreshDashboard();
}

async function testAlert() {
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
  if (alert?.linkedCameraId) selectCamera(alert.linkedCameraId, alert.deviceName, alert.areaName, true);
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

setupTvLink();
tickClock();
setInterval(tickClock, 1000);
refreshDashboard().catch(console.error);
setInterval(() => refreshDashboard().catch(console.error), POLL_MS);
