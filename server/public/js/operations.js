import { apiGet, apiPost, apiLogin, apiLogout, getAdminToken } from "./api.js";
import {
  mountSiteSelector,
  mountTenantSelector,
  mountCustomerScopeSelector,
  getSelectedSiteId,
  getSelectedCustomerScope,
} from "./selectors.js";

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

function opsCustomerQuery() {
  const scope = getSelectedCustomerScope();
  return scope === "ALL" ? null : `?customerCode=${encodeURIComponent(scope)}`;
}

async function loadMap() {
  const canvas = document.getElementById("map-canvas");
  if (!canvas) return;
  canvas.innerHTML = "";
  const q = opsCustomerQuery();
  const data = q
    ? await apiGet(`/api/ops/map${q}`)
    : await apiGet("/api/demo/map");
  const markers = q ? data.sites : data.markers;
  markers.forEach((m, i) => {
    const pin = document.createElement("div");
    const status = m.status ?? (m.severity === "critical" ? "alarm" : m.severity === "warning" ? "warning" : "ok");
    pin.className = `map-pin ${status === "warning" || status === "alarm" ? "warning" : ""}`;
    const lat = m.lat ?? 35.68 + i * 0.02;
    const lng = m.lng ?? 139.76 + i * 0.015;
    pin.style.left = `${20 + (i % 4) * 18}%`;
    pin.style.top = `${25 + Math.floor(i / 4) * 20}%`;
    pin.title = m.address ?? m.name;
    pin.textContent = `${m.name} (${m.deviceCount ?? 0})`;
    canvas.appendChild(pin);
  });
}

async function loadZones() {
  const q = opsCustomerQuery();
  const data = q
    ? await apiGet(`/api/ops/map${q}`)
    : await apiGet("/api/demo/zones");
  const zones = q ? data.zones : data.zones;
  const el = document.getElementById("zones-list");
  if (!el) return;
  el.innerHTML = zones
    .map((z) =>
      q
        ? `<tr><td>${z.name}</td><td>${z.zoneId}</td><td>${z.siteName}</td><td>${z.deviceCount}</td></tr>`
        : `<tr><td>${z.name}</td><td>${z.id}</td><td>${z.siteIds?.length ?? 0} 現場</td></tr>`
    )
    .join("");
}

async function loadDevices() {
  const q = opsCustomerQuery();
  const data = q
    ? await apiGet(`/api/ops/devices${q}`)
    : await apiGet("/api/demo/devices");
  const el = document.getElementById("devices-body");
  if (!el) return;
  el.innerHTML = data.devices
    .map(
      (d) =>
        `<tr>
          <td>${d.label ?? d.deviceId}</td>
          <td>${d.siteName ?? "—"}</td>
          <td>${d.zone ?? "—"}</td>
          <td><span class="badge ${d.heartbeatStatus}">${d.heartbeatStatus}</span></td>
          <td>${d.lastHeartbeatAt ?? d.lastSeen ?? "—"}</td>
          <td>${d.anomalyCount ?? 0}</td>
        </tr>`
    )
    .join("");
}

