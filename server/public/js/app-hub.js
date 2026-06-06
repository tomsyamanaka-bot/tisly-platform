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

function formatIsoShort(iso) {
  if (!iso) return "未実行";
  try {
    return new Date(iso).toLocaleString("ja-JP", { hour12: false });
  } catch {
    return iso;
  }
}

function renderVpsDeployStatus(vps) {
  const verdict = document.getElementById("vps-deploy-verdict");
  const grid = document.getElementById("vps-deploy-grid");
  if (!verdict || !grid || !vps) return;

  const allPass = vps.ready === true;
  verdict.className = `vps-deploy-verdict ${allPass ? "vps-deploy-pass" : "vps-deploy-pending"}`;
  verdict.textContent = vps.readyLabel || (allPass ? "READY FOR DEPLOY" : "NOT READY");

  grid.innerHTML = (vps.items || [])
    .map((item) => {
      const cls =
        item.status === "pass" ? "vps-pass" : item.status === "warn" ? "vps-warn" : "vps-fail";
      const icon = item.status === "pass" ? "✓" : item.status === "warn" ? "!" : "✗";
      return `<div class="vps-deploy-item ${cls}">
        <span class="vps-deploy-icon">${icon}</span>
        <span class="vps-deploy-label">${item.label}</span>
        <span class="vps-deploy-msg">${item.message}</span>
      </div>`;
    })
    .join("");
}

function renderDeployCenter(center) {
  const statusEl = document.getElementById("deploy-center-status");
  const factsEl = document.getElementById("deploy-center-facts");
  const rollbackBtn = document.getElementById("btn-deploy-rollback");
  if (!statusEl || !factsEl || !center) return;

  const statusMap = {
    success: { cls: "deploy-status-success", label: "SUCCESS" },
    failed: { cls: "deploy-status-fail", label: "FAILED" },
    pending: { cls: "deploy-status-pending", label: "PENDING" },
    rolled_back: { cls: "deploy-status-warn", label: "ROLLED BACK" },
    never: { cls: "deploy-status-pending", label: "NOT DEPLOYED" },
  };
  const st = statusMap[center.deployStatus] || statusMap.never;
  statusEl.className = `deploy-center-status ${st.cls}`;
  statusEl.textContent = `${st.label} — ${center.deployMessage || ""}`;

  factsEl.innerHTML = [
    ["Current Commit", center.currentCommitShort || center.currentCommit || "—"],
    ["Current Build", center.currentBuild || "—"],
    ["Deploy Date", center.deployDate ? formatIsoShort(center.deployDate) : "—"],
    ["Deploy Status", st.label],
  ]
    .map(
      ([label, value]) =>
        `<div class="deploy-fact"><dt>${label}</dt><dd>${value}</dd></div>`
    )
    .join("");

  if (rollbackBtn) {
    rollbackBtn.disabled = !center.rollbackAvailable;
  }
}

