import { initPracticalNav } from "./tisly-practical-nav.js";
import {
  getCustomerToken,
  requireCustomerLogin,
  customerCodeFromPath,
} from "./customer-auth.js";
import { renderFriendlyErrorHtml } from "./tisly-friendly-errors.js";

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2500);
}

async function api(path, opts = {}) {
  const token = getCustomerToken();
  const res = await fetch(`/api/google-calendar${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function badgeClass(displayStatus) {
  if (displayStatus === "sync_success" || displayStatus === "logged_in") return "live";
  if (displayStatus === "mock") return "mock";
  if (displayStatus === "sync_failed") return "err";
  return "off";
}

let statusData = null;

async function refreshStatus() {
  statusData = await api("/status");
  const cal = statusData;
  const settings = cal.settings || {};

  const modeLabel = cal.mode === "live" ? "live（本番）" : "mock";
  const missing =
    Array.isArray(cal.missingEnv) && cal.missingEnv.length
      ? ` · 不足env: ${cal.missingEnv.join(", ")}`
      : "";
  $("status-line").innerHTML = `<span class="gcal-status-badge ${badgeClass(cal.displayStatus)}">${cal.displayLabel}</span> · モード: ${modeLabel}${missing}`;
  $("oauth-line").textContent = cal.connected
    ? `ログイン済み · リダイレクト: ${cal.redirectUri || "—"}`
    : cal.configured
      ? "Googleアカウント未ログイン — 「Googleログイン」から認証してください"
      : "OAuth未設定 — VPS .env に GOOGLE_CALENDAR_ENABLED 等を設定してください";
  const sync = cal.sync || {};
  $("sync-line").textContent = sync.lastSyncedAt
    ? `最終同期: ${sync.lastSyncedAt.slice(0, 16).replace("T", " ")} · ${sync.eventCount}件`
    : "まだ同期していません";

  const canSync = cal.mode === "live" && cal.connected;
  $("btn-login").classList.toggle("hidden", !cal.configured || cal.connected);
  $("btn-sync").disabled = !canSync;
  $("btn-disconnect").disabled = !cal.connected || cal.mode !== "live";

  $("calendar-select").disabled = !cal.connected;
  $("auto-create").disabled = !cal.connected;
  $("sync-direction").disabled = !cal.connected;
  $("btn-save-settings").disabled = !cal.connected;

  $("auto-create").checked = settings.autoCreateProjects !== false;
  $("sync-direction").value = settings.syncDirection || "bidirectional";

  if (cal.connected) {
    await loadCalendars(settings.calendarId);
  }
}

async function loadCalendars(selectedId) {
  try {
    const { calendars } = await api("/calendars");
    const sel = $("calendar-select");
    sel.innerHTML = calendars
      .map(
        (c) =>
          `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${c.summary}${c.primary ? "（メイン）" : ""}</option>`
      )
      .join("");
  } catch (e) {
    $("calendar-select").innerHTML = `<option value="primary">primary（読込失敗）</option>`;
    console.warn(e);
  }
}

async function init() {
  await requireCustomerLogin(customerCodeFromPath());
  initPracticalNav({
    appId: "schedule_v1",
    appName: "Googleカレンダー",
    theme: "blue",
  });

  const params = new URLSearchParams(window.location.search);
  if (params.get("oauth") === "ok") {
    toast("Googleログインが完了しました");
    window.history.replaceState({}, "", "/google-calendar-settings-v1");
  }
  const err = params.get("error");
  if (err) {
    toast(decodeURIComponent(err));
    window.history.replaceState({}, "", "/google-calendar-settings-v1");
  }

  await refreshStatus();

  $("btn-login")?.addEventListener("click", () => {
    window.location.href = "/auth/google";
  });

  $("btn-sync")?.addEventListener("click", async () => {
    const btn = $("btn-sync");
    btn.disabled = true;
    btn.textContent = "同期中…";
    try {
      if (!statusData?.configured || statusData.mode !== "live") {
        toast("Googleカレンダー未設定：設定画面でログインしてください");
        return;
      }
      if (!statusData.connected) {
        window.location.href = "/auth/google";
        return;
      }
      const result = await api("/sync/full", {
        method: "POST",
        body: JSON.stringify({ weeks: 8 }),
      });
      const el = $("sync-result");
      el.classList.remove("hidden");
      const modeLabel = result.modeLabel || "Google";
      el.textContent = `同期完了（${result.pulled}件・${modeLabel}） — 送信${result.pushed}件 / 案件自動生成${result.projectsCreated}件`;
      toast(`同期完了（${result.pulled}件・${modeLabel}）`);
      await refreshStatus();
    } catch (e) {
      toast(e.message || "同期に失敗しました");
    } finally {
      btn.textContent = "今すぐ同期";
      btn.disabled = false;
    }
  });

  $("btn-disconnect")?.addEventListener("click", async () => {
    if (!confirm("Google連携を解除しますか？")) return;
    try {
      await api("/disconnect", { method: "POST", body: "{}" });
      toast("連携を解除しました");
      await refreshStatus();
    } catch (e) {
      toast(e.message || "解除に失敗しました");
    }
  });

  $("btn-save-settings")?.addEventListener("click", async () => {
    try {
      const calendarId = $("calendar-select").value;
      const calendarSummary =
        $("calendar-select").selectedOptions[0]?.textContent?.replace(/（メイン）$/, "") ?? null;
      await api("/settings", {
        method: "PATCH",
        body: JSON.stringify({
          calendarId,
          calendarSummary,
          autoCreateProjects: $("auto-create").checked,
          syncDirection: $("sync-direction").value,
        }),
      });
      toast("設定を保存しました");
    } catch (e) {
      toast(e.message || "保存に失敗しました");
    }
  });
}

init().catch((e) => {
  console.error(e);
  document.querySelector(".app-main").innerHTML = `<div class="error-friendly">${renderFriendlyErrorHtml(e, e.status)}</div>`;
});
