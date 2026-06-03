import { apiGet, apiPost, getAdminToken, setAdminToken } from "./api.js";

const pathMatch = location.pathname.match(/\/customer\/([^/]+)/i);
const customerCode = pathMatch ? pathMatch[1].toUpperCase() : "";

const loginPanel = document.getElementById("login-panel");
const dashboardPanel = document.getElementById("dashboard-panel");
const loginError = document.getElementById("login-error");

document.getElementById("demo-user-hint").textContent = `${customerCode.toLowerCase()}.viewer`;
document.getElementById("brand-code").textContent = customerCode;
document.getElementById("link-tv").href = `/tv/${customerCode}`;
document.getElementById("link-admin").href = `/admin/${customerCode}`;
document.getElementById("link-map")?.setAttribute("href", `/customer/${customerCode}/map`);
document.getElementById("link-install")?.setAttribute("href", `/customer/${customerCode}/install`);

document.getElementById("btn-login")?.addEventListener("click", async () => {
  loginError.textContent = "";
  try {
    const res = await fetch("/api/auth/customer/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerCode,
        username: document.getElementById("login-username").value.trim(),
        password: document.getElementById("login-password").value,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      loginError.textContent =
        data.error + (data.failedAttempts ? ` (失敗 ${data.failedAttempts} 回)` : "");
      return;
    }
    setAdminToken(data.token);
    showDashboard();
  } catch (e) {
    loginError.textContent = String(e);
  }
});

document.getElementById("btn-logout")?.addEventListener("click", () => {
  setAdminToken("");
  loginPanel.hidden = false;
  dashboardPanel.hidden = true;
  document.getElementById("btn-logout").hidden = true;
});

function applyBranding(branding, customer) {
  const color = branding?.company_color ?? "#1a7f37";
  document.documentElement.style.setProperty("--customer-accent", color);
  document.getElementById("brand-name").textContent =
    branding?.company_name ?? customer.customerName;
  if (branding?.logo_url) {
    const img = document.getElementById("brand-logo");
    img.src = branding.logo_url;
    img.hidden = false;
  }
}

function statusLabel(st) {
  if (st === "normal" || st === "ok") return "正常";
  if (st === "warning" || st === "alarm") return "警告";
  return "異常";
}