async function loadAlarms() {
  const q = opsCustomerQuery();
  const data = q
    ? await apiGet(`/api/ops/alarms${q}`)
    : await apiGet("/api/demo/alarms");
  const el = document.getElementById("alarms-body");
  if (!el) return;
  el.innerHTML = data.alarms
    .slice(0, 50)
    .map(
      (a) =>
        `<tr>
          <td><span class="badge ${a.severity ?? "warning"}">${a.severity ?? "—"}</span></td>
          <td>${a.created_at}</td>
          <td>${a.site_id ?? ""}</td>
          <td>${a.event_type}</td>
          <td>${a.message ?? a.title ?? ""}</td>
        </tr>`
    )
    .join("");
  const counts = data.counts ?? { critical: 0, alarm: 0, warning: 0 };
  document.getElementById("alarm-counts").textContent =
    `重大 ${counts.critical} / 警報 ${counts.alarm} / 警告 ${counts.warning}`;
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
  const data = await apiGet(`${endpoint}${scopedQuery()}`);
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

function statusClass(s) {
  if (s === "GREEN" || s === "ok") return "ok";
  if (s === "RED" || s === "error") return "alarm";
  return "degraded";
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
          <p class="status-${statusClass(c.status)}">${c.status}</p>
          <p style="font-size:0.85rem;color:var(--tisly-muted)">${JSON.stringify(c)}</p>
        </div>`
    )
    .join("");
}

async function loadInfrastructure() {
  const [health, dbStatus] = await Promise.all([
    apiGet("/api/health/full"),
    apiGet("/api/db/status"),
  ]);
  const el = document.getElementById("infrastructure-grid");
  if (!el) return;
  const items = health.infrastructure ?? [];
  el.innerHTML = items
    .map(
      (c) =>
        `<div class="card health-card">
          <h3>${c.name}</h3>
          <p class="status-${statusClass(c.status)}">${c.status}</p>
          <p style="font-size:0.85rem;color:var(--tisly-muted)">${c.detail}</p>
        </div>`
    )
    .join("");
  el.innerHTML += `<div class="card health-card">
    <h3>DB API</h3>
    <p class="status-${dbStatus.reachable ? "ok" : "alarm"}">${dbStatus.provider}</p>
    <p style="font-size:0.85rem;color:var(--tisly-muted)">tables: ${dbStatus.table_count ?? "—"} · migration: ${dbStatus.migration ?? "—"}</p>
  </div>`;
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
  const q = opsCustomerQuery();
  let rows = [];
  if (q) {
    const data = await apiGet(`/api/ops/tv${q}`);
    rows = (data.devices ?? []).map((t) => ({
      displayName: t.display_name ?? t.device_id ?? t.id,
      siteId: t.site_id,
      status: t.status,
      lastSeenAt: t.last_seen_at,
      pairedAt: t.paired_at,
      hasActivePairingCode: t.status === "pairing",
    }));
  } else {
    const data = await apiGet("/api/tv/devices");
    rows = data.devices ?? [];
  }
  const el = document.getElementById("tv-body");
  if (!el) return;
  el.innerHTML = rows
    .map(
      (t) =>
        `<tr><td>${t.displayName}</td><td>${t.siteId ?? "—"}</td><td>${t.status}</td><td>${t.lastSeenAt ?? "—"}</td><td>${t.pairedAt ? "済" : t.hasActivePairingCode ? "コード発行中" : "未"}</td></tr>`
    )
    .join("") || "<tr><td colspan='5'>TV 未登録</td></tr>";
}

async function loadQnapOps() {
  const q = opsCustomerQuery();
  if (!q) return;
  const el = document.getElementById("qnap-ops-body");
  if (!el) return;
  try {
    const data = await apiGet(`/api/ops/qnap${q}`);
    el.innerHTML = (data.archives ?? [])
      .map((a) => `<tr><td>${a.id ?? "—"}</td><td>${a.status ?? "—"}</td><td>${a.created_at ?? ""}</td></tr>`)
      .join("") || `<tr><td colspan="3">アーカイブなし (${data.mode})</td></tr>`;
  } catch (e) {
    el.innerHTML = `<tr><td colspan="3">${e}</td></tr>`;
  }
}

function modeBadgeClass(mode) {
  if (mode === "real") return "sb-badge--real";
  if (mode === "dryRun") return "sb-badge--dryRun";
  return "sb-badge--mock";
}

function renderSecurityAutomationCard(data) {
  const card = document.getElementById("security-automation-card");
  if (!card) return;
  const gate = data.armGate ?? {};
  const checks = [
    { ok: gate.switchBotLocked, label: "SwitchBot 施錠" },
    { ok: gate.registeredDevicesAllAway, label: "登録端末が全不在" },
    { ok: !gate.unknownDeviceDetected, label: "unknown 端末なし" },
    { ok: !gate.manualOverride, label: "手動オーバーライドなし" },
    { ok: gate.autoArmEnabled, label: "AUTO_ARM 有効" },
    { ok: gate.confirmed, label: "real 実行許可（confirmed）" },
  ];
  const gateHtml = checks
    .map((c) => `<li class="${c.ok ? "ok" : "ng"}">${c.ok ? "✓" : "✗"} ${c.label}</li>`)
    .join("");
  const autoOff =
    !data.settings?.autoArmEnabled && !data.settings?.autoDisarmEnabled;
  const lockState = data.switchbotStatus?.lockState ?? "—";
  const lastPoll = data.worker?.lastPollAt ?? "未ポーリング";
  card.className = `security-automation-card${data.dangerousSettings ? " security-danger" : ""}`;
  card.innerHTML = `
    <h3>SwitchBot / 自動警戒 <span class="sb-badge ${modeBadgeClass(data.switchbotMode)}">${data.switchbotMode}</span>
      <span class="sb-badge" style="background:#1e3a5f;color:#93c5fd">警戒: ${data.securityState?.mode ?? "—"}</span>
    </h3>
    ${data.dangerousSettings ? '<p style="color:#ef4444;font-weight:600">⚠ 危険設定: real + 自動ON/OFF + confirmed 有効</p>' : ""}
    ${autoOff ? '<div class="security-auto-off-banner">自動ON/OFFは現在OFF（AUTO_ARM / AUTO_DISARM = false）</div>' : ""}
    <div class="health-grid" style="margin-top:0.75rem">
      <div class="health-card"><h3>ロック状態</h3><p>${lockState}</p></div>
      <div class="health-card"><h3>最終取得</h3><p style="font-size:0.8rem">${lastPoll}</p></div>
      <div class="health-card"><h3>ポーリング</h3><p>${data.worker?.pollCount ?? 0} 回 / 変化 ${data.worker?.changeCount ?? 0}</p></div>
      <div class="health-card"><h3>在宅</h3><p>home ${data.presence?.home ?? 0} / away ${data.presence?.away ?? 0} / unknown ${data.presence?.unknown ?? 0}</p></div>
    </div>
    <h4>警戒ON 条件チェックリスト</h4>
    <ul class="security-gate-list">${gateHtml}</ul>
    <div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.75rem">
      <button type="button" class="btn secondary" id="btn-sb-dryrun">dryRun確認</button>
      <button type="button" class="btn" id="btn-sb-real-confirm">real実行許可</button>
      <button type="button" class="btn secondary" id="btn-sb-real-revoke">real許可取消</button>
      <button type="button" class="btn secondary" id="btn-sb-poll">手動ポーリング</button>
      <a href="/security" class="btn secondary">警戒ダッシュボード</a>
      <a href="/security/settings/automation" class="btn secondary">自動化設定</a>
    </div>
    <p id="sb-ops-message" class="hint" style="margin-top:0.5rem"></p>`;

  document.getElementById("btn-sb-dryrun")?.addEventListener("click", async () => {
    const msg = document.getElementById("sb-ops-message");
    try {
      const r = await apiPost("/api/security/operations/dry-run-verify", {});
      if (msg) msg.textContent = r.message ?? (r.ok ? "OK" : "失敗");
    } catch (e) {
      if (msg) msg.textContent = String(e);
    }
  });
  document.getElementById("btn-sb-real-confirm")?.addEventListener("click", async () => {
    if (!window.confirm("real モードで自動警戒の実行を許可しますか？\n誤作動防止のため、現場確認後のみ実行してください。")) return;
    try {
      await apiPost("/api/security/operations/real-confirm", { confirmed: true });
      await loadSecurityAutomationCard();
    } catch (e) {
      alert(String(e));
    }
  });
  document.getElementById("btn-sb-real-revoke")?.addEventListener("click", async () => {
    try {
      await apiPost("/api/security/operations/real-revoke", {});
      await loadSecurityAutomationCard();
    } catch (e) {
      alert(String(e));
    }
  });
  document.getElementById("btn-sb-poll")?.addEventListener("click", async () => {
    const msg = document.getElementById("sb-ops-message");
    try {
      const r = await apiPost("/api/security/operations/poll", {});
      if (msg) msg.textContent = `poll: changed=${r.changed} lock=${r.status?.lockState}`;
      await loadSecurityAutomationCard();
    } catch (e) {
      if (msg) msg.textContent = String(e);
    }
  });
}

async function loadSecurityAutomationCard() {
  const card = document.getElementById("security-automation-card");
  if (!getAdminToken()) {
    if (card) card.innerHTML = "<p class='hint'>SwitchBot 状態 — ログイン後に表示</p>";
    return;
  }
  try {
    const data = await apiGet("/api/security/operations/overview");
    renderSecurityAutomationCard(data);
  } catch (e) {
    if (card) card.innerHTML = `<p class="hint">自動警戒: ${e.message ?? e}</p>`;
  }
}

async function loadSecurity() {
  const statusEl = document.getElementById("security-auth-status");
  const grid = document.getElementById("security-grid");
  const auditEl = document.getElementById("security-audit-body");
  const sessionsEl = document.getElementById("security-sessions-body");
  const token = getAdminToken();
  await loadSecurityAutomationCard();
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

async function loadOpsScopeSummary() {
  const scope = getSelectedCustomerScope();
  const q = scope === "ALL" ? "" : `?customerCode=${encodeURIComponent(scope)}`;
  const el = document.getElementById("ops-scope-summary");
  if (!el || !getAdminToken()) {
    if (el) el.innerHTML = "";
    return;
  }
  try {
    const s = await apiGet(`/api/ops/summary${q}`);
    el.innerHTML = `
      <h2>顧客スコープ: ${s.customerScope}</h2>
      <div class="metric-cards" style="display:flex;gap:1rem;flex-wrap:wrap">
        <div class="metric-card"><h3>Open Incidents</h3><div class="value">${s.openIncidents}</div></div>
        <div class="metric-card"><h3>Critical</h3><div class="value">${s.criticalCount}</div></div>
        <div class="metric-card"><h3>Recovery pending</h3><div class="value">${s.recoveryPending}</div></div>
        <div class="metric-card"><h3>TV offline</h3><div class="value">${s.tvOffline}</div></div>
        <div class="metric-card"><h3>QNAP warning</h3><div class="value">${s.qnapWarning}</div></div>
      </div>`;
  } catch (e) {
    el.innerHTML = `<p class="error">${e}</p>`;
  }
}

function scopedQuery() {
  const scope = getSelectedCustomerScope();
  return scope === "ALL" ? "" : `?customerCode=${encodeURIComponent(scope)}`;
}

async function loadIncidents() {
  const scope = getSelectedCustomerScope();
  const hint = document.getElementById("incidents-scope-hint");
  if (hint) {
    hint.textContent =
      scope === "ALL"
        ? "全顧客のインシデント"
        : `${scope} にスコープ限定`;
  }
  if (!getAdminToken()) {
    const el = document.getElementById("incidents-body");
    if (el) el.innerHTML = "<tr><td colspan='5'>管理者ログインが必要です</td></tr>";
    return;
  }
  try {
    const q =
      scope === "ALL" ? "" : `?customerCode=${encodeURIComponent(scope)}`;
    const data = await apiGet(`/api/incidents${q}`);
    const el = document.getElementById("incidents-body");
    if (!el) return;
    el.innerHTML = (data.incidents ?? [])
      .map(
        (inc) =>
          `<tr>
            <td><span class="badge ${inc.severity}">${inc.severity}</span></td>
            <td>${inc.status}</td>
            <td>${inc.title ?? inc.id}</td>
            <td>${inc.site_id ?? "—"}</td>
            <td>
              <button type="button" class="btn secondary btn-inc-ack" data-id="${inc.id}">ACK</button>
              <button type="button" class="btn secondary btn-inc-esc" data-id="${inc.id}">Esc</button>
              <button type="button" class="btn secondary btn-inc-close" data-id="${inc.id}">Close</button>
            </td>
          </tr>`
      )
      .join("");
    el.querySelectorAll(".btn-inc-ack").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await apiPost(`/api/incidents/${btn.dataset.id}/ack`, {});
        await loadIncidents();
      });
    });
    el.querySelectorAll(".btn-inc-esc").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await apiPost(`/api/incidents/${btn.dataset.id}/escalate`, {});
        await loadIncidents();
      });
    });
    el.querySelectorAll(".btn-inc-close").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await apiPost(`/api/incidents/${btn.dataset.id}/close`, {});
        await loadIncidents();
      });
    });
  } catch (e) {
    const el = document.getElementById("incidents-body");
    if (el) el.innerHTML = `<tr><td colspan="5">${e}</td></tr>`;
  }
}

async function loadRecoveryOps() {
  const data = await apiGet("/api/recovery/console");
  const el = document.getElementById("recovery-ops-summary");
  if (!el) return;
  el.innerHTML = `<p>アクティブ: ${data.overview?.activeIncidents ?? 0} / 直近 Run: ${(data.recentRuns ?? []).length}</p>`;
}

async function loadRealDevices() {
  const siteId = getSelectedSiteId();
  const parts = [];
  const scope = getSelectedCustomerScope();
  if (scope !== "ALL") parts.push(`customerCode=${encodeURIComponent(scope)}`);
  if (siteId) parts.push(`siteId=${encodeURIComponent(siteId)}`);
  const q = parts.length ? `?${parts.join("&")}` : "";
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
  await loadOpsScopeSummary();
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
    loadInfrastructure(),
    loadSites(),
    loadTv(),
    loadQnapOps(),
    loadIncidents(),
    loadRecoveryOps(),
    loadSecurity(),
  ]);
  renderCameras(4);
}

mountCustomerScopeSelector("customer-scope-selector", () => refreshAll().catch(console.error));
mountTenantSelector("tenant-selector", () => refreshAll().catch(console.error));
mountSiteSelector("site-selector", () => refreshAll().catch(console.error));

refreshAll().catch(console.error);
setInterval(() => {
  loadDevices().catch(console.error);
  loadAlarms().catch(console.error);
  loadDemoStatus().catch(console.error);
}, 15_000);
