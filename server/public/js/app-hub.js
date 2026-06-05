import { renderPwaTopbar } from "./tisly-pwa-shell.js";
import { syncHubSnapshot, renderHubFromCache } from "./hub-offline-snapshot.js";
import { highlightAnomalyCard } from "./connection-badges.js";

const TOKEN_KEY = "tisly_token";

const STATUS_LABELS = {
  ok: "OK",
  caution: "注意",
  not_ready: "未対応",
};

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function loadPublishAudit() {
  const meta = document.getElementById("publish-audit-meta");
  const envEl = document.getElementById("publish-audit-env");
  const grid = document.getElementById("publish-audit-grid");
  if (!meta || !grid) return;

  meta.textContent = "読み込み中…";
  grid.innerHTML = "";

  try {
    const res = await fetch("/api/pwa/publish-audit");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const prodFlag = data.isProductionUrl
      ? "TISLY_PUBLIC_URL ✓ 本番"
      : "TISLY_PUBLIC_URL ⚠ 未設定または localhost";
    meta.textContent = `${prodFlag} · ${data.summary.installReady}/${data.pwAs.filter((p) => p.isPwa).length} PWA インストール準備完了`;

    if (envEl) {
      const mockChips = (data.mockReal || [])
        .map((m) => {
          const cls = m.mode === "real" ? "mode-real" : "mode-mock";
          return `<span class="mock-real-chip ${cls}">${m.service}: ${m.mode}</span>`;
        })
        .join("");
      const envWarn = data.hasBlockingEnvErrors ? " · env エラーあり" : "";
      envEl.innerHTML = `<div>NODE_ENV=${data.nodeEnv} · ${data.tislyPublicUrl}${envWarn}</div><div>${mockChips}</div>`;
    }

    grid.innerHTML = (data.pwAs || [])
      .map((p) => {
        const badge = STATUS_LABELS[p.status] || p.status;
        const swLine = p.isPwa
          ? `manifest: ${p.manifestUrl || "—"} · SW: ${p.serviceWorker} · scope: ${p.scope}`
          : "PWA 対象外";
        const missing =
          p.missingItems?.length > 0
            ? `<div class="pa-detail">不足: ${p.missingItems.join(", ")}</div>`
            : "";
        const copyBtn = p.productionUrl
          ? `<button type="button" class="btn-copy-url" data-copy="${p.productionUrl}">本番URLコピー</button>`
          : "";
        return `<div class="publish-audit-item status-${p.status}">
          <div class="pa-name">${p.pwaName}
            <span class="pa-badge ${p.status === "ok" ? "ok" : p.status === "caution" ? "caution" : "not_ready"}">${badge}</span>
            ${p.installReady ? '<span class="pa-badge ok">installReady</span>' : ""}
          </div>
          <div class="pa-detail">${swLine}</div>
          ${missing}
          <div class="pa-detail">${p.recommendedAction}</div>
          <div class="pa-actions">${copyBtn}</div>
        </div>`;
      })
      .join("");

    grid.querySelectorAll(".btn-copy-url").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ok = await copyText(btn.dataset.copy || "");
        btn.textContent = ok ? "コピー済み" : "コピー失敗";
        setTimeout(() => {
          btn.textContent = "本番URLコピー";
        }, 1500);
      });
    });
  } catch (e) {
    meta.textContent = `公開チェック取得失敗: ${e.message || e}`;
  }
}

document.getElementById("btn-publish-audit-refresh")?.addEventListener("click", () => {
  loadPublishAudit();
});

loadPublishAudit();