async function showDashboard() {
  if (!getAdminToken()) return;
  loginPanel.hidden = true;
  dashboardPanel.hidden = false;
  document.getElementById("btn-logout").hidden = false;

  const [dash, devices, sites, events, alarms, recovery, ai, tv] = await Promise.all([
    apiGet(`/api/customer/${customerCode}/dashboard`),
    apiGet(`/api/customer/${customerCode}/devices`).catch(() => ({ grouped: {} })),
    apiGet(`/api/customer/${customerCode}/sites`).catch(() => ({ sites: [] })),
    apiGet(`/api/customer/${customerCode}/events?limit=8`).catch(() => ({ events: [] })),
    apiGet(`/api/customer/${customerCode}/alarms`).catch(() => ({ alarms: [] })),
    apiGet(`/api/customer/${customerCode}/recovery`).catch(() => ({ recoveryHistory: [] })),
    apiGet(`/api/customer/${customerCode}/ai-summary`).catch(() => ({ summary: "—" })),
    apiGet(`/api/customer/${customerCode}/tv`).catch(() => null),
  ]);

  applyBranding(dash.branding, dash.customer);

  const statusEl = document.getElementById("overall-status");
  const st = dash.summary.overallStatus;
  statusEl.className = `status-banner ${st}`;
  statusEl.textContent = statusLabel(st);

  const uptime = dash.cards.uptimePercent ?? 100;
  document.getElementById("metric-cards").innerHTML = `
    <div class="metric-card"><h3>設備</h3><div class="value">${dash.cards.deviceCount}</div></div>
    <div class="metric-card"><h3>オンライン</h3><div class="value">${dash.cards.onlineCount}</div></div>
    <div class="metric-card"><h3>稼働率</h3><div class="value">${uptime}%</div></div>
    <div class="metric-card"><h3>通知24h</h3><div class="value">${dash.cards.notificationCount}</div></div>
  `;

  document.getElementById("sites-list").innerHTML = (sites.sites ?? [])
    .map(
      (s) =>
        `<div class="mini-card"><strong>${s.site_name}</strong>
         <span class="badge-${s.status === "alarm" ? "offline" : "online"}">${statusLabel(s.status)}</span>
         <p>${s.address ?? ""}</p></div>`
    )
    .join("") || "<p>現場なし</p>";

  const types = ["PLC", "RP2350", "ESP32", "TV", "Gateway"];
  document.getElementById("devices-by-type").innerHTML = types
    .map((t) => {
      const list = devices.grouped?.[t] ?? [];
      if (!list.length) return "";
      return `<div class="device-group"><h3>${t}</h3>${list
        .map(
          (d) =>
            `<div class="device-row"><span>${d.label ?? d.deviceId}</span>
             <span class="${d.online ? "badge-online" : "badge-offline"}">${d.online ? "オンライン" : "オフライン"}</span></div>`
        )
        .join("")}</div>`;
    })
    .join("");

  document.getElementById("events-list").innerHTML = (events.events ?? [])
    .map((e) => `<li>${e.created_at?.slice(0, 16)} — ${e.event_type}: ${e.message}</li>`)
    .join("") || "<li>イベントなし</li>";

  document.getElementById("alarms-list").innerHTML = (alarms.alarms ?? [])
    .slice(0, 10)
    .map((a) => `<li><strong>${a.severity}</strong> ${a.message || a.event_type}</li>`)
    .join("") || "<li>警報なし</li>";

  document.getElementById("ai-summary").textContent = ai.summary ?? "—";

  document.getElementById("recovery-list").innerHTML = (recovery.recoveryHistory ?? [])
    .map((r) => `<li>${r.created_at ?? ""} — ${r.status ?? r.playbook_id ?? "—"}</li>`)
    .join("") || "<li>履歴なし</li>";

  const tvStatus = tv
    ? `${tv.summary?.onlineCount ?? 0}/${tv.summary?.deviceCount ?? 0} オンライン · Recovery: ${tv.recoveryStatus}`
    : "プラン制限または未取得";
  document.getElementById("ops-cards").innerHTML = `
    <div class="mini-card"><h3>TV状態</h3><p>${tvStatus}</p></div>
    <div class="mini-card"><h3>プラン</h3><p>${dash.customer.plan}</p></div>
  `;

  const contract = dash.contract ?? {};
  document.getElementById("contract-info").innerHTML = `
    <p><strong>プラン:</strong> ${contract.plan ?? dash.customer.plan}
     · <strong>状態:</strong> ${contract.status ?? "active"}</p>
    <p><strong>有効機能:</strong> ${(contract.enabledFeatures ?? dash.planFeatures ?? []).join(", ") || "—"}</p>
    <p class="hint">${contract.contractNote ?? ""}</p>
  `;

  await loadUsersTab();
  await loadNotificationRulesTab().catch(() => {});
  document.getElementById("link-map-inline")?.setAttribute("href", `/customer/${customerCode}/map`);
}

async function loadSiteBuilderTab() {
  const data = await apiGet(`/api/customer/${customerCode}/sites/builder`).catch(() => ({ sites: [] }));
  const el = document.getElementById("site-builder-tree");
  if (!el) return;
  el.innerHTML = (data.sites ?? [])
    .map(
      (s) =>
        `<div class="mini-card"><strong>${s.name}</strong> — ${s.address ?? ""}
         <ul>${(s.floors ?? []).map((f) => `<li>フロア: ${f.name}</li>`).join("") || "<li>フロア未登録</li>"}
         <ul>${(s.zones ?? []).map((z) => `<li>部屋: ${z.name} (${z.zone_type})</li>`).join("")}</ul></div>`
    )
    .join("") || "<p>現場なし — 下のフォームから追加</p>";
}

document.getElementById("btn-add-site")?.addEventListener("click", async () => {
  const name = document.getElementById("new-site-name")?.value.trim();
  const address = document.getElementById("new-site-address")?.value.trim();
  if (!name) return;
  await apiPost(`/api/customer/${customerCode}/sites`, { name, address });
  await loadSiteBuilderTab();
});

