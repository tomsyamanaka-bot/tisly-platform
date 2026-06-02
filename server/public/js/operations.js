import { apiGet, apiPost } from "./api.js";

const panels = document.querySelectorAll(".ops-panel");
const navButtons = document.querySelectorAll(".ops-nav button");

function showPanel(id) {
  panels.forEach((p) => p.classList.toggle("active", p.id === `panel-${id}`));
  navButtons.forEach((b) => b.classList.toggle("active", b.dataset.panel === id));
  location.hash = id;
}

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => showPanel(btn.dataset.panel));
});

const hash = location.hash.replace("#", "") || "map";
showPanel(hash || "map");

async function loadDemoStatus() {
  const st = await apiGet("/api/demo/status");
  const el = document.getElementById("demo-status");
  if (el) {
    el.textContent = st.runner.active
      ? `デモ稼働中 — ${st.runner.tickCount} イベント生成 / ${st.runner.deviceCount} 仮想機器`
      : "デモ停止中";
  }
}

document.getElementById("btn-demo-start")?.addEventListener("click", async () => {
  await apiPost("/api/demo/start");
  await loadDemoStatus();
});
document.getElementById("btn-demo-stop")?.addEventListener("click", async () => {
  await apiPost("/api/demo/stop");
  await loadDemoStatus();
});
document.getElementById("btn-demo-trigger")?.addEventListener("click", async () => {
  await apiPost("/api/demo/trigger");
  await loadMap();
  await loadDevices();
});

async function loadMap() {
  const data = await apiGet("/api/demo/map");
  const canvas = document.getElementById("map-canvas");
  if (!canvas) return;
  canvas.innerHTML = "";
  const positions = [
    { left: "22%", top: "35%" },
    { left: "48%", top: "28%" },
    { left: "72%", top: "42%" },
    { left: "35%", top: "62%" },
    { left: "58%", top: "68%" },
  ];
  data.markers.forEach((m, i) => {
    const pin = document.createElement("div");
    pin.className = `map-pin ${m.status === "warning" ? "warning" : ""}`;
    pin.style.left = positions[i]?.left ?? "50%";
    pin.style.top = positions[i]?.top ?? "50%";
    pin.title = m.address;
    pin.textContent = `${m.name} (${m.deviceCount})`;
    canvas.appendChild(pin);
  });
}

async function loadZones() {
  const data = await apiGet("/api/demo/zones");
  const el = document.getElementById("zones-list");
  if (!el) return;
  el.innerHTML = data.zones
    .map(
      (z) =>
        `<tr><td>${z.name}</td><td>${z.id}</td><td>${z.siteIds.length} 現場</td></tr>`
    )
    .join("");
}

async function loadDevices() {
  const data = await apiGet("/api/demo/devices");
  const el = document.getElementById("devices-body");
  if (!el) return;
  el.innerHTML = data.devices
    .map(
      (d) =>
        `<tr>
          <td>${d.label}</td>
          <td>${d.siteName ?? "—"}</td>
          <td>${d.zone ?? "—"}</td>
          <td><span class="badge ${d.heartbeatStatus}">${d.heartbeatStatus}</span></td>
          <td>${d.lastHeartbeatAt ?? "—"}</td>
          <td>${d.anomalyCount}</td>
        </tr>`
    )
    .join("");
}

async function loadAlarms() {
  const data = await apiGet("/api/demo/alarms");
  const el = document.getElementById("alarms-body");
  if (!el) return;
  el.innerHTML = data.alarms
    .slice(0, 50)
    .map(
      (a) =>
        `<tr>
          <td><span class="badge ${a.severity}">${a.severity}</span></td>
          <td>${a.created_at}</td>
          <td>${a.site_id ?? ""}</td>
          <td>${a.event_type}</td>
          <td>${a.message ?? a.title ?? ""}</td>
        </tr>`
    )
    .join("");
  document.getElementById("alarm-counts").textContent =
    `重大 ${data.counts.critical} / 警報 ${data.counts.alarm} / 警告 ${data.counts.warning}`;
}

let replayEvents = [];
let replayIndex = 0;

async function loadReplay() {
  const data = await apiGet("/api/demo/replay?limit=80");
  replayEvents = data.events;
  replayIndex = 0;
  renderReplay();
}

function renderReplay() {
  const timeline = document.getElementById("replay-timeline");
  if (!timeline) return;
  timeline.innerHTML = replayEvents
    .map(
      (e, i) =>
        `<div class="item ${i === replayIndex ? "current" : ""}" data-idx="${i}">
          ${e.created_at} — ${e.event_type} — ${e.message ?? e.title}
        </div>`
    )
    .join("");
  timeline.querySelectorAll(".item").forEach((item) => {
    item.addEventListener("click", () => {
      replayIndex = Number(item.dataset.idx);
      renderReplay();
    });
  });
  const cur = replayEvents[replayIndex];
  const detail = document.getElementById("replay-detail");
  if (detail && cur) {
    detail.textContent = JSON.stringify(cur, null, 2);
  }
}

