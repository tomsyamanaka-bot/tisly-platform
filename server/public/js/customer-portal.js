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
}

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
      const actions = canManage && u.status === "active"
        ? `<button type="button" class="btn secondary btn-disable-user" data-id="${u.id}">停止</button>
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
}

document.querySelectorAll(".portal-tabs .tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".portal-tabs .tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const id = tab.dataset.tab;
    document.getElementById("tab-overview").hidden = id !== "overview";
    document.getElementById("tab-users").hidden = id !== "users";
    if (id === "users" && getAdminToken()) loadUsersTab().catch(console.error);
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
