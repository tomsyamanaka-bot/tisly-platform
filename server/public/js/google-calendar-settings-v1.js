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

const SYNC_MODE_LABEL = {
  primary_only: "primaryのみ",
  selected_only: "選択カレンダーのみ",
  multiple: "複数カレンダー同期",
  all_writable: "全カレンダー同期",
};

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

function calendarOptionLabel(c) {
  if (!c) return PRIMARY_LABEL;
  if (c.id === "primary" || c.primary) return PRIMARY_LABEL;
  return c.summary;
}

function colorSwatchHtml(color) {
  if (!color) return "";
  return `<span class="cal-color-swatch" style="background:${escapeHtml(color)}"></span>`;
}

function isWritableCal(c) {
  if (c.writable === false) return false;
  const role = (c.accessRole ?? "").toLowerCase();
  return role === "owner" || role === "writer" || c.writable === true;
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

function boolLabel(v) {
  return v === true ? "true" : v === false ? "false" : "—";
}

function formatSafeLogBlock(safeLog) {
  if (!safeLog) return "";
  const lines = [
    safeLog.googleErrorCode != null ? `googleErrorCode=${safeLog.googleErrorCode}` : null,
    safeLog.googleErrorMessage ? `googleErrorMessage=${safeLog.googleErrorMessage}` : null,
    safeLog.httpStatus != null ? `httpStatus=${safeLog.httpStatus}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function formatGoogleApiErrorHintFromLog(safeLog) {
  if (!safeLog?.httpStatus) return safeLog?.googleErrorMessage ?? null;
  if (safeLog.httpStatus === 403) return "権限不足";
  if (safeLog.httpStatus === 401) return "再ログイン必要";
  if (safeLog.httpStatus === 400) {
    return safeLog.googleErrorMessage
      ? `validationエラー: ${safeLog.googleErrorMessage}`
      : "validationエラー";
  }
  return safeLog.googleErrorMessage ?? null;
}

function renderOAuthDebugFromParams(params) {
  const panel = $("oauth-debug-panel");
  const logEl = $("oauth-debug-log");
  if (!panel || !logEl) return;

  const oauthError = params.get("oauth_error");
  const oauthErrorDesc = params.get("oauth_error_description");
  const callback = params.get("oauth_callback");
  const redirectUri = params.get("oauth_redirect_uri");
  const clientId = params.get("oauth_client_id");
  const accessSaved = params.get("oauth_access_token_saved");
  const refreshSaved = params.get("oauth_refresh_token_saved");
  const genericError = params.get("error");

  const hasOAuthDebug =
    oauthError ||
    oauthErrorDesc ||
    callback ||
    redirectUri ||
    clientId ||
    accessSaved ||
    refreshSaved ||
    genericError;

  if (!hasOAuthDebug) {
    panel.classList.add("hidden");
    logEl.textContent = "";
    return;
  }

  const lines = [
    genericError ? `message: ${genericError}` : null,
    oauthError ? `error: ${oauthError}` : null,
    oauthErrorDesc ? `error_description: ${oauthErrorDesc}` : null,
    callback ? `callback: ${callback}` : null,
    redirectUri ? `redirect_uri: ${redirectUri}` : null,
    clientId ? `client_id: ${clientId}` : null,
    accessSaved != null ? `access_token_saved: ${accessSaved}` : null,
    refreshSaved != null ? `refresh_token_saved: ${refreshSaved}` : null,
  ].filter(Boolean);

  if (oauthError === "org_internal" || (oauthErrorDesc || "").toLowerCase().includes("org_internal")) {
    lines.push(
      "hint: OAuth User Type が Internal です。Console → Audience → External に変更し、Testing なら Test users にログイン用 Gmail を追加してください。"
    );
  }

  panel.classList.remove("hidden");
  logEl.textContent = lines.join("\n");
}

function renderDevInfo(cal) {
  const scopeShort =
    cal.tokenScopeShort ||
    (cal.tokenScope?.includes("readonly") ? "calendar.readonly" : cal.tokenScope ? "calendar" : "—");
  const safeLog = cal.lastSyncSafeLog ?? cal.sync?.lastSyncSafeLog ?? null;
  const lastErr = cal.lastSyncError ?? cal.sync?.lastSyncError ?? null;
  const oauthDbg = cal.oauthDebug ?? {};

  $("dev-mode").textContent = cal.mode ?? "—";
  $("dev-connected").textContent = boolLabel(cal.connected);
  const relogin = Boolean(cal.needsRelogin || cal.scope?.needsReLogin);
  const reloginEl = $("dev-needs-relogin");
  reloginEl.textContent = boolLabel(relogin);
  reloginEl.className = relogin ? "err" : "ok";

  const listOk = cal.calendarListOk;
  const listEl = $("dev-calendar-list-ok");
  listEl.textContent = boolLabel(listOk);
  listEl.className = listOk === false ? "err" : listOk === true ? "ok" : "";

  $("dev-selected-calendar").textContent = cal.selectedCalendarId ?? cal.settings?.calendarId ?? "—";
  $("dev-writable-calendar").textContent = cal.writableCalendarId ?? "—";
  $("dev-sync-mode").textContent = SYNC_MODE_LABEL[cal.settings?.syncMode] ?? cal.settings?.syncMode ?? "—";
  $("dev-calendar-ids").textContent = (cal.settings?.calendarIds || []).join(", ") || "—";
  $("dev-token-scope").textContent = scopeShort;
  $("dev-redirect-uri").textContent = oauthDbg.redirectUri ?? cal.redirectUri ?? "—";
  $("dev-client-id-masked").textContent = oauthDbg.clientIdMasked ?? "—";
  $("dev-oauth-scopes").textContent = oauthDbg.scopes ?? "—";
  const accessEl = $("dev-has-access-token");
  if (accessEl) {
    accessEl.textContent = boolLabel(cal.hasAccessToken);
    accessEl.className = cal.hasAccessToken ? "ok" : "err";
  }
  const refreshEl = $("dev-has-refresh-token");
  if (refreshEl) {
    refreshEl.textContent = boolLabel(cal.hasRefreshToken);
    refreshEl.className = cal.hasRefreshToken ? "ok" : "err";
  }
  const errEl = $("dev-last-sync-error");
  errEl.textContent = lastErr || "—";
  errEl.className = lastErr ? "err" : "";

  const safeEl = $("dev-safe-log");
  if (safeLog) {
    const hint = formatGoogleApiErrorHintFromLog(safeLog);
    safeEl.classList.remove("hidden");
    safeEl.textContent = [hint, formatSafeLogBlock(safeLog)].filter(Boolean).join("\n");
  } else {
    safeEl.classList.add("hidden");
    safeEl.textContent = "";
  }

  const canTest = cal.mode === "live" && cal.connected;
  $("btn-test-event").disabled = !canTest;
}

function renderTestEventResult(data) {
  const lines = [
    `tokenScope: ${data.tokenScopeShort ?? data.tokenScope ?? "—"}`,
    `needsRelogin: ${data.needsRelogin}`,
    data.googleApiError
      ? `Google API error: ${data.googleApiError.errorHint ?? formatSafeLogBlock(data.googleApiError)}`
      : null,
    data.testEvent?.ok
      ? `Events create: 成功（即削除済み eventId=${data.testEvent.eventId ?? "—"}）`
      : `Events create: 失敗 — ${data.testEvent?.error ?? data.testEvent?.googleErrorMessage ?? "不明"}`,
  ].filter(Boolean);
  const el = $("dev-test-result");
  if (el) el.textContent = lines.join(" · ");
}

function showSyncDebug(body) {
  const calendarId = body.selectedCalendarId || body.calendarId || "primary";
  const { dateFrom, dateTo } = resolveSyncDateRange(body);
  const syncDirection = body.syncDirection || "two_way";
  const syncMode = body.syncMode || "selected_only";
  const calendarIds = (body.calendarIds || []).join(",");
  const timezone = body.timezone || "Asia/Tokyo";
  const el = $("sync-debug-line");
  if (el) {
    el.textContent = [
      `syncMode=${syncMode}`,
      `selectedCalendarId=${calendarId}`,
      `calendarIds=${calendarIds || calendarId}`,
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
  lines.push(`同期モード：${SYNC_MODE_LABEL[settings.syncMode] || "選択カレンダーのみ"}`);
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
  $("btn-sync-test").disabled = !cal.connected || cal.mode !== "live";
  document.querySelectorAll('input[name="sync-mode"]').forEach((el) => {
    el.disabled = !cal.connected;
    el.checked = el.value === (settings.syncMode || "selected_only");
  });

  $("auto-create").checked = settings.autoCreateProjects !== false;
  $("sync-direction").value = settings.syncDirection || "bidirectional";

  renderDevInfo(cal);

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

function getSelectedSyncMode() {
  const checked = document.querySelector('input[name="sync-mode"]:checked');
  return checked?.value || "selected_only";
}

function renderMultiCalendarList(calendars, selectedIds) {
  const panel = $("multi-calendar-list");
  if (!panel) return;
  const mode = getSelectedSyncMode();
  if (mode !== "multiple") {
    panel.classList.remove("show");
    panel.innerHTML = "";
    return;
  }
  panel.classList.add("show");
  const ids = new Set(selectedIds || []);
  panel.innerHTML = calendars
    .filter((c) => isWritableCal(c))
    .map(
      (c) => `<label>${colorSwatchHtml(c.backgroundColor)}
        <input type="checkbox" class="multi-cal-check" value="${escapeHtml(c.id)}" ${ids.has(c.id) ? "checked" : ""} />
        ${escapeHtml(calendarOptionLabel(c))}</label>`
    )
    .join("");
}

function renderCalendarDebugTable(allCalendars) {
  const panel = $("cal-debug-panel");
  const body = $("cal-debug-body");
  if (!panel || !body) return;
  if (!allCalendars?.length) {
    panel.classList.add("hidden");
    body.innerHTML = "";
    return;
  }
  panel.classList.remove("hidden");
  body.innerHTML = allCalendars
    .map((c) => {
      const writable = isWritableCal(c);
      return `<tr>
        <td>${escapeHtml(c.summary)}${c.primary ? " ★" : ""}</td>
        <td>${escapeHtml(c.id)}</td>
        <td>${escapeHtml(c.accessRole ?? "—")}</td>
        <td class="writable-${writable}">${writable ? "true" : "false"}</td>
        <td>${colorSwatchHtml(c.backgroundColor)} ${escapeHtml(c.backgroundColor ?? "—")}</td>
      </tr>`;
    })
    .join("");
}

function getSelectedCalendarIds() {
  const mode = getSelectedSyncMode();
  const primaryId = $("calendar-select")?.value || "primary";
  if (mode === "primary_only") return ["primary"];
  if (mode === "selected_only") return [primaryId];
  if (mode === "all_writable") {
    return loadedCalendars.filter((c) => isWritableCal(c)).map((c) => c.id);
  }
  const checks = [...document.querySelectorAll(".multi-cal-check:checked")].map((el) => el.value);
  return checks.length ? checks : [primaryId];
}

async function loadCalendars(selectedId) {
  const sel = $("calendar-select");
  const cal = statusData || {};
  const settings = cal.settings || {};
  try {
    const data = await api("/calendars");
    loadedCalendars = data.calendars?.length ? data.calendars : primaryFallbackCalendars();
    const allCalendars = data.allCalendars?.length ? data.allCalendars : loadedCalendars;
    renderCalendarDebugTable(allCalendars);
    const effectiveId = selectedId || settings.calendarId || "primary";
    const { label: stateLabel, hint } = resolveCalendarSelectLabel(cal, data);
    if (data.usedFallback && (data.needsRelogin || data.httpStatus === 403 || data.httpStatus === 401)) {
      loadedCalendars = primaryFallbackCalendars();
      sel.innerHTML = `<option value="primary" selected>${escapeHtml(stateLabel)}</option>`;
    } else {
      sel.innerHTML = loadedCalendars
        .filter((c) => isWritableCal(c))
        .map((c) => {
          const label = calendarOptionLabel(c);
          const colorHint = c.backgroundColor ? ` (${c.backgroundColor})` : "";
          return `<option value="${escapeHtml(c.id)}" ${c.id === effectiveId ? "selected" : ""}>${escapeHtml(label)}${escapeHtml(colorHint)}</option>`;
        })
        .join("");
    }
    renderMultiCalendarList(loadedCalendars, settings.calendarIds || [effectiveId]);
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
    renderCalendarDebugTable([]);
  }
}

async function scheduleApi(path, opts = {}) {
  const token = getCustomerToken();
  const res = await fetch(`/api/schedule/v1${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiErrorMessage(data, res.status));
  return data;
}

async function loadScheduleOriginSettings() {
  try {
    const data = await scheduleApi("/settings");
    const input = $("default-origin-input");
    if (input) input.value = data.defaultOrigin || "";
    const display = $("default-origin-display");
    if (display) {
      display.textContent = data.defaultOriginDisplay
        ? `表示用: ${data.defaultOriginDisplay}`
        : "未設定（移動時間の起点は空欄のまま）";
    }
  } catch (e) {
    $("default-origin-display").textContent = e.message || "読み込み失敗";
  }
}

async function runIntelligenceDebug() {
  const date =
    $("intel-debug-date")?.value || new Date().toISOString().slice(0, 10);
  const out = $("intel-debug-output");
  try {
    const data = await scheduleApi(`/intelligence/debug?date=${encodeURIComponent(date)}`);
    $("intel-maps-configured").textContent = data.mapsApiConfigured ? "true" : "false";
    $("intel-maps-configured").className = data.mapsApiConfigured ? "ok" : "err";
    $("intel-default-origin").textContent =
      data.defaultOriginDisplay || data.defaultOriginLabel || data.defaultOrigin || "（未設定）";
    if (out) out.textContent = JSON.stringify(data, null, 2);
  } catch (e) {
    if (out) out.textContent = e.message || "デバッグ取得失敗";
  }
}

async function init() {
  await requireCustomerLogin(customerCodeFromPath());
  initPracticalNav({
    appId: "schedule_v1",
    appName: "Googleカレンダー",
    theme: "blue",
  });

  const today = new Date().toISOString().slice(0, 10);
  const intelDate = $("intel-debug-date");
  if (intelDate && !intelDate.value) intelDate.value = today;
  await loadScheduleOriginSettings();
  $("btn-save-origin")?.addEventListener("click", async () => {
    try {
      await scheduleApi("/settings", {
        method: "PATCH",
        body: JSON.stringify({ defaultOrigin: $("default-origin-input")?.value ?? "" }),
      });
      toast("通常出発地を保存しました");
      await loadScheduleOriginSettings();
    } catch (e) {
      toast(e.message || "保存に失敗しました");
    }
  });
  $("btn-intel-debug")?.addEventListener("click", () => runIntelligenceDebug());

  const params = new URLSearchParams(window.location.search);
  renderOAuthDebugFromParams(params);
  if (params.get("oauth") === "ok") {
    const refreshSaved = params.get("oauth_refresh_token_saved") === "true";
    toast(
      refreshSaved
        ? "Googleログインが完了しました（トークン保存済み）"
        : "Googleログインが完了しました（refresh_token 未取得 — 再ログインを推奨）"
    );
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
      const syncMode = getSelectedSyncMode();
      const calendarIds = getSelectedCalendarIds();
      const syncBody = {
        weeks: 8,
        selectedCalendarId: calendarId,
        syncMode,
        calendarIds,
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
      const calInfo = result.calendarIds?.length
        ? ` · 対象${result.calendarIds.length}カレンダー`
        : "";
      el.textContent = `同期完了（${count}件・${modeLabel}${calInfo}） — 送信${result.pushed}件 / 案件自動生成${result.projectsCreated}件`;
      toast(`同期完了 ${count}件`);
      await refreshStatus();
    } catch (e) {
      const details = e.details ?? {};
      const safeLog =
        details.googleErrorCode != null || details.httpStatus != null
          ? {
              googleErrorCode: details.googleErrorCode ?? null,
              googleErrorMessage: details.googleErrorMessage ?? null,
              httpStatus: details.httpStatus ?? null,
            }
          : null;
      const hint = details.errorHint ?? formatGoogleApiErrorHintFromLog(safeLog);
      const msg = hint || e.message || "同期に失敗しました";
      toast(msg);
      const safeEl = $("dev-safe-log");
      if (safeEl && safeLog) {
        safeEl.classList.remove("hidden");
        safeEl.textContent = [hint, formatSafeLogBlock(safeLog)].filter(Boolean).join("\n");
      }
      if (safeLog) {
        const errEl = $("dev-last-sync-error");
        if (errEl) {
          errEl.textContent = msg;
          errEl.className = "err";
        }
      }
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

  $("btn-test-event")?.addEventListener("click", async () => {
    const btn = $("btn-test-event");
    btn.disabled = true;
    btn.textContent = "テスト中…";
    try {
      const calendarId = $("calendar-select").value || "primary";
      const data = await api("/diagnostics/test-event", {
        method: "POST",
        body: JSON.stringify({ calendarId }),
      });
      renderTestEventResult(data);
      if (data.ok) {
        toast("OAuth書き込みテスト成功");
      } else {
        toast(data.testEvent?.error || data.googleApiError?.errorHint || "書き込みテスト失敗");
      }
      await refreshStatus();
    } catch (e) {
      toast(e.message || "テストに失敗しました");
    } finally {
      btn.textContent = "OAuth書き込みテスト";
      const canTest = statusData?.mode === "live" && statusData?.connected;
      btn.disabled = !canTest;
    }
  });

  document.querySelectorAll('input[name="sync-mode"]').forEach((el) => {
    el.addEventListener("change", () => {
      const settings = statusData?.settings || {};
      renderMultiCalendarList(loadedCalendars, settings.calendarIds || [$("calendar-select")?.value || "primary"]);
      const mode = getSelectedSyncMode();
      const sel = $("calendar-select");
      if (sel) sel.disabled = !statusData?.connected || mode === "primary_only" || mode === "all_writable";
    });
  });

  $("btn-sync-test")?.addEventListener("click", async () => {
    const btn = $("btn-sync-test");
    btn.disabled = true;
    btn.textContent = "テスト中…";
    try {
      const calendarId = $("calendar-select").value || "primary";
      const data = await api("/diagnostics/test-event", {
        method: "POST",
        body: JSON.stringify({ calendarId }),
      });
      renderTestEventResult(data);
      if (data.ok) {
        toast(`同期テスト成功（${calendarId}）— 作成後即削除済み`);
      } else {
        toast(data.testEvent?.error || "同期テスト失敗");
      }
      await refreshStatus();
    } catch (e) {
      toast(e.message || "同期テストに失敗しました");
    } finally {
      btn.textContent = "選択カレンダー同期テスト";
      btn.disabled = !(statusData?.mode === "live" && statusData?.connected);
    }
  });

  $("btn-save-settings")?.addEventListener("click", async () => {
    try {
      const calendarId = $("calendar-select").value || "primary";
      const syncMode = getSelectedSyncMode();
      const calendarIds = getSelectedCalendarIds();
      const picked = loadedCalendars.find((c) => c.id === calendarId);
      const calendarSummary =
        calendarId === "primary" ? "メインカレンダー" : calendarOptionLabel(picked);
      await api("/settings", {
        method: "PATCH",
        body: JSON.stringify({
          calendarId,
          calendarSummary,
          syncMode,
          calendarIds,
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