document.getElementById("btn-replay-prev")?.addEventListener("click", () => {
  replayIndex = Math.max(0, replayIndex - 1);
  renderReplay();
});
document.getElementById("btn-replay-next")?.addEventListener("click", () => {
  replayIndex = Math.min(replayEvents.length - 1, replayIndex + 1);
  renderReplay();
});
document.getElementById("btn-replay-play")?.addEventListener("click", () => {
  const iv = setInterval(() => {
    if (replayIndex >= replayEvents.length - 1) {
      clearInterval(iv);
      return;
    }
    replayIndex++;
    renderReplay();
  }, 800);
});

async function loadAnalytics() {
  const data = await apiGet("/api/demo/analytics");
  document.getElementById("analytics-summary").innerHTML = `
    <div class="card stat"><div class="value">${data.eventCount}</div><div class="label">総イベント</div></div>
    <div class="card stat"><div class="value">${data.anomalyRate}%</div><div class="label">異常率</div></div>
    <div class="card stat"><div class="value">${data.deviceUptimeRate}%</div><div class="label">機器稼働率</div></div>
    <div class="card stat"><div class="value">${data.events24h}</div><div class="label">24h イベント</div></div>
  `;
  const types = document.getElementById("analytics-types");
  if (types) {
    types.innerHTML = (data.byType ?? [])
      .map((t) => `<tr><td>${t.event_type}</td><td>${t.count}</td></tr>`)
      .join("");
  }
}

async function loadHealth() {
  const data = await apiGet("/api/demo/health");
  const el = document.getElementById("health-grid");
  if (!el) return;
  el.innerHTML = data.components
    .map(
      (c) =>
        `<div class="card health-card">
          <h3>${c.name}</h3>
          <p class="status-${c.status === "ok" ? "ok" : c.status === "stopped" ? "stopped" : "degraded"}">${c.status}</p>
          <p style="font-size:0.85rem;color:var(--tisly-muted)">${typeof c.detail === "object" ? JSON.stringify(c.detail) : c.detail}</p>
        </div>`
    )
    .join("");
}

function renderCameras(grid) {
  const n = grid === 8 ? 8 : 4;
  const root = document.getElementById("camera-grid");
  if (!root) return;
  root.className = `camera-grid ${grid === 8 ? "g8" : "g4"}`;
  root.innerHTML = Array.from({ length: n }, (_, i) => {
    const live = i < 2;
    return `<div class="camera-tile ${live ? "live" : ""}">CH${i + 1} ${live ? "LIVE (デモ)" : "待機"}</div>`;
  }).join("");
}

document.querySelectorAll("[data-camera-grid]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-camera-grid]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderCameras(Number(btn.dataset.cameraGrid));
  });
});

function applyUiMode(mode) {
  document.body.classList.toggle("ui-simple", mode === "simple");
  localStorage.setItem("tisly.uiMode", mode);
}
function applyOperatorMode(mode) {
  localStorage.setItem("tisly.operatorMode", mode);
  document.getElementById("operator-label").textContent =
    mode === "soc" ? "SOC — セキュリティ運用" : "NOC — ネットワーク運用";
}

document.querySelectorAll("[data-ui-mode]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-ui-mode]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    applyUiMode(btn.dataset.uiMode);
  });
});
document.querySelectorAll("[data-operator-mode]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-operator-mode]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    applyOperatorMode(btn.dataset.operatorMode);
  });
});

const savedUi = localStorage.getItem("tisly.uiMode") ?? "professional";
const savedOp = localStorage.getItem("tisly.operatorMode") ?? "soc";
applyUiMode(savedUi);
applyOperatorMode(savedOp);
document.querySelector(`[data-ui-mode="${savedUi}"]`)?.classList.add("active");
document.querySelector(`[data-operator-mode="${savedOp}"]`)?.classList.add("active");

async function refreshAll() {
  await Promise.all([
    loadDemoStatus(),
    loadMap(),
    loadZones(),
    loadDevices(),
    loadAlarms(),
    loadReplay(),
    loadAnalytics(),
    loadHealth(),
  ]);
  renderCameras(4);
}

refreshAll().catch(console.error);
setInterval(() => {
  loadDevices().catch(console.error);
  loadAlarms().catch(console.error);
  loadDemoStatus().catch(console.error);
}, 15_000);
