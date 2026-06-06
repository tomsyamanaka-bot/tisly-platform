import { apiGet, apiPost, getAdminToken, setAdminToken } from "./api.js";
import {
  customerCodeFromPath,
  setCustomerToken,
  clearCustomerToken,
} from "./customer-auth.js";
import { renderPwaTopbar, setPwaTopbarVisible } from "./tisly-pwa-shell.js";

const customerCode = customerCodeFromPath();

const loginPanel = document.getElementById("login-panel");
const portalHub = document.getElementById("portal-hub");
const loginError = document.getElementById("login-error");
const loginStatus = document.getElementById("login-status");
const loginForm = document.getElementById("login-form");
const portalNav = document.getElementById("portal-nav");
const portalAdvanced = document.getElementById("portal-advanced");

let portalData = null;
let currentUserRole = "viewer";
let loginBusy = false;

document.getElementById("login-customer-code").value = customerCode;
document.getElementById("demo-user-hint").textContent = `${customerCode.toLowerCase()}.owner`;
document.getElementById("brand-code").textContent = customerCode;

const params = new URLSearchParams(location.search);
if (params.get("login") === "required") {
  document.getElementById("login-required-msg")?.removeAttribute("hidden");
}

function statusLabel(st) {
  if (st === "normal" || st === "ok") return "正常";
  if (st === "warning" || st === "alarm") return "警告";
  return "異常";
}

function showLogin() {
  loginPanel.hidden = false;
  portalHub.hidden = true;
  portalNav.hidden = true;
  portalAdvanced.hidden = true;
  setPwaTopbarVisible(false);
  if (loginStatus) loginStatus.textContent = "";
}

function showHub() {
  loginPanel.hidden = true;
  portalHub.hidden = false;
  portalNav.hidden = false;
  portalAdvanced.hidden = false;
  document.getElementById("portal-section-view").hidden = true;
  document.getElementById("portal-hub-cards").hidden = false;
  wirePortalNav();
  renderPwaTopbar("customer_portal", "顧客ポータル");
}

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

function wirePortalNav() {
  const base = `/customer/${customerCode}`;
  document.getElementById("nav-map")?.setAttribute("href", `${base}/map`);
  document.getElementById("nav-install")?.setAttribute("href", `${base}/install/home`);
  document.getElementById("nav-tv")?.setAttribute("href", `/tv/${customerCode}`);
  document.getElementById("nav-admin")?.setAttribute("href", `/admin/${customerCode}`);
}

function wireHubLinks() {
  const base = `/customer/${customerCode}`;
  document.getElementById("card-overview").href = `${base}/overview`;
  document.getElementById("card-devices").href = `${base}#devices`;
  document.getElementById("card-events").href = `${base}#events`;
  document.getElementById("card-maintenance").href = `${base}/maintenance`;
  document.getElementById("card-pro-remote").href = `${base}/pro-remote`;
  document.getElementById("card-tv").href = `/tv/${customerCode}`;
  document.getElementById("card-billing").href = `${base}#billing`;
  document.getElementById("link-map-inline")?.setAttribute("href", `${base}/map`);
}

function setLoginStatus(msg) {
  if (loginStatus) loginStatus.textContent = msg;
}

async function performLogin() {
  if (loginBusy) return;
  loginBusy = true;
  const btn = document.getElementById("btn-login");
  if (btn) btn.disabled = true;
  if (loginError) loginError.textContent = "";
  setLoginStatus("通信を開始しています…");
  const username = document.getElementById("login-username")?.value.trim() ?? "";
  const password = document.getElementById("login-password")?.value ?? "";
  const payload = { customerCode, username, password };
  console.log("[customer-portal] login start", { customerCode, username });
  try {
    const res = await fetch("/api/auth/customer/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = data.error ?? res.statusText ?? "不明なエラー";
      const extra = data.failedAttempts ? ` (失敗 ${data.failedAttempts} 回)` : "";
      const msg = `ログイン失敗：${reason}${extra}`;
      if (loginError) loginError.textContent = msg;
      setLoginStatus("");
      console.error("[customer-portal] login failed", { status: res.status, data });
      return;
    }
    setLoginStatus("ログイン成功 — 遷移中…");
    setAdminToken(data.token);
    setCustomerToken(data.token, customerCode);
    currentUserRole = data.user?.role ?? "viewer";
    const ret = params.get("return");
    if (ret && ret.startsWith("/")) {
      location.href = ret;
      return;
    }
    location.replace(`/customer/${customerCode}`);
  } catch (e) {
    const msg = `ログイン失敗：${String(e)}`;
    if (loginError) loginError.textContent = msg;
    setLoginStatus("");
    console.error("[customer-portal] login error", e);
  } finally {
    loginBusy = false;
    if (btn) btn.disabled = false;
  }
}

loginForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  performLogin();
});

document.getElementById("btn-login")?.addEventListener("click", (e) => {
  e.preventDefault();
  performLogin();
});

document.getElementById("btn-logout")?.addEventListener("click", () => {
  clearCustomerToken();
  setAdminToken("");
  portalData = null;
  showLogin();
  history.replaceState(null, "", `/customer/${customerCode}`);
  if (loginError) loginError.textContent = "";
  setLoginStatus("");
});

document.getElementById("btn-section-back")?.addEventListener("click", () => {
  history.replaceState(null, "", `/customer/${customerCode}`);
  showHub();
});

function renderDevicesSection(devices) {
  const types = ["PLC", "RP2350", "ESP32", "TV", "Gateway"];
  return `
    <h2>設備一覧</h2>
    ${types
      .map((t) => {
        const list = devices.grouped?.[t] ?? [];
        if (!list.length) return "";
        return `<div class="device-group"><h3>${t}</h3>
          <div class="responsive-cards">${list
            .map(
              (d) =>
                `<div class="responsive-card-item">
                  <strong>${d.label ?? d.deviceId}</strong>
                  <span class="${d.online ? "badge-online" : "badge-offline"}">${d.online ? "オンライン" : "オフライン"}</span>
                </div>`
            )
            .join("")}</div></div>`;
      })
      .join("") || "<p>設備なし</p>"}`;
}

function renderEventsSection(events, alarms) {
  return `
    <h2>通知履歴</h2>
    <h3>最新イベント</h3>
    <ul class="simple-list">${(events.events ?? [])
      .map((e) => `<li>${e.created_at?.slice(0, 16)} — ${e.event_type}: ${e.message}</li>`)
      .join("") || "<li>イベントなし</li>"}</ul>
    <h3>警報履歴</h3>
    <ul class="simple-list">${(alarms.alarms ?? [])
      .slice(0, 15)
      .map((a) => `<li><strong>${a.severity}</strong> ${a.message || a.event_type}</li>`)
      .join("") || "<li>警報なし</li>"}</ul>`;
}

function renderBillingSection(dash) {
  const contract = dash.contract ?? {};
  const billing = dash.billing;
  return `
    <h2>請求情報</h2>
    <div class="responsive-cards">
      <div class="responsive-card-item"><span>プラン</span><strong>${contract.plan ?? dash.customer.plan}</strong></div>
      <div class="responsive-card-item"><span>契約状態</span><strong>${contract.status ?? "active"}</strong></div>
      ${
        billing
          ? `<div class="responsive-card-item"><span>サブスク</span><strong>${billing.subscription_status ?? "—"}</strong></div>
             <div class="responsive-card-item"><span>次回請求</span><strong>${billing.next_billing_date ?? "—"}</strong></div>
             <div class="responsive-card-item"><span>最終請求</span><strong>${billing.last_invoice_status ?? "—"}</strong></div>`
          : `<p class="hint">請求詳細は owner / manager ロールで表示されます（placeholder）</p>`
      }
    </div>
    <p class="hint">${contract.contractNote ?? ""}</p>`;
}

async function showSection(hash) {
  if (!portalData) await showDashboard();
  const section = document.getElementById("portal-section-view");
  const content = document.getElementById("portal-section-content");
  const cards = document.getElementById("portal-hub-cards");
  section.hidden = false;
  cards.hidden = true;

  if (hash === "devices") {
    const devices = await apiGet(`/api/customer/${customerCode}/devices`).catch(() => ({ grouped: {} }));
    content.innerHTML = renderDevicesSection(devices);
  } else if (hash === "events") {
    const [events, alarms] = await Promise.all([
      apiGet(`/api/customer/${customerCode}/events?limit=12`).catch(() => ({ events: [] })),
      apiGet(`/api/customer/${customerCode}/alarms`).catch(() => ({ alarms: [] })),
    ]);
    content.innerHTML = renderEventsSection(events, alarms);
  } else if (hash === "billing") {
    content.innerHTML = renderBillingSection(portalData);
  }
}

