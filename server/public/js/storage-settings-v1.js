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

async function api(path, opts = {}) {
  const token =
    localStorage.getItem("tisly_admin_token") || sessionStorage.getItem("tisly_token") || "";
  const res = await fetch(`/api/storage/v1/settings${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
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

function showResult(el, ok, message) {
  if (!el) return;
  el.classList.remove("hidden", "ok", "err");
  el.classList.add(ok ? "ok" : "err");
  el.textContent = `${ok ? "✅" : "❌"} ${message}`;
}

function renderSummary(summary) {
  $("status-local").textContent = "✅";
  $("status-local").className = "status-ok";

  const qnapEl = $("status-qnap");
  qnapEl.textContent = summary.qnapLabel;
  if (summary.qnapLabel === "接続成功") qnapEl.className = "status-ok";
  else if (summary.qnapLabel === "接続失敗") qnapEl.className = "status-err";
  else if (summary.qnapLabel === "未確認") qnapEl.className = "status-warn";
  else qnapEl.className = "status-muted";

  $("status-last-check").textContent = formatJaDateTime(summary.lastCheckedAt);
}

function fillForm(settings) {
  $("local-enabled").checked = settings.localStorageEnabled !== false;
  $("qnap-enabled").checked = Boolean(settings.qnapBackupEnabled);
  $("qnap-host").value = settings.qnap?.host ?? "";
  $("qnap-port").value = settings.qnap?.port ?? 8080;
  $("qnap-share").value = settings.qnap?.shareName ?? "TiSLY";
  $("qnap-user").value = settings.qnap?.username ?? "";
  $("qnap-pass").value = "";
  $("qnap-pass").placeholder = settings.qnap?.hasPassword
    ? "変更時のみ入力（保存済み）"
    : "パスワード";
}

function collectForm() {
  return {
    localStorageEnabled: $("local-enabled").checked,
    qnapBackupEnabled: $("qnap-enabled").checked,
    qnap: {
      host: $("qnap-host").value.trim(),
      port: Number($("qnap-port").value) || 8080,
      shareName: $("qnap-share").value.trim() || "TiSLY",
      username: $("qnap-user").value.trim(),
      password: $("qnap-pass").value,
    },
  };
}

async function load() {
  const data = await api("");
  fillForm(data.settings);
  renderSummary(data.summary);
  if (data.settings.lastConnectionTest) {
    showResult(
      $("connection-result"),
      data.settings.lastConnectionTest.ok,
      data.settings.lastConnectionTest.message
    );
  }
  if (data.settings.lastTestPdfSend) {
    showResult($("pdf-result"), data.settings.lastTestPdfSend.ok, data.settings.lastTestPdfSend.message);
  }
}

async function init() {
  initPracticalNav({ appId: "settings_v1", appName: "ストレージ", theme: "hub" });

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

  $("btn-save")?.addEventListener("click", async () => {
    try {
      const data = await api("", { method: "PUT", body: JSON.stringify(collectForm()) });
      fillForm(data.settings);
      renderSummary(data.summary);
      toast("保存しました");
    } catch (e) {
      toast(e.message || "保存に失敗しました");
    }
  });

  $("btn-test-connection")?.addEventListener("click", async () => {
    $("btn-test-connection").disabled = true;
    try {
      await api("", { method: "PUT", body: JSON.stringify(collectForm()) });
      const data = await api("/qnap/test-connection", { method: "POST", body: "{}" });
      showResult($("connection-result"), data.result.ok, data.result.message);
      renderSummary(data.summary);
    } catch (e) {
      showResult($("connection-result"), false, e.message || "接続テスト失敗");
    } finally {
      $("btn-test-connection").disabled = false;
    }
  });

  $("btn-test-pdf")?.addEventListener("click", async () => {
    $("btn-test-pdf").disabled = true;
    try {
      await api("", { method: "PUT", body: JSON.stringify(collectForm()) });
      const data = await api("/qnap/test-pdf", { method: "POST", body: "{}" });
      showResult($("pdf-result"), data.result.ok, data.result.message);
      renderSummary(data.summary);
    } catch (e) {
      showResult($("pdf-result"), false, e.message || "テスト送信失敗");
    } finally {
      $("btn-test-pdf").disabled = false;
    }
  });

  try {
    await load();
  } catch (e) {
    toast(e.message || "読み込みに失敗しました");
  }
}

init().catch(console.error);
