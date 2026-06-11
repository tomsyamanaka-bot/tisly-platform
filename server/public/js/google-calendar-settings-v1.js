import { initPracticalNav } from "./tisly-practical-nav.js";
import {
  getCustomerToken,
  requireCustomerLogin,
  customerCodeFromPath,
} from "./customer-auth.js";
import { renderFriendlyErrorHtml } from "./tisly-friendly-errors.js";

const $ = (id) => document.getElementById(id);

const SYNC_DIRECTION_LABEL = {
  bidirectional: "双方向",
  pull_only: "Google → TiSLY のみ",
  push_only: "TiSLY → Google のみ",
};

const PRIMARY_LABEL = "メインカレンダー（primary）";

function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3500);
}

function apiErrorMessage(data, status) {
  if (data?.message) return data.message;
  if (data?.error) return data.error;
  return `HTTP ${status}`;
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
    const err = new Error(apiErrorMessage(data, res.status));
    err.status = res.status;
    err.code = data.code;
    err.details = data.details;
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

function calendarOptionLabel(c, calStatus) {
  if (!c) return PRIMARY_LABEL;
  if (c.id === "primary" || c.primary) return PRIMARY_LABEL;
  return c.summary;
}

function resolveCalendarSelectLabel(cal, calendarData) {
  if (!cal?.configured || cal.mode !== "live") {
    return { label: PRIMARY_LABEL, hint: "mockモード" };
  }
  if (!cal.connected) {
    return { label: "Googleログインが必要です", hint: "Googleログイン" };
  }
  if (cal.needsRelogin || cal.scope?.needsReLogin) {
    return { label: "再ログイン必要（権限不足）", hint: "再ログイン" };
  }
  if (calendarData?.needsRelogin || (calendarData?.usedFallback && calendarData?.httpStatus === 403)) {
    return { label: "権限不足・再ログイン", hint: calendarData?.warning || "再ログイン" };
  }
  if (cal.calendarListOk || !calendarData?.usedFallback) {
    return { label: PRIMARY_LABEL, hint: null };
  }
  if (calendarData?.usedFallback) {
    return { label: "再ログイン必要", hint: calendarData?.warning };
  }
  return { label: PRIMARY_LABEL, hint: null };
}

function formatCalendarLabel(settings, calendars) {
  const id = settings?.calendarId || "primary";
  const fromList = (calendars || []).find((c) => c.id === id);
  if (fromList) return calendarOptionLabel(fromList);
  if (id === "primary") return PRIMARY_LABEL;
  return settings?.calendarSummary || id;
}

function addDaysIso(iso, n) {
  const d = new Date(`${iso}T12:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function mondayOfWeekOffset(offset = 0) {
  const tz = "Asia/Tokyo";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const wd =
    new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" })
      .formatToParts(new Date(`${today}T12:00:00+09:00`))
      .find((p) => p.type === "weekday")?.value ?? "Mon";
  const dayIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? 1;
  const mondayOffset = dayIndex === 0 ? -6 : 1 - dayIndex;
  return addDaysIso(today, mondayOffset + offset * 7);
}

function resolveSyncDateRange(body) {
  const weekOffset = Number.isFinite(Number(body.weekOffset)) ? Number(body.weekOffset) : 0;
  const weeks = Math.max(1, Number(body.weeks) || 8);
  const dateFrom = body.dateFrom || body.startDate || mondayOfWeekOffset(weekOffset);
  const dateTo = body.dateTo || body.endDate || addDaysIso(dateFrom, weeks * 7 - 1);
  return { dateFrom, dateTo, weekOffset };
}

function showSyncDebug(body) {
  const calendarId = body.selectedCalendarId || body.calendarId || "primary";
  const { dateFrom, dateTo } = resolveSyncDateRange(body);
  const syncDirection = body.syncDirection || "two_way";
  const timezone = body.timezone || "Asia/Tokyo";
  const el = $("sync-debug-line");
  if (el) {
    el.textContent = [
      `selectedCalendarId=${calendarId}`,
      `syncDirection=${syncDirection}`,
      `dateFrom=${dateFrom}`,
      `dateTo=${dateTo}`,
      `timezone=${timezone}`,
    ].join(" · ");
  }
}

let statusData = null;
let loadedCalendars = [];

async function refreshStatus() {
  statusData = await api("/status");
  const cal = statusData;
  const settings = cal.settings || {};

  const lines = [];
  if (cal.connected) {
    lines.push("Googleログイン済み");
  } else if (cal.configured) {
    lines.push("Googleアカウント未ログイン");
  } else {
    lines.push(cal.displayLabel || "未設定");
  }

  if (cal.mode === "live") {
    lines.push("live接続");
  } else {
    lines.push("mockモード");
  }

  lines.push(`カレンダー：${formatCalendarLabel(settings, loadedCalendars)}`);
  lines.push(`同期方向：${SYNC_DIRECTION_LABEL[settings.syncDirection] || "双方向"}`);

  const sync = cal.sync || {};
  if (sync.lastSyncedAt) {
    lines.push(
      `最終同期：${sync.lastSyncedAt.slice(0, 16).replace("T", " ")} · ${sync.eventCount ?? 0}件`
    );
  } else {
    lines.push("最終同期：まだ同期していません");
  }

  if (cal.needsRelogin || cal.scope?.needsReLogin) {
    lines.push("⚠️ 権限が不足しています。再ログインしてください");
  } else if (cal.connected && cal.calendarListOk === false) {
    lines.push("⚠️ カレンダー一覧の取得に失敗 — 再ログインを試してください");
  }

  $("status-line").innerHTML = `<span class="gcal-status-badge ${badgeClass(cal.displayStatus)}">${escapeHtml(cal.displayLabel)}</span>`;
  $("oauth-line").textContent = lines.join(" · ");

  const missing =
    Array.isArray(cal.missingEnv) && cal.missingEnv.length
      ? `不足env: ${cal.missingEnv.join(", ")}`
      : "";
  $("sync-line").textContent = [
    cal.scope?.label ? `OAuthスコープ: ${cal.scope.label}` : "",
    missing,
    cal.sync?.lastSyncError ? `直近エラー: ${cal.sync.lastSyncError}` : "",
  ]
    .filter(Boolean)
    .join(" · ") || " ";

  const needsRelogin = Boolean(cal.needsRelogin || cal.scope?.needsReLogin);
  const canSync = cal.mode === "live" && cal.connected && !needsRelogin;
  $("btn-login").classList.toggle("hidden", !cal.configured || (cal.connected && !needsRelogin));
  $("btn-login").textContent = needsRelogin ? "再ログイン" : "Googleログイン";
  $("btn-sync").disabled = !canSync;
  $("btn-disconnect").disabled = !cal.connected || cal.mode !== "live";

  $("calendar-select").disabled = !cal.connected;
  $("auto-create").disabled = !cal.connected;
  $("sync-direction").disabled = !cal.connected;
  $("btn-save-settings").disabled = !cal.connected;

  $("auto-create").checked = settings.autoCreateProjects !== false;
  $("sync-direction").value = settings.syncDirection || "bidirectional";

  if (cal.connected) {
    await loadCalendars(settings.calendarId || "primary");
  } else {
    loadedCalendars = [{ id: "primary", summary: "メインカレンダー", primary: true, writable: true }];
    $("calendar-select").innerHTML = `<option value="primary">${PRIMARY_LABEL}</option>`;
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function primaryFallbackCalendars() {
  return [{ id: "primary", summary: "メインカレンダー", primary: true, accessRole: "owner", writable: true }];
}

async function loadCalendars(selectedId) {
  const sel = $("calendar-select");
  const cal = statusData || {};
  try {
    const data = await api("/calendars");
    loadedCalendars = data.calendars?.length ? data.calendars : primaryFallbackCalendars();
    const effectiveId = selectedId || "primary";
    const { label: stateLabel, hint } = resolveCalendarSelectLabel(cal, data);
    if (data.usedFallback && (data.needsRelogin || data.httpStatus === 403 || data.httpStatus === 401)) {
      loadedCalendars = primaryFallbackCalendars();
      sel.innerHTML = `<option value="primary" selected>${escapeHtml(stateLabel)}</option>`;
    } else {
      sel.innerHTML = loadedCalendars
        .map((c) => {
          const label = calendarOptionLabel(c, cal);
          return `<option value="${escapeHtml(c.id)}" ${c.id === effectiveId ? "selected" : ""}>${escapeHtml(label)}</option>`;
        })
        .join("");
    }
    if (hint) {
      const syncLine = $("sync-line");
      if (syncLine && !syncLine.textContent.includes(hint)) {
        syncLine.textContent = [syncLine.textContent, hint].filter(Boolean).join(" · ");
      }
    }
  } catch {
    loadedCalendars = primaryFallbackCalendars();
    const { label: stateLabel } = resolveCalendarSelectLabel(cal, { usedFallback: true });
    sel.innerHTML = `<option value="primary" selected>${escapeHtml(stateLabel)}</option>`;
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
      if (statusData.needsRelogin || statusData.scope?.needsReLogin) {
        toast("権限が不足しています。再ログインしてください。");
        return;
      }
      const calendarId = $("calendar-select").value || "primary";
      const syncBody = {
        weeks: 8,
        selectedCalendarId: calendarId,
        syncDirection: $("sync-direction").value || "bidirectional",
        timezone: "Asia/Tokyo",
      };
      showSyncDebug(syncBody);
      const result = await api("/sync/full", {
        method: "POST",
        body: JSON.stringify(syncBody),
      });
      if (result.mode !== "real") {
        toast("本番接続が必要です。OAuth 設定後に再試行してください。");
        return;
      }
      const el = $("sync-result");
      el.classList.remove("hidden");
      const modeLabel = result.modeLabel || "Google";
      const count = result.pulled ?? 0;
      el.textContent = `同期完了（${count}件・${modeLabel}） — 送信${result.pushed}件 / 案件自動生成${result.projectsCreated}件`;
      toast(`同期完了 ${count}件`);
      await refreshStatus();
    } catch (e) {
      toast(e.message || "同期に失敗しました");
    } finally {
      btn.textContent = "今すぐ同期";
      const canSync =
        statusData?.mode === "live" &&
        statusData?.connected &&
        !statusData?.needsRelogin &&
        !statusData?.scope?.needsReLogin;
      btn.disabled = !canSync;
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
      const calendarId = $("calendar-select").value || "primary";
      const calendarSummary =
        calendarId === "primary" ? "メインカレンダー" : calendarOptionLabel(
          loadedCalendars.find((c) => c.id === calendarId)
        );
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
      await refreshStatus();
    } catch (e) {
      toast(e.message || "保存に失敗しました");
    }
  });
}

init().catch((e) => {
  console.error(e);
  document.querySelector(".app-main").innerHTML = `<div class="error-friendly">${renderFriendlyErrorHtml(e, e.status)}</div>`;
});