async function loadRecoveryTab() {
  const rules = await apiGet(`/api/customer/${customerCode}/recovery-rules`).catch(() => ({ rules: [] }));
  document.getElementById("recovery-rules-body").innerHTML = (rules.rules ?? [])
    .map(
      (r) =>
        `<tr><td>${r.name}</td><td>${r.condition_type}</td><td>${r.action_type}</td>
         <td><button type="button" class="btn secondary btn-rec-del" data-id="${r.id}">削除</button></td></tr>`
    )
    .join("");
  document.querySelectorAll(".btn-rec-del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await fetch(`/api/customer/${customerCode}/recovery-rules/${btn.dataset.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      await loadRecoveryTab();
    });
  });
  const sched = await apiGet(`/api/customer/${customerCode}/schedules`).catch(() => ({ schedules: [] }));
  document.getElementById("schedules-list").innerHTML = (sched.schedules ?? [])
    .map((s) => `<li>${s.name} — ${s.mode} ${s.time_start ?? ""}-${s.time_end ?? ""}</li>`)
    .join("") || "<li>スケジュールなし</li>";
}

document.getElementById("btn-recovery-save")?.addEventListener("click", async () => {
  await apiPost(`/api/customer/${customerCode}/recovery-rules`, {
    name: document.getElementById("recovery-name").value,
    conditionType: document.getElementById("recovery-condition").value,
    conditionDeviceType: document.getElementById("recovery-device-type").value,
    actionType: document.getElementById("recovery-action").value,
  });
  await loadRecoveryTab();
});

document.getElementById("btn-sched-save")?.addEventListener("click", async () => {
  await apiPost(`/api/customer/${customerCode}/schedules`, {
    name: document.getElementById("sched-name").value,
    mode: document.getElementById("sched-mode").value,
    timeStart: document.getElementById("sched-start").value,
    timeEnd: document.getElementById("sched-end").value,
  });
  await loadRecoveryTab();
});

let currentUserRole = "viewer";

async function loadUsersTab() {
  const data = await apiGet(`/api/customer/${customerCode}/users`).catch(() => ({ users: [] }));
  currentUserRole = data.currentRole ?? currentUserRole;
  const canManage = ["owner", "admin", "super_admin"].includes(currentUserRole);
  document.getElementById("users-role-hint").textContent = canManage
    ? "owner/admin: 招待・ロール変更・停止が可能"
    : "viewer: 一覧表示のみ";
  document.getElementById("users-invite-form").hidden = !canManage;

  document.getElementById("users-body").innerHTML = (data.users ?? [])
    .map((u) => {
      const reinviteBtn =
        canManage && (u.status === "invited" || u.status === "suspended")
          ? `<button type="button" class="btn secondary btn-reinvite-user" data-id="${u.id}">再招待</button>`
          : "";
      const actions = canManage
        ? `${reinviteBtn}
           ${u.status === "active" ? `<button type="button" class="btn secondary btn-disable-user" data-id="${u.id}">停止</button>` : ""}
           <select class="user-role-select" data-id="${u.id}">
             ${["viewer", "manager", "admin", "owner"]
               .map((r) => `<option value="${r}" ${r === u.role ? "selected" : ""}>${r}</option>`)
               .join("")}
           </select>`
        : "";
      return `<tr>
        <td>${u.username}</td><td>${u.role}</td><td>${u.status}</td>
        <td>${u.last_login_at ?? "—"}</td><td>${actions}</td></tr>`;
    })
    .join("");

  document.querySelectorAll(".btn-disable-user").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await apiPost(`/api/customer/${customerCode}/users/${btn.dataset.id}/disable`, {});
      await loadUsersTab();
    });
  });
  document.querySelectorAll(".user-role-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      await apiPost(`/api/customer/${customerCode}/users/${sel.dataset.id}/role`, {
        role: sel.value,
      });
    });
  });
  document.querySelectorAll(".btn-reinvite-user").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const res = await apiPost(`/api/customer/${customerCode}/users/${btn.dataset.id}/reinvite`, {});
      alert(`再招待: ${res.acceptUrl ?? res.inviteToken}`);
      await loadUsersTab();
    });
  });
}

