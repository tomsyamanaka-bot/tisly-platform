import { apiGet, apiPost, apiLogin, apiLogout, getAdminToken } from "./api.js";
import { mountSiteSelector, mountTenantSelector, getSelectedSiteId } from "./selectors.js";

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
  const [data, ai] = await Promise.all([
    apiGet("/api/demo/analytics"),
    apiGet("/api/analytics/overview").catch(() => null),
  ]);
  const riskAvg = ai?.risk?.avg24h ?? "—";
  document.getElementById("analytics-summary").innerHTML = `
    <div class="card stat"><div class="value">${data.eventCount}</div><div class="label">総イベント</div></div>
    <div class="card stat"><div class="value">${data.anomalyRate}%</div><div class="label">異常率</div></div>
    <div class="card stat"><div class="value">${riskAvg}</div><div class="label">AI Risk (24h)</div></div>
    <div class="card stat"><div class="value">${data.events24h}</div><div class="label">24h イベント</div></div>
  `;
  const aiEl = document.getElementById("analytics-ai-summary");
  if (aiEl && ai?.summary?.today) {
    aiEl.innerHTML = `<p><strong>AI:</strong> ${ai.summary.today.bullets.map((b) => b.text).join(" / ")}</p>`;
  }
  const types = document.getElementById("analytics-types");
  if (types) {
    types.innerHTML = (data.byType ?? [])
      .map((t) => `<tr><td>${t.event_type}</td><td>${t.count}</td></tr>`)
      .join("");
  }
}

async function loadSocNoc(mode) {
  const endpoint = mode === "soc" ? "/api/ops/soc" : "/api/ops/noc";
  const data = await apiGet(endpoint);
  const socPanel = document.getElementById("panel-soc");
  const nocPanel = document.getElementById("panel-noc");
  if (mode === "soc") {
    socPanel.style.display = "block";
    nocPanel.style.display = "none";
    document.getElementById("soc-content").innerHTML = `
      <p>${data.nlReport?.paragraphs?.join("<br>") ?? ""}</p>
      <ul>${(data.summary?.bullets ?? []).map((b) => `<li>${b.text}</li>`).join("")}</ul>
    `;
  } else {
    socPanel.style.display = "none";
    nocPanel.style.display = "block";
    document.getElementById("noc-content").innerHTML = `
      <p>稼働率 ${data.sla?.uptimePercent}% / MTTR ${data.mttr} 分</p>
      <p>オフライン: ${(data.offlineDevices ?? []).length} 台</p>
    `;
  }
}

async function loadHealth() {
  const data = await apiGet("/api/health");
  const el = document.getElementById("health-grid");
  if (!el) return;
  const comps = data.components ?? {};
  el.innerHTML = Object.entries(comps)
    .map(
      ([name, c]) =>
        `<div class="card health-card">
          <h3>${name}</h3>
          <p class="status-${c.status === "ok" ? "ok" : "degraded"}">${c.status}</p>
          <p style="font-size:0.85rem;color:var(--tisly-muted)">${JSON.stringify(c)}</p>
        </div>`
    )
    .join("");
}

async function loadSites() {
  const data = await apiGet("/api/sites");
  const el = document.getElementById("sites-list");
  if (!el) return;
  el.innerHTML = `<table><thead><tr><th>名称</th><th>テンプレ</th><th>状態</th></tr></thead><tbody>${data.sites
    .map((s) => `<tr><td>${s.name}</td><td>${s.templateId ?? "—"}</td><td>${s.status}</td></tr>`)
    .join("")}</tbody></table>`;
  const tpl = await apiGet("/api/sites/templates");
  const sel = document.getElementById("new-site-template");
  if (sel) {
    sel.innerHTML = tpl.templates.map((t) => `<option value="${t.id}">${t.label}</option>`).join("");
  }
}

async function loadTv() {
  const data = await apiGet("/api/tv/devices");
  const el = document.getElementById("tv-body");
  if (!el) return;
  el.innerHTML = (data.devices ?? [])
    .map(
      (t) =>
        `<tr><td>${t.displayName}</td><td>${t.siteId ?? "—"}</td><td>${t.status}</td><td>${t.lastSeenAt ?? "—"}</td><td>${t.pairedAt ? "済" : t.hasActivePairingCode ? "コード発行中" : "未"}</td></tr>`
    )
    .join("") || "<tr><td colspan='5'>TV 未登録</td></tr>";
}