async function customerLogin(code, username, password) {
  const res = await fetch("/api/auth/customer/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerCode: code, username, password }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function loadHubApps() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) return;
  const res = await fetch("/api/pwa/hub", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return;
  const data = await res.json();
  document.getElementById("login-panel").hidden = true;
  document.getElementById("hub-apps-panel").hidden = false;
  document.getElementById("hub-role-label").textContent = `ロール: ${data.role} · 顧客: ${data.customerCode}`;
  const grid = document.getElementById("hub-app-grid");
  grid.innerHTML = (data.apps || [])
    .map(
      (a) =>
        `<a class="hub-app-card${a.optional ? " optional" : ""}" href="${a.url}" style="border-left: 4px solid ${a.themeColor}">
          <div class="label">${a.label}</div>
          <div class="desc">${a.description}</div>
        </a>`
    )
    .join("");
  const wf = document.getElementById("hub-workflow-grid");
  if (wf && data.workflows?.length) {
    wf.hidden = false;
    wf.innerHTML = data.workflows
      .map(
        (w) =>
          `<a class="hub-workflow-card" href="${w.href}">
            <div class="label">${w.label}${w.count != null ? ` (${w.count})` : ""}</div>
            <div class="desc">${w.description}</div>
          </a>`
      )
      .join("");
  }
  const ops = data.operations;
  if (ops) {
    let opsEl = document.getElementById("hub-ops-panel");
    if (!opsEl) {
      opsEl = document.createElement("section");
      opsEl.id = "hub-ops-panel";
      opsEl.className = "hub-ops-panel";
      document.getElementById("hub-apps-panel")?.appendChild(opsEl);
    }
    const scheduleHtml = (ops.schedules || [])
      .slice(0, 8)
      .map(
        (s) =>
          `<li><a href="/project/${s.projectId}">${s.title}</a> <small>${s.date} ${s.startTime || ""}</small></li>`
      )
      .join("");
    opsEl.innerHTML = `
      <h3 class="hub-workflows-title">今日のオペレーション</h3>
      <div class="hub-workflow-grid">
        <a class="hub-workflow-card" href="/survey">今日の現調 <strong>${ops.todaySurveys}</strong></a>
        <a class="hub-workflow-card" href="/business/projects">今日の工事 <strong>${ops.todayConstruction}</strong></a>
        <a class="hub-workflow-card" href="/maintenance">今日の保守 <strong>${ops.todayMaintenance ?? 0}</strong></a>
        <a class="hub-workflow-card" href="/business/projects?status=estimate_created">未送信見積 <strong>${ops.unsentEstimates ?? 0}</strong></a>
        <a class="hub-workflow-card" href="/business/projects?status=invoice_created">未送信請求 <strong>${ops.unsentInvoices ?? 0}</strong></a>
        <a class="hub-workflow-card" href="/business/projects?status=invoice_sent">未入金 <strong>${ops.unpaid}</strong></a>
        <a class="hub-workflow-card${(ops.abnormalDevices ?? ops.espAnomaly + ops.shellyAnomaly) > 0 ? " anomaly-card" : ""}" href="/app" id="hub-anomaly-card">異常デバイス <strong>${ops.abnormalDevices ?? ops.espAnomaly + ops.shellyAnomaly}</strong></a>
        <a class="hub-workflow-card" href="/business/settings">同期待ち <strong>${ops.pendingSync ?? 0}</strong></a>
        <a class="hub-workflow-card" href="/business/projects">AI見積待ち <strong>${ops.aiEstimatePending ?? 0}</strong></a>
        <div class="hub-workflow-card">未請求 <strong>${ops.uninvoiced}</strong></div>
        <a class="hub-workflow-card${ops.maintenanceOverdue ? " warn-card" : ""}" href="/maintenance">保守期限 <strong>${ops.maintenanceDue}</strong>${ops.maintenanceOverdue ? ` <span class="warn">(${ops.maintenanceOverdue} 期限切れ)</span>` : ""}</a>
        <a class="hub-workflow-card" href="/business/projects">再送キュー <strong>${ops.retryQueuePending ?? 0}</strong></a>
        <div class="hub-workflow-card">ESP異常 <strong>${ops.espAnomaly}</strong></div>
        <div class="hub-workflow-card">Shelly異常 <strong>${ops.shellyAnomaly}</strong></div>
      </div>
      ${scheduleHtml ? `<h4 style="margin-top:1rem">今日のスケジュール</h4><ul>${scheduleHtml}</ul>` : ""}
      <button type="button" id="btn-hub-sync-inline" class="btn-sync-touch">手動同期</button>`;
    if ((ops.abnormalDevices ?? ops.espAnomaly) > 0) {
      highlightAnomalyCard("#hub-anomaly-card");
    }
    if ((ops.maintenanceOverdue ?? 0) > 0) {
      highlightAnomalyCard('a[href="/maintenance"].warn-card');
    }
  }
}

document.getElementById("btn-hub-login")?.addEventListener("click", async () => {
  const err = document.getElementById("hub-login-error");
  err.textContent = "";
  const code = document.getElementById("hub-customer-code").value.trim().toUpperCase();
  const username = document.getElementById("hub-username").value.trim();
  const password = document.getElementById("hub-password").value;
  const { ok, body } = await customerLogin(code, username, password);
  if (!ok) {
    err.textContent = body.error || "ログインに失敗しました";
    return;
  }
  sessionStorage.setItem(TOKEN_KEY, body.token);
  sessionStorage.setItem("tisly_customer_code", code);
  await loadHubApps();
});

document.getElementById("btn-hub-sync-inline")?.addEventListener("click", () => {
  syncHubSnapshot().then(() => loadHubApps());
});

if (sessionStorage.getItem(TOKEN_KEY)) {
  if (!navigator.onLine) {
    const code = sessionStorage.getItem("tisly_customer_code") || "TOMS001";
    renderHubFromCache(code).then((ok) => {
      if (!ok) loadHubApps();
    });
  } else {
    loadHubApps();
  }
}

renderPwaTopbar("hub", "App Hub");