async function loadNotificationRulesTab() {
  const data = await apiGet(`/api/customer/${customerCode}/notification-rules`).catch(() => ({
    rules: [],
    planLimits: { allowed: [], blocked: [] },
  });
  document.getElementById("notif-plan-hint").textContent =
    `プラン制限 — 利用可: ${(data.planLimits?.allowed ?? []).join(", ") || "なし"} / 不可: ${(data.planLimits?.blocked ?? []).join(", ") || "—"}`;
  const canManage = ["owner", "admin", "manager", "super_admin"].includes(currentUserRole);
  document.getElementById("notif-rule-form").hidden = !canManage;
  document.getElementById("notif-rules-body").innerHTML = (data.rules ?? [])
    .map(
      (r) =>
        `<tr>
          <td>${r.name}</td>
          <td>${r.enabled ? "ON" : "OFF"}</td>
          <td>${(r.eventTypes ?? []).join(", ")}</td>
          <td>${r.severity}</td>
          <td>${(r.channels ?? []).join(", ")}</td>
          <td>${r.timeStart ?? "—"} – ${r.timeEnd ?? "—"}</td>
          <td>${canManage ? `<button type="button" class="btn secondary btn-rule-del" data-id="${r.id}">削除</button>` : ""}</td>
        </tr>`
    )
    .join("");
  document.querySelectorAll(".btn-rule-del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await fetch(`/api/customer/${customerCode}/notification-rules/${btn.dataset.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      await loadNotificationRulesTab();
    });
  });
}

document.getElementById("btn-rule-save")?.addEventListener("click", async () => {
  const days = document
    .getElementById("rule-days")
    .value.split(",")
    .map((d) => Number(d.trim()))
    .filter((n) => !Number.isNaN(n));
  await apiPost(`/api/customer/${customerCode}/notification-rules`, {
    name: document.getElementById("rule-name").value.trim() || "ルール",
    enabled: document.getElementById("rule-enabled").checked,
    eventTypes: document.getElementById("rule-events").value.split(",").map((s) => s.trim()),
    severity: document.getElementById("rule-severity").value.trim(),
    channels: document.getElementById("rule-channels").value.split(",").map((s) => s.trim()),
    timeStart: document.getElementById("rule-time-start").value || null,
    timeEnd: document.getElementById("rule-time-end").value || null,
    daysOfWeek: days.length ? days : [0, 1, 2, 3, 4, 5, 6],
  });
  await loadNotificationRulesTab();
});

async function loadAuditTab() {
  const data = await apiGet(`/api/customer/${customerCode}/audit`);
  const el = document.getElementById("audit-activity-list");
  if (!el) return;
  el.innerHTML = (data.entries ?? data.logs ?? [])
    .map(
      (a) =>
        `<li><time>${a.createdAt}</time> <strong>${a.action}</strong> — ${a.actorLabel ?? a.userId ?? ""} ${a.targetType ? `(${a.targetType})` : ""}</li>`
    )
    .join("") || "<li>該当する監査ログはありません</li>";
}

document.querySelectorAll(".portal-tabs .tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".portal-tabs .tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const id = tab.dataset.tab;
    document.getElementById("tab-overview").hidden = id !== "overview";
    document.getElementById("tab-sites").hidden = id !== "sites";
    document.getElementById("tab-users").hidden = id !== "users";
    document.getElementById("tab-notifications").hidden = id !== "notifications";
    document.getElementById("tab-recovery").hidden = id !== "recovery";
    document.getElementById("tab-audit").hidden = id !== "audit";
    if (id === "sites" && getAdminToken()) loadSiteBuilderTab().catch(console.error);
    if (id === "users" && getAdminToken()) loadUsersTab().catch(console.error);
    if (id === "notifications" && getAdminToken()) loadNotificationRulesTab().catch(console.error);
    if (id === "recovery" && getAdminToken()) loadRecoveryTab().catch(console.error);
    if (id === "audit" && getAdminToken()) loadAuditTab().catch(console.error);
  });
});

document.getElementById("btn-invite")?.addEventListener("click", async () => {
  const el = document.getElementById("invite-result");
  el.textContent = "";
  try {
    const res = await apiPost(`/api/customer/${customerCode}/users/invite`, {
      username: document.getElementById("invite-username").value.trim(),
      role: document.getElementById("invite-role").value,
    });
    el.textContent = `招待トークン: ${res.inviteToken?.slice(0, 12)}… (有効期限 ${res.expiresAt})`;
    await loadUsersTab();
  } catch (e) {
    el.textContent = String(e);
  }
});

if (getAdminToken()) {
  showDashboard().catch(() => setAdminToken(""));
}