function handleHash() {
  const hash = location.hash.replace("#", "");
  if (!getAdminToken()) {
    showLogin();
    return;
  }
  if (hash === "devices" || hash === "events" || hash === "billing") {
    showSection(hash).catch(() => showHub());
  } else {
    showHub();
  }
}

async function showDashboard() {
  if (!getAdminToken()) {
    showLogin();
    return;
  }
  showHub();
  wireHubLinks();

  const [dash, devices, events, alarms] = await Promise.all([
    apiGet(`/api/customer/${customerCode}/dashboard`),
    apiGet(`/api/customer/${customerCode}/devices`).catch(() => ({ grouped: {} })),
    apiGet(`/api/customer/${customerCode}/events?limit=8`).catch(() => ({ events: [] })),
    apiGet(`/api/customer/${customerCode}/alarms`).catch(() => ({ alarms: [] })),
  ]);

  portalData = { ...dash, devices, events, alarms };
  applyBranding(dash.branding, dash.customer);

  document.getElementById("portal-customer-name").textContent = dash.customer.customerName;
  document.getElementById("portal-plan").textContent = dash.customer.plan;
  document.getElementById("portal-contract-status").textContent =
    dash.contract?.status ?? "active";

  const statusEl = document.getElementById("overall-status");
  const st = dash.summary.overallStatus;
  statusEl.className = `status-banner portal-status ${st}`;
  statusEl.textContent = `全体ステータス: ${statusLabel(st)} · 設備 ${dash.cards.deviceCount} · オンライン ${dash.cards.onlineCount}`;

  await loadUsersTab();
  await loadHandoverCard();
  handleHash();
}

async function loadHandoverCard() {
  const root = document.getElementById("handover-summary");
  const link = document.getElementById("handover-detail-link");
  if (!root) return;
  link.href = `/customer/${customerCode}/handover`;
  try {
    const raw = await apiGet(`/api/customer/${customerCode}/handover`);
    const data = raw.handover ?? raw;
    const equip = (data.equipment ?? []).slice(0, 6);
    root.innerHTML = `
      <p>導入機器 ${equip.length} 件 · QR ${(data.qrList ?? []).length} 件</p>
      <ul class="simple-list">${equip.map((d) => `<li>${d.label} (${d.kind})</li>`).join("") || "<li>—</li>"}</ul>`;
  } catch {
    root.innerHTML = "<p class='hint'>引渡し情報の読込にはログインが必要です</p>";
  }
}

async function loadSiteBuilderTab() {
  const data = await apiGet(`/api/customer/${customerCode}/sites/builder`).catch(() => ({ sites: [] }));
  const el = document.getElementById("site-builder-tree");
  if (!el) return;
  el.innerHTML = (data.sites ?? [])
    .map(
      (s) =>
        `<div class="mini-card"><strong>${s.name}</strong> — ${s.address ?? ""}
         <ul>${(s.floors ?? []).map((f) => `<li>フロア: ${f.name}</li>`).join("") || "<li>フロア未登録</li>"}</ul></div>`
    )
    .join("") || "<p>現場なし</p>";
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
  const el = document.getElementById("recovery-rules-cards");
  if (el) {
    el.innerHTML = (rules.rules ?? [])
      .map(
        (r) =>
          `<div class="responsive-card-item"><strong>${r.name}</strong>
           <span>${r.condition_type} → ${r.action_type}</span>
           <button type="button" class="btn secondary btn-rec-del" data-id="${r.id}">削除</button></div>`
      )
      .join("") || "<p>ルールなし</p>";
    el.querySelectorAll(".btn-rec-del").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await fetch(`/api/customer/${customerCode}/recovery-rules/${btn.dataset.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${getAdminToken()}` },
        });
        await loadRecoveryTab();
      });
    });
  }
}

document.getElementById("btn-recovery-save")?.addEventListener("click", async () => {
  await apiPost(`/api/customer/${customerCode}/recovery-rules`, {
    name: document.getElementById("recovery-name").value,
    conditionType: "device_offline",
    conditionDeviceType: "ESP",
    actionType: "shelly_reboot",
  });
  await loadRecoveryTab();
});

