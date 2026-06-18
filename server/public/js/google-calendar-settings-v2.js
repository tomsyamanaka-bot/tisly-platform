import { initPracticalNav } from "./tisly-practical-nav.js";
import {
  getCustomerToken,
  requireCustomerLogin,
  customerCodeFromPath,
} from "./customer-auth.js";
import {
  GOOGLE_OAUTH_ORG_INTERNAL_USER_MESSAGE,
  clearGoogleCalendarUiErrorState,
  formatConnectionTestLines,
  formatSyncResultLines,
  mountOAuthSetupGuideCard,
  renderGoogleCalendarErrorFromStatus,
  renderOAuthCallbackFromParams,
} from "./google-calendar-oauth-ui.js";

const $ = (id) => document.getElementById(id);

let statusData = null;
let allCalendars = [];

function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3500);
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
    const err = new Error(data.message || data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isWritableCal(c) {
  if (c.writable === false) return false;
  const role = (c.accessRole ?? "").toLowerCase();
  return role === "owner" || role === "writer" || c.writable === true;
}

function calendarLabel(c) {
  if (c.primary || c.id === "primary") return "マイカレンダー";
  return c.summary;
}

function isCheckedByDefault(c, settings) {
  if (settings.syncMode === "google_selected") return c.selected === true;
  if (settings.syncMode === "multiple" && settings.calendarIds?.length) {
    return settings.calendarIds.includes(c.id);
  }
  if (settings.syncMode === "primary_only") return c.primary || c.id === "primary";
  if (settings.syncMode === "selected_only") {
    return c.id === (settings.calendarId || "primary");
  }
  if (settings.syncMode === "all_writable") return isWritableCal(c);
  return c.selected === true;
}

function renderSyncTargetList(calendars, settings) {
  const panel = $("sync-target-list");
  if (!panel) return;
  if (!calendars.length) {
    panel.innerHTML = `<p class="gcal-meta">カレンダー一覧を取得できませんでした</p>`;
    return;
  }
  panel.innerHTML = calendars
    .map((c) => {
      const writable = isWritableCal(c);
      const checked = isCheckedByDefault(c, settings);
      const color = c.backgroundColor
        ? `<span class="cal-color-swatch" style="background:${escapeHtml(c.backgroundColor)}"></span>`
        : "";
      const roleHint = writable ? "" : `<span class="cal-role-hint">（読取のみ）</span>`;
      return `<label class="${writable ? "" : "readonly-cal"}">${color}<input type="checkbox" class="sync-cal-check" value="${escapeHtml(c.id)}" data-selected="${c.selected ? "1" : "0"}" ${checked ? "checked" : ""} /><span class="cal-label-text">${escapeHtml(calendarLabel(c))}${roleHint}</span></label>`;
    })
    .join("");
}

function getCheckedCalendarIds() {
  return [...document.querySelectorAll(".sync-cal-check:checked")].map((el) => el.value);
}

function applyGoogleSelectedChecks() {
  document.querySelectorAll(".sync-cal-check").forEach((el) => {
    el.checked = el.dataset.selected === "1";
  });
}

function renderStatus(cal) {
  statusData = cal;
  const line = $("status-line");
  const settings = cal.settings || {};
  const badge =
    cal.connected && cal.mode === "live"
      ? `<span class="gcal-status-badge live">連携済み</span>`
      : `<span class="gcal-status-badge off">未連携</span>`;
  line.innerHTML = `${badge} ${escapeHtml(cal.displayLabel || "—")}`;

  const needsRelogin = Boolean(cal.needsRelogin || cal.scope?.needsReLogin);
  $("btn-login").disabled = cal.connected && cal.mode === "live" && !needsRelogin;
  $("btn-login").textContent = needsRelogin ? "再ログイン" : "Googleログイン";
  const canUseLive = cal.connected && cal.mode === "live" && !needsRelogin;
  $("btn-sync").disabled = !canUseLive;
  $("btn-connection-test").disabled = !canUseLive;
  $("btn-save").disabled = !cal.connected;
  $("btn-match-google").disabled = !cal.connected;
  const reloginBtn = $("btn-relogin");
  if (reloginBtn) reloginBtn.disabled = !cal.configured || cal.mode !== "live";

  renderGoogleCalendarErrorFromStatus(cal);

  const banner = $("sync-mode-banner");
  if (banner) {
    const mode = settings.syncMode || "google_selected";
    if (mode === "google_selected") {
      banner.textContent = "現在: Googleアプリで表示ONのカレンダーを自動同期";
      banner.classList.remove("hidden");
    } else if (mode === "multiple") {
      banner.textContent = "現在: 下記チェックで選択したカレンダーを同期";
      banner.classList.remove("hidden");
    } else {
      banner.classList.add("hidden");
    }
  }
}

async function loadCalendars() {
  const settings = statusData?.settings || {};
  try {
    const data = await api("/calendars");
    allCalendars = data.allCalendars?.length ? data.allCalendars : data.calendars || [];
    renderSyncTargetList(allCalendars, settings);
    const checked = getCheckedCalendarIds();
    const names = allCalendars
      .filter((c) => checked.includes(c.id))
      .map((c) => calendarLabel(c));
    const pullLine = $("pull-target-line");
    if (pullLine) {
      pullLine.textContent = names.length
        ? `取得対象: ${names.join(" / ")}`
        : "取得対象: （未選択）";
    }
  } catch {
    $("sync-target-list").innerHTML = `<p class="gcal-meta">カレンダー一覧の取得に失敗しました</p>`;
  }
}

async function refresh() {
  const cal = await api("/status");
  renderStatus(cal);
  await loadCalendars();
}

async function saveSettings(syncMode, calendarIds) {
  const settings = await api("/settings", {
    method: "PATCH",
    body: JSON.stringify({ syncMode, calendarIds }),
  });
  toast("保存しました");
  statusData = { ...statusData, settings: settings.settings };
  await loadCalendars();
}

function showResultEl(el, ok, lines) {
  if (!el) return;
  el.classList.remove("hidden", "err");
  if (!ok) el.classList.add("err");
  el.textContent = lines.join(" · ");
}

async function init() {
  await requireCustomerLogin(customerCodeFromPath());
  initPracticalNav({
    appId: "google_calendar_settings_v2",
    appName: "Google同期対象",
    theme: "blue",
  });

  mountOAuthSetupGuideCard();

  const params = new URLSearchParams(window.location.search);
  const oauthView = renderOAuthCallbackFromParams(params);
  if (params.get("oauth") === "ok") {
    clearGoogleCalendarUiErrorState();
    const refreshSaved = params.get("oauth_refresh_token_saved") === "true";
    toast(
      refreshSaved
        ? "Googleログインが完了しました（トークン保存済み）"
        : "Googleログインが完了しました（refresh_token 未取得 — 再ログインを推奨）"
    );
    window.history.replaceState({}, "", "/google-calendar-settings-v2");
  }
  const err = params.get("error");
  if (err) {
    const msg = oauthView.orgInternal ? GOOGLE_OAUTH_ORG_INTERNAL_USER_MESSAGE : decodeURIComponent(err);
    toast(msg);
    window.history.replaceState({}, "", "/google-calendar-settings-v2");
  }

  await refresh();

  $("btn-login")?.addEventListener("click", async () => {
    const auth = await api("/auth/start?return=v2");
    if (auth.url) window.location.href = auth.url;
    else toast("Google連携未設定");
  });

  $("btn-relogin")?.addEventListener("click", async () => {
    try {
      const data = await api("/auth/relogin", {
        method: "POST",
        body: JSON.stringify({ returnTo: "v2" }),
      });
      window.location.href = data.url || "/auth/google?return=v2";
    } catch (e) {
      toast(e.message || "再ログイン準備に失敗しました");
    }
  });

  $("btn-connection-test")?.addEventListener("click", async () => {
    const btn = $("btn-connection-test");
    btn.disabled = true;
    btn.textContent = "テスト中…";
    try {
      const data = await api("/diagnostics/connection-test", {
        method: "POST",
        body: "{}",
      });
      showResultEl($("connection-test-result"), data.ok, formatConnectionTestLines(data));
      if (data.ok) {
        clearGoogleCalendarUiErrorState();
      }
      toast(data.ok ? "接続テスト成功" : data.error || "接続テスト失敗");
    } catch (e) {
      showResultEl($("connection-test-result"), false, [e.message || "接続テスト失敗"]);
      toast(e.message || "接続テスト失敗");
    } finally {
      btn.textContent = "接続テスト";
      const canUseLive =
        statusData?.connected &&
        statusData?.mode === "live" &&
        !statusData?.needsRelogin &&
        !statusData?.scope?.needsReLogin;
      btn.disabled = !canUseLive;
    }
  });

  $("btn-match-google")?.addEventListener("click", async () => {
    applyGoogleSelectedChecks();
    const ids = allCalendars.filter((c) => c.selected === true).map((c) => c.id);
    await saveSettings("google_selected", ids.length ? ids : ["primary"]);
  });

  $("btn-save")?.addEventListener("click", async () => {
    const ids = getCheckedCalendarIds();
    if (!ids.length) {
      toast("1件以上選択してください");
      return;
    }
    await saveSettings("multiple", ids);
  });

  $("sync-target-list")?.addEventListener("change", () => {
    const checked = getCheckedCalendarIds();
    const names = allCalendars
      .filter((c) => checked.includes(c.id))
      .map((c) => calendarLabel(c));
    const pullLine = $("pull-target-line");
    if (pullLine) {
      pullLine.textContent = names.length
        ? `取得対象: ${names.join(" / ")}`
        : "取得対象: （未選択）";
    }
  });

  $("btn-sync")?.addEventListener("click", async () => {
    const btn = $("btn-sync");
    btn.disabled = true;
    btn.textContent = "同期中…";
    try {
      const result = await api("/sync/full", {
        method: "POST",
        body: JSON.stringify({
          weeks: 8,
          syncDirection: "bidirectional",
          timezone: "Asia/Tokyo",
        }),
      });
      showResultEl($("sync-result"), true, formatSyncResultLines(result));
      clearGoogleCalendarUiErrorState();
      toast("同期しました");
      await refresh();
    } catch (e) {
      showResultEl($("sync-result"), false, [e.message || "同期失敗"]);
      toast(e.message || "同期失敗");
    } finally {
      btn.textContent = "今すぐ同期";
      const canUseLive =
        statusData?.connected &&
        statusData?.mode === "live" &&
        !statusData?.needsRelogin &&
        !statusData?.scope?.needsReLogin;
      btn.disabled = !canUseLive;
    }
  });
}

init().catch((e) => toast(e.message || "初期化失敗"));