async function requestRollback() {
  const token = window.prompt("DEPLOY_OPS_TOKEN を入力してください");
  if (!token) return;
  const rollbackBtn = document.getElementById("btn-deploy-rollback");
  if (rollbackBtn) rollbackBtn.disabled = true;
  try {
    const res = await fetch("/api/deploy/rollback", {
      method: "POST",
      headers: { "X-Deploy-Ops-Token": token },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    alert(
      body.executed
        ? "ロールバックを実行しました"
        : `ロールバックを記録しました。VPS では scripts/rollback.sh を実行してください。`
    );
    await loadPublishAudit();
  } catch (e) {
    alert(`ロールバック失敗: ${e.message || e}`);
  } finally {
    const rollbackBtn2 = document.getElementById("btn-deploy-rollback");
    if (rollbackBtn2) rollbackBtn2.disabled = false;
  }
}

function renderBuildVersion(version) {
  if (!version) return;
  const buildEl = document.getElementById("version-build");
  const commitEl = document.getElementById("version-commit");
  const dateEl = document.getElementById("version-date");
  const labelEl = document.querySelector("#app-version-footer .version-label");
  if (labelEl) labelEl.textContent = version.label || "TiSLY RC2";
  if (buildEl) buildEl.textContent = `Build ${version.build || "—"}`;
  if (commitEl) commitEl.textContent = `Commit ${version.commitShort || version.commit || "—"}`;
  if (dateEl) dateEl.textContent = `Date ${version.date || "—"}`;
}

function renderProductionReadiness(readiness) {
  const verdict = document.getElementById("production-readiness-verdict");
  const grid = document.getElementById("production-readiness-grid");
  if (!verdict || !grid || !readiness) return;

  const allPass = readiness.publishable === true;
  verdict.className = `readiness-verdict ${allPass ? "readiness-pass" : "readiness-pending"}`;
  verdict.textContent = readiness.publishableLabel || (allPass ? "公開準備完了" : "公開準備中");

  grid.innerHTML = (readiness.items || [])
    .map((item) => {
      const cls =
        item.status === "pass" ? "ready-pass" : item.status === "warn" ? "ready-warn" : "ready-fail";
      const icon = item.status === "pass" ? "✓" : item.status === "warn" ? "!" : "✗";
      return `<div class="readiness-item ${cls}">
        <span class="readiness-icon">${icon}</span>
        <span class="readiness-label">${item.label}</span>
        <span class="readiness-msg">${item.message}</span>
      </div>`;
    })
    .join("");
}

function renderRehearsalSummary(sim) {
  const verdictEl = document.getElementById("rehearsal-score-verdict");
  const scoreEl = document.getElementById("rehearsal-score-display");
  const gridEl = document.getElementById("rehearsal-summary-grid");
  const ngEl = document.getElementById("rehearsal-ng-list");
  if (!verdictEl || !scoreEl || !gridEl || !sim) return;

  const score = sim.readyScore || {};
  const ready = score.verdict === "READY";
  verdictEl.className = `rehearsal-score-verdict ${ready ? "rehearsal-ready" : "rehearsal-not-ready"}`;
  verdictEl.textContent = `${score.total ?? 0}/${score.maxTotal ?? 100} — ${score.label || sim.verdict}`;

  scoreEl.innerHTML = (score.categories || [])
    .map(
      (c) =>
        `<div class="rehearsal-cat ${c.status === "pass" ? "cat-pass" : c.status === "warn" ? "cat-warn" : "cat-fail"}">
          <span class="rehearsal-cat-label">${c.label}</span>
          <span class="rehearsal-cat-score">${c.score}/${c.maxPoints}</span>
        </div>`
    )
    .join("");

  const summary = sim.summary || {};
  const sections = sim.sections || {};
  const items = [
    { label: "Build", msg: summary.build || sections.build?.message },
    { label: "Health", msg: summary.health || sections.health?.message },
    { label: "Release Gate", msg: summary.releaseGate || sections.releaseGate?.message },
    { label: "PWA", msg: summary.pwa || sections.pwa?.message },
    { label: "TV", msg: summary.tv || sim.tvAudit?.verdict },
    { label: "Security", msg: summary.security || sim.securityAudit?.verdict },
    { label: "URL", msg: summary.url },
    { label: "READY率", msg: `${summary.readyRate ?? 0}%` },
  ];

  gridEl.innerHTML = items
    .map(
      (item) =>
        `<div class="rehearsal-summary-item">
          <span class="rehearsal-summary-label">${item.label}</span>
          <span class="rehearsal-summary-msg">${item.msg || "—"}</span>
        </div>`
    )
    .join("");

  if (ngEl) {
    const ng = score.ngItems || [];
    ngEl.innerHTML =
      ng.length > 0
        ? `<h3>NG 項目</h3><ul>${ng.map((n) => `<li>${n}</li>`).join("")}</ul>`
        : "<p class=\"hint\">NG 項目なし — VPS 投入前の最終確認へ進めます</p>";
  }
}

function renderGateBanner(gate) {
  const el = document.getElementById("release-gate-banner");
  if (!el || !gate) return;
  const cls = gate.status === "pass" ? "gate-pass" : "gate-fail";
  el.className = `release-gate-banner ${cls}`;
  el.textContent =
    gate.status === "pass"
      ? "Release Gate: 合格 — VPS デプロイ手順へ進める"
      : "Release Gate: 不合格 — 修正して npm run release:gate を再実行";
}

function renderGateSummary(data) {
  const el = document.getElementById("publish-gate-summary");
  if (!el) return;
  const leak = data.secretLeakCheck?.passed ? "✓ 漏洩なし" : "✗ 漏洩疑い";
  const uploads = data.uploadsGitignore?.passed ? "✓ gitignore" : "✗ uploads 未除外";
  const pwaTotal = (data.pwaAudit?.pwAs || []).filter((p) => p.isPwa).length;
  el.innerHTML = `
    <div class="gate-summary-row">
      <span class="gate-chip">Production URL: <strong>${data.tislyPublicUrl || "—"}</strong></span>
      <span class="gate-chip">installReady: <strong>${data.pwaInstallReady ?? 0}/${pwaTotal}</strong></span>
      <span class="gate-chip">Secret leak: <strong>${leak}</strong></span>
      <span class="gate-chip">uploads: <strong>${uploads}</strong></span>
    </div>
    <div class="gate-tv-caution">${data.googleTvCaution || ""}</div>
  `;
}

async function renderSecurityGate(data) {
  const el = document.getElementById("publish-security-gate");
  if (!el) return;
  try {
    const sec = await fetch("/api/deploy/security-automation-status").then((r) =>
      r.ok ? r.json() : null
    );
    const sbChecks = (data.checks || []).filter((c) => c.id?.startsWith("switchbot") || c.id?.startsWith("security_"));
    const sbHtml = sbChecks
      .map(
        (c) =>
          `<div class="gate-check status-${c.status}"><span class="gate-check-name">${c.name}</span><span class="gate-check-msg">${c.message}</span></div>`
      )
      .join("");
    el.innerHTML = `
      <h3>SwitchBot / Security Automation</h3>
      <p>mode: <strong>${sec?.switchbotMode ?? "—"}</strong> · state: <strong>${sec?.securityState ?? "—"}</strong> · real unlock guard: <strong>${sec?.realUnlockGuarded ? "✓" : "✗"}</strong></p>
      ${sbHtml}`;
  } catch {
    el.innerHTML = "";
  }
}

function renderGateChecks(checks) {
  const el = document.getElementById("publish-gate-checks");
  if (!el) return;
  if (!checks?.length) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = checks
    .map((c) => {
      const label = STATUS_LABELS[c.status === "pass" ? "ok" : c.status === "warn" ? "caution" : "not_ready"] || c.status;
      return `<div class="gate-check status-${c.status}"><span class="gate-check-name">${c.name}</span><span class="gate-check-badge">${label}</span><span class="gate-check-msg">${c.message}</span></div>`;
    })
    .join("");
}

async function loadPublishAudit() {
  const meta = document.getElementById("publish-audit-meta");
  const envEl = document.getElementById("publish-audit-env");
  const grid = document.getElementById("publish-audit-grid");
  const lastEl = document.getElementById("publish-dry-run-last");
  if (!meta || !grid) return;

  meta.textContent = "読み込み中…";
  grid.innerHTML = "";
  if (lastEl) lastEl.textContent = "";

  try {
    const [res, simRes] = await Promise.all([
      fetch("/api/deploy/release-gate"),
      fetch("/api/deploy/simulate").catch(() => null),
    ]);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (simRes?.ok) {
      const sim = await simRes.json();
      renderRehearsalSummary(sim);
    }

    renderDeployCenter(data.deployCenter);
    renderVpsDeployStatus(data.vpsDeployStatus);
    renderBuildVersion(data.buildVersion);
    renderProductionReadiness(data.productionReadiness);
    renderGateBanner(data.releaseGate);
    renderGateSummary(data);
    renderGateChecks(data.checks);
    renderSecurityGate(data);

    const prodFlag = data.isProductionUrl
      ? "TISLY_PUBLIC_URL ✓ 本番"
      : "TISLY_PUBLIC_URL ⚠ 未設定または localhost";
    meta.textContent = `${prodFlag} · dry-run ${data.passed ? "合格" : "不合格"} (${data.summary?.pass ?? 0} pass / ${data.summary?.warn ?? 0} warn / ${data.summary?.fail ?? 0} fail)`;

    if (envEl) {
      const mockChips = (data.pwaAudit?.mockReal || [])
        .map((m) => {
          const cls = m.mode === "real" ? "mode-real" : "mode-mock";
          return `<span class="mock-real-chip ${cls}">${m.service}: ${m.mode}</span>`;
        })
        .join("");
      envEl.innerHTML = `<div>mock/real 状態</div><div>${mockChips}</div>`;
    }

    if (lastEl) {
      const last = data.lastDryRunAt || data.generatedAt;
      const lastResult = data.lastDryRunAt ? (data.passed ? "合格" : "不合格") : "（API ライブ評価）";
      lastEl.textContent = `最後の dry-run: ${formatIsoShort(last)} · ${lastResult}`;
    }

    grid.innerHTML = (data.pwaAudit?.pwAs || [])
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

document.getElementById("btn-rehearsal-refresh")?.addEventListener("click", () => {
  loadPublishAudit();
});

document.getElementById("btn-deploy-center-refresh")?.addEventListener("click", () => {
  loadPublishAudit();
});

document.getElementById("btn-deploy-rollback")?.addEventListener("click", () => {
  if (window.confirm("前回デプロイをロールバックしますか？")) {
    void requestRollback();
  }
});

async function loadGmailTestCard() {
  const statusEl = document.getElementById("gmail-test-status");
  const detailEl = document.getElementById("gmail-test-detail");
  const resultEl = document.getElementById("gmail-test-result");
  const sendBtn = document.getElementById("btn-gmail-test-send");
  if (!statusEl || !detailEl || !sendBtn) return;

  try {
    const res = await fetch("/api/notifications/stats");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const mode = data.gmailMode ?? "mock";
    const configured = data.smtpConfigured === true;
    let badgeClass = "gmail-status-mock";
    let badgeText = "MOCK";

    if (mode === "real" && !configured) {
      badgeClass = "gmail-status-warn";
      badgeText = "YELLOW — Gmail not configured";
    } else if (mode === "real" && configured) {
      badgeClass = "gmail-status-ok";
      badgeText = "GREEN — Gmail SMTP ready";
    }

    statusEl.className = `gmail-status-badge ${badgeClass}`;
    statusEl.textContent = badgeText;

    const last = data.lastSendStatus;
    const lastLine = last?.status
      ? `最終送信: ${last.status} · ${formatIsoShort(last.createdAt)}`
      : "最終送信: なし";
    detailEl.textContent = [
      `emailMode=${data.emailMode ?? "—"} · gmailMode=${mode}`,
      data.maskedCredentials || "SMTP credentials masked",
      lastLine,
    ].join(" · ");

    sendBtn.disabled = mode === "real" && !configured;
    if (resultEl) resultEl.textContent = "";
  } catch (e) {
    statusEl.className = "gmail-status-badge gmail-status-warn";
    statusEl.textContent = "状態取得失敗";
    if (detailEl) detailEl.textContent = String(e.message || e);
    sendBtn.disabled = true;
  }
}

async function sendGmailTest() {
  const resultEl = document.getElementById("gmail-test-result");
  const sendBtn = document.getElementById("btn-gmail-test-send");
  if (sendBtn) sendBtn.disabled = true;
  if (resultEl) resultEl.textContent = "送信中…";

  const username = window.prompt("管理者ユーザー名（admin）");
  if (!username) {
    if (resultEl) resultEl.textContent = "";
    if (sendBtn) sendBtn.disabled = false;
    return;
  }
  const password = window.prompt("管理者パスワード");
  if (!password) {
    if (resultEl) resultEl.textContent = "";
    if (sendBtn) sendBtn.disabled = false;
    return;
  }

  try {
    const login = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const loginBody = await login.json().catch(() => ({}));
    if (!login.ok) throw new Error(loginBody.error || "管理者ログイン失敗");

    const res = await fetch("/api/notifications/test-email", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${loginBody.token}`,
        "Content-Type": "application/json",
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    if (resultEl) {
      resultEl.textContent = body.mock
        ? `Mock 送信記録 OK（logId=${body.logId ?? "—"}）`
        : `送信成功（logId=${body.logId ?? "—"}）`;
    }
    await loadGmailTestCard();
  } catch (e) {
    if (resultEl) resultEl.textContent = `送信失敗: ${e.message || e}`;
  } finally {
    if (sendBtn) sendBtn.disabled = false;
    await loadGmailTestCard();
  }
}

document.getElementById("btn-gmail-test-send")?.addEventListener("click", () => {
  void sendGmailTest();
});

loadPublishAudit();
loadGmailTestCard();

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
  const notifTitle = document.getElementById("hub-notif-title");
  const notifGrid = document.getElementById("hub-notif-grid");
  if (notifGrid && data.notifications?.length) {
    notifTitle?.removeAttribute("hidden");
    notifGrid.removeAttribute("hidden");
    notifGrid.innerHTML = data.notifications
      .map(
        (n) =>
          `<a class="hub-app-card hub-notif-card" href="${n.href}" style="border-left: 4px solid ${n.themeColor}">
            <div class="label">${n.label}</div>
            <div class="desc">${n.description}</div>
          </a>`
      )
      .join("");
  } else {
    notifTitle?.setAttribute("hidden", "");
    notifGrid?.setAttribute("hidden", "");
    if (notifGrid) notifGrid.innerHTML = "";
  }
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