async function loadFieldViewTab() {
  const root = document.getElementById("field-view-root");
  const tabBtn = document.getElementById("tab-field-btn");
  const isOwner = currentUserRole === "owner" || currentUserRole === "super_admin";
  if (tabBtn) tabBtn.hidden = !isOwner;
  if (!isOwner || !root) return;
  try {
    const data = await apiGet(`/api/customer/${customerCode}/field-view`);
    root.innerHTML = `<ul class="simple-list">${(data.devices ?? [])
      .slice(0, 12)
      .map((d) => `<li>${d.label} — ${d.deviceType} [${d.status}]</li>`)
      .join("")}</ul>`;
  } catch {
    root.textContent = "owner 権限が必要です";
  }
}

async function loadUsersTab() {
  const data = await apiGet(`/api/customer/${customerCode}/users`).catch(() => ({ users: [] }));
  currentUserRole = data.currentRole ?? currentUserRole;
  await loadFieldViewTab();
  const canManage = ["owner", "admin", "super_admin"].includes(currentUserRole);
  document.getElementById("users-role-hint").textContent = canManage
    ? "owner/admin: 招待・ロール変更が可能"
    : "閲覧のみ";
  document.getElementById("users-invite-form").hidden = !canManage;

  document.getElementById("users-body").innerHTML = (data.users ?? [])
    .map(
      (u) =>
        `<tr><td>${u.username}</td><td>${u.role}</td><td>${u.status}</td>
         <td>${u.last_login_at ?? "—"}</td><td></td></tr>`
    )
    .join("");
}

async function loadNotificationRulesTab() {
  const data = await apiGet(`/api/customer/${customerCode}/notification-rules`).catch(() => ({
    rules: [],
    planLimits: { allowed: [], blocked: [] },
  }));
  document.getElementById("notif-plan-hint").textContent =
    `利用可: ${(data.planLimits?.allowed ?? []).join(", ") || "なし"}`;
  const canManage = ["owner", "admin", "manager", "super_admin"].includes(currentUserRole);
  document.getElementById("notif-rule-form").hidden = !canManage;
  const cards = document.getElementById("notif-rules-cards");
  if (cards) {
    cards.innerHTML = (data.rules ?? [])
      .map(
        (r) =>
          `<div class="responsive-card-item"><strong>${r.name}</strong>
           <span>${r.enabled ? "ON" : "OFF"} · ${(r.channels ?? []).join(", ")}</span></div>`
      )
      .join("") || "<p>ルールなし</p>";
  }
}

document.getElementById("btn-rule-save")?.addEventListener("click", async () => {
  await apiPost(`/api/customer/${customerCode}/notification-rules`, {
    name: document.getElementById("rule-name").value.trim() || "ルール",
    enabled: document.getElementById("rule-enabled").checked,
    eventTypes: document.getElementById("rule-events").value.split(",").map((s) => s.trim()),
    severity: document.getElementById("rule-severity").value.trim(),
    channels: document.getElementById("rule-channels").value.split(",").map((s) => s.trim()),
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  });
  await loadNotificationRulesTab();
});

async function loadAuditTab() {
  const data = await apiGet(`/api/customer/${customerCode}/audit`);
  const el = document.getElementById("audit-activity-list");
  if (!el) return;
  el.innerHTML = (data.entries ?? data.logs ?? [])
    .map((a) => `<li><time>${a.createdAt}</time> <strong>${a.action}</strong></li>`)
    .join("") || "<li>ログなし</li>";
}

document.querySelectorAll(".portal-tabs .tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".portal-tabs .tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const id = tab.dataset.tab;
    document.getElementById("tab-sites").hidden = id !== "sites";
    document.getElementById("tab-users").hidden = id !== "users";
    document.getElementById("tab-notifications").hidden = id !== "notifications";
    document.getElementById("tab-recovery").hidden = id !== "recovery";
    document.getElementById("tab-audit").hidden = id !== "audit";
    document.getElementById("tab-field").hidden = id !== "field";
    if (id === "sites" && getAdminToken()) loadSiteBuilderTab().catch(console.error);
    if (id === "field" && getAdminToken()) loadFieldViewTab().catch(console.error);
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
    el.textContent = `招待: ${res.inviteToken?.slice(0, 12)}…`;
    await loadUsersTab();
  } catch (e) {
    el.textContent = String(e);
  }
});

window.addEventListener("hashchange", handleHash);

if (getAdminToken()) {
  setCustomerToken(getAdminToken(), customerCode);
  showDashboard().catch(() => {
    clearCustomerToken();
    setAdminToken("");
    showLogin();
  });
} else {
  showLogin();
}

const man = document.getElementById("customer-portal-manifest");
if (man && customerCode) man.href = `/customer/${customerCode}/manifest.webmanifest`;