async function loadSecurity() {
  const statusEl = document.getElementById("security-auth-status");
  const grid = document.getElementById("security-grid");
  const auditEl = document.getElementById("security-audit-body");
  const sessionsEl = document.getElementById("security-sessions-body");
  const token = getAdminToken();
  if (!token) {
    if (statusEl) statusEl.textContent = "未ログイン — 管理 API は認証が必要です";
    if (grid) grid.innerHTML = "";
    if (auditEl) auditEl.innerHTML = "<tr><td colspan='4'>ログイン後に表示</td></tr>";
    if (sessionsEl) sessionsEl.innerHTML = "<tr><td colspan='4'>ログイン後に表示</td></tr>";
    return;
  }
  try {
    const data = await apiGet("/api/security/overview");
    if (statusEl) {
      statusEl.textContent = data.auth?.configured
        ? `ログイン中: ${data.auth.user?.username ?? "admin"}`
        : "認証未設定（.env に JWT_SECRET を設定）";
    }
    if (grid) {
      grid.innerHTML = `
        <div class="health-card"><h3>認証</h3><p>${data.auth?.configured ? "OK" : "未設定"}</p><p>失敗ログイン: ${data.auth?.failedLoginCount ?? 0}</p></div>
        <div class="health-card"><h3>セッション</h3><p>アクティブ: ${data.sessions?.length ?? 0}</p></div>
        <div class="health-card"><h3>Rate Limit</h3><p>${data.rateLimit?.provider ?? "memory"}</p></div>
        <div class="health-card"><h3>DB Provider</h3><p>${data.dbProvider?.provider ?? "sqlite"}</p></div>
        <div class="health-card"><h3>Ingest 重複</h3><p>${data.ingestDuplicates ?? 0}</p></div>
        <div class="health-card"><h3>署名エラー</h3><p>${data.signatureErrors ?? 0}</p></div>
        <div class="health-card"><h3>Replay 拒否</h3><p>${data.replayBlocked ?? 0}</p></div>
        <div class="health-card"><h3>SIEM Export</h3><p>${data.siemExport?.enabled ? "有効" : "無効"} (${data.siemExport?.exportCount ?? 0})</p></div>
        <div class="health-card"><h3>Device Secrets</h3><p>有効: ${data.deviceSecrets?.active ?? 0}</p><p>Ingest: ${data.deviceSecrets?.ingestConfigured ? "設定済" : "未設定"}</p></div>
        <div class="health-card"><h3>TV</h3><p>ペアリング中: ${data.tvPairing?.pairing ?? 0}</p><p>無効化: ${data.tvPairing?.revoked ?? 0}</p></div>
        <div class="health-card"><h3>Ingest エラー</h3><p>${data.ingestErrors ?? 0}</p></div>`;
    }
    if (sessionsEl) {
      sessionsEl.innerHTML = (data.sessions ?? [])
        .map(
          (s) =>
            `<tr><td>${s.id.slice(0, 8)}…</td><td>${s.ipAddress ?? "—"}</td><td>${s.createdAt}</td><td>${s.expiresAt}</td></tr>`
        )
        .join("") || "<tr><td colspan='4'>アクティブセッションなし</td></tr>";
    }
    if (auditEl) {
      auditEl.innerHTML = (data.auditLogSample ?? [])
        .map(
          (a) =>
            `<tr><td>${a.createdAt}</td><td>${a.action}</td><td>${a.targetType ?? ""} ${a.targetId ?? ""}</td><td>${a.userId ?? a.actorLabel}</td></tr>`
        )
        .join("") || "<tr><td colspan='4'>なし</td></tr>";
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = e.message;
  }
}

document.getElementById("btn-sec-login")?.addEventListener("click", async () => {
  const username = document.getElementById("sec-username")?.value || "admin";
  const password = document.getElementById("sec-password")?.value || "";
  await apiLogin(username, password);
  await loadSecurity();
  await refreshAll();
});

document.getElementById("btn-sec-logout")?.addEventListener("click", async () => {
  await apiLogout();
  await loadSecurity();
});

async function loadRecoveryOps() {
  const data = await apiGet("/api/recovery/console");
  const el = document.getElementById("recovery-ops-summary");
  if (!el) return;
  el.innerHTML = `<p>アクティブ: ${data.overview?.activeIncidents ?? 0} / 直近 Run: ${(data.recentRuns ?? []).length}</p>`;
}

async function loadRealDevices() {
  const siteId = getSelectedSiteId();
  const q = siteId ? `?siteId=${encodeURIComponent(siteId)}` : "";
  const data = await apiGet(`/api/devices${q}`);
  const el = document.getElementById("devices-body");
  if (!el || !data.devices?.length) return;
  const merged = data.devices.map((d) => ({
    label: d.label,
    siteName: d.siteId,
    zone: d.metadata?.zone_name ?? "—",
    status: d.heartbeatStatus,
    lastSeen: d.lastHeartbeatAt ?? "—",
    anomalies: 0,
  }));
  if (merged.length) {
    el.innerHTML = merged
      .map(
        (d) =>
          `<tr><td>${d.label}</td><td>${d.siteName}</td><td>${d.zone}</td><td>${d.status}</td><td>${d.lastSeen}</td><td>${d.anomalies}</td></tr>`
      )
      .join("");
  }
}

document.getElementById("btn-create-site-ops")?.addEventListener("click", async () => {
  const name = document.getElementById("new-site-name")?.value || "新規現場";
  const templateId = document.getElementById("new-site-template")?.value;
  await apiPost("/api/sites/create", { name, templateId });
  await loadSites();
  await loadMap();
});

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
  void loadSocNoc(mode);
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
    loadRealDevices(),
    loadAlarms(),
    loadReplay(),
    loadAnalytics(),
    loadHealth(),
    loadSites(),
    loadTv(),
    loadRecoveryOps(),
    loadSecurity(),
  ]);
  renderCameras(4);
}

mountTenantSelector("tenant-selector", () => refreshAll().catch(console.error));
mountSiteSelector("site-selector", () => refreshAll().catch(console.error));

refreshAll().catch(console.error);
setInterval(() => {
  loadDevices().catch(console.error);
  loadAlarms().catch(console.error);
  loadDemoStatus().catch(console.error);
}, 15_000);
