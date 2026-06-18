import { initPracticalNav } from "./tisly-practical-nav.js";
import {
  getCustomerToken,
  requireCustomerLogin,
  customerCodeFromPath,
} from "./customer-auth.js";

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

  $("btn-login").disabled = cal.connected && cal.mode === "live";
  $("btn-sync").disabled = !cal.connected || cal.mode !== "live";
  $("btn-save").disabled = !cal.connected;
  $("btn-match-google").disabled = !cal.connected;

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

async function init() {
  await requireCustomerLogin(customerCodeFromPath());
  initPracticalNav({
    appId: "google_calendar_settings_v2",
    appName: "Google同期対象",
    theme: "blue",
  });

  await refresh();

  $("btn-login")?.addEventListener("click", async () => {
    const auth = await api("/auth/start");
    if (auth.url) window.location.href = auth.url;
    else toast("Google連携未設定");
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
      const el = $("sync-result");
      if (el) {
        el.classList.remove("hidden");
        el.textContent = `同期成功 — 取得 ${result.fetched ?? result.pulled ?? 0}件 / カレンダー ${(result.calendarIds || []).length}件`;
      }
      toast("同期しました");
      await refresh();
    } catch (e) {
      toast(e.message || "同期失敗");
    } finally {
      btn.disabled = !statusData?.connected;
      btn.textContent = "今すぐ同期";
    }
  });
}

init().catch((e) => toast(e.message || "初期化失敗"));
