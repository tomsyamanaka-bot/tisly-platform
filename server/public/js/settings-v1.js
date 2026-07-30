import { initPracticalNav } from "./tisly-practical-nav.js";
import { requireCustomerLogin, customerCodeFromPath } from "./customer-auth.js";

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3500);
}

function formatJaDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ja-JP", { hour12: false });
  } catch {
    return iso;
  }
}

function authHeaders() {
  const token =
    localStorage.getItem("tisly_admin_token") || sessionStorage.getItem("tisly_token") || "";
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function api(path, opts = {}) {
  const res = await fetch(`/api/storage/v1/settings${path}`, {
    ...opts,
    headers: {
      ...authHeaders(),
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function tenantSaasApi(path = "", opts = {}) {
  const res = await fetch(`/api/tenant-saas/v1${path}`, {
    ...opts,
    headers: {
      ...authHeaders(),
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function renderSummary(summary) {
  $("status-local").textContent = summary.localLabel.replace("✅ ", "") === "有効" ? "✅" : summary.localLabel;
  $("status-local").className = summary.localLabel.includes("✅") ? "status-ok" : "status-muted";

  const qnapEl = $("status-qnap");
  qnapEl.textContent = summary.qnapLabel;
  if (summary.qnapLabel === "接続成功") qnapEl.className = "status-ok";
  else if (summary.qnapLabel === "接続失敗") qnapEl.className = "status-err";
  else if (summary.qnapLabel === "未確認") qnapEl.className = "status-warn";
  else qnapEl.className = "status-muted";

  $("status-last-check").textContent = formatJaDateTime(summary.lastCheckedAt);
}

/**
 * 月額契約・設定エリアカードを描画
 * （ダーク高コントラスト UI）
 */
function renderTenantSaas(status) {
  if (!status) return;

  const planEl = $("tenant-saas-plan");
  const regionEl = $("tenant-saas-region");
  if (!planEl || !regionEl) return;

  planEl.textContent = status.planStatusLabel || "—";
  planEl.classList.remove("is-trial", "is-canceled");
  if (status.plan_status === "trial") planEl.classList.add("is-trial");
  if (status.plan_status === "canceled") planEl.classList.add("is-canceled");

  regionEl.textContent = `設定エリア: ${status.regionLabel || "—"}`;

  const setText = (id, value) => {
    const el = $(id);
    if (el) el.textContent = value ?? "—";
  };
  setText("tenant-saas-tenant-id", status.tenant_id || "—");
  setText("tenant-saas-fee", status.monthlyFeeLabel || "—");
  setText("tenant-saas-currency", status.currency || "—");
  setText(
    "tenant-saas-devices",
    typeof status.connectedDeviceCount === "number"
      ? `${status.connectedDeviceCount} 台`
      : "—"
  );
  setText(
    "tenant-saas-code",
    status.customerCode
      ? `${status.customerCode}${status.customerName ? ` · ${status.customerName}` : ""}`
      : "—"
  );
}

async function load() {
  const data = await api("");
  renderSummary(data.summary);
}

async function loadTenantSaas() {
  const data = await tenantSaasApi("");
  renderTenantSaas(data.status);
}

async function init() {
  initPracticalNav({ appId: "settings_v1", appName: "設定", theme: "hub" });

  const session = await requireCustomerLogin(customerCodeFromPath());
  if (!session) return;

  const allowed = ["owner", "admin", "super_admin"];
  if (!allowed.includes(session.role)) {
    toast("管理者権限が必要です");
    setTimeout(() => {
      location.href = "/app";
    }, 1500);
    return;
  }

  try {
    await load();
  } catch (e) {
    toast(e.message || "読み込みに失敗しました");
  }

  try {
    await loadTenantSaas();
  } catch (e) {
    const planEl = $("tenant-saas-plan");
    if (planEl) planEl.textContent = "取得失敗";
    toast(e.message || "契約ステータスの読込に失敗");
  }
}

init().catch(console.error);
