import {
  customerCodeFromPath,
  getCustomerToken,
  requireCustomerLogin,
} from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";
import { friendlyHttpError, renderFriendlyErrorHtml } from "./tisly-friendly-errors.js";
import { initDayEditModal, openDayEditModal } from "./schedule-day-edit-modal.js";
import {
  bindEventDescSnippets,
  formatEventTime,
  renderEventDescriptionHtml,
  renderEventLocationHtml,
  renderIntegrationBadges,
  escapeScheduleHtml,
  eventCalendarColorStyle,
  eventCalendarBadgeHtml,
} from "./schedule-event-ui.js";
import {
  bindDepartureAlertCards,
  bindDeparturePrepCards,
  initDepartureReminderClient,
  renderDepartureAlertCard,
  renderDeparturePrepHtml,
  startDepartureReminderPolling,
} from "./departure-reminder.js";

const API = "/api/schedule/v1";
const CAT_ICON = {
  construction: "🟫",
  office: "🟦",
  family: "🟩",
  urgent: "🟥",
};
const CAT_LABEL = {
  construction: "工事",
  office: "事務",
  family: "家族",
  urgent: "重要",
};

let practicalNav = null;
let weekOffset = 0;
let departuresById = {};
let todayDeparture = null;
let threeOffset = 0;
let monthYear = new Date().getFullYear();
let monthMonth = new Date().getMonth() + 1;
let currentMode = "week";

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

function apiErrorMessage(data, status) {
  if (data?.message) return data.message;
  if (data?.error) return data.error;
  return `HTTP ${status}`;
}

function toastError(err, status) {
  if (status === 401 || /unauthorized/i.test(String(err?.message || ""))) {
    toast("ログインが切れました。もう一度ログインしてください");
    return;
  }
  const msg = String(err?.message || "");
  if (msg && !/^bad request$/i.test(msg) && !/^http \d+$/i.test(msg)) {
    toast(msg);
    return;
  }
  const f = friendlyHttpError(msg || err, status);
  toast(`${f.title} — ${f.action}`);
}

async function api(path, opts = {}) {
  const token = getCustomerToken();
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  if (res.status === 204) return {};
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(apiErrorMessage(data, res.status));
    e.status = res.status;
    e.code = data.code;
    e.details = data.details;
    throw e;
  }
  return data;
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

function showSyncDebug(body) {
  const calendarId = body.selectedCalendarId || body.calendarId || "primary";
  const weekOffset = Number.isFinite(Number(body.weekOffset)) ? Number(body.weekOffset) : 0;
  const weeks = Math.max(1, Number(body.weeks) || 1);
  const dateFrom = body.dateFrom || body.startDate || mondayOfWeekOffset(weekOffset);
  const dateTo = body.dateTo || body.endDate || addDaysIso(dateFrom, weeks * 7 - 1);
  const syncDirection = body.syncDirection || "two_way";
  const lines = [
    `selectedCalendarId: ${body.selectedCalendarId ?? "(未指定)"}`,
    `calendarId: ${calendarId}`,
    `syncDirection: ${syncDirection}`,
    `weekOffset: ${weekOffset}`,
    `dateFrom: ${dateFrom}`,
    `dateTo: ${dateTo}`,
  ];
  const el = $("sync-debug-line");
  if (el) el.textContent = lines.join(" · ");
  toast(`同期送信: ${calendarId} / ${syncDirection} / ${dateFrom}〜${dateTo}`);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateShort(iso) {
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return `${m}/${d}`;
}

function showMode(mode) {
  currentMode = mode;
  $("view-week").classList.toggle("hidden", mode !== "week");
  $("view-three").classList.toggle("hidden", mode !== "three");
  $("view-month").classList.toggle("hidden", mode !== "month");
  $("mode-week").classList.toggle("active", mode === "week");
  $("mode-three").classList.toggle("active", mode === "three");
  $("mode-month").classList.toggle("active", mode === "month");
}

function renderSummary(summary) {
  if (!summary) return;
  $("week-summary").innerHTML = `
    <div class="schedule-summary-item"><strong>${summary.constructionCount}</strong>工事</div>
    <div class="schedule-summary-item"><strong>${summary.officeCount}</strong>事務</div>
    <div class="schedule-summary-item"><strong>${summary.familyCount}</strong>家族</div>
    <div class="schedule-summary-item"><strong>${summary.unavailableDays}</strong>現場不可</div>
    <div class="schedule-summary-item"><strong>${summary.freeDays}</strong>空き日</div>
    <div class="schedule-summary-item"><strong>${summary.totalEvents}</strong>総予定</div>`;
}

function renderWeatherMini(weather) {
  if (!weather?.slots?.length) return "";
  const lines = weather.slots
    .map((slot) => {
      const rainCls = slot.highlightRain ? ' style="color:#b91c1c;font-weight:600;"' : "";
      return `<span class="weather-slot"${rainCls}>${slot.icon}${slot.label} ${slot.precipChance}% ${slot.tempC}℃</span>`;
    })
    .join(" ");
  return `<div class="schedule-weather-mini">${lines}</div>`;
}

function dayCardClass(day) {
  if (day.unavailable) return "schedule-day-card unavailable";
  if (day.availability?.level === "busy" || day.availability?.level === "full") return "schedule-day-card busy";
  return "schedule-day-card";
}

function indexDepartures(days) {
  departuresById = {};
  const today = new Date().toISOString().slice(0, 10);
  todayDeparture = null;
  for (const day of days) {
    if (day.departure?.id) {
      departuresById[day.departure.id] = day.departure;
      if (day.date === today) todayDeparture = day.departure;
    }
  }
}

function renderWeekDays(days) {
  indexDepartures(days);
  $("week-days").innerHTML = days
    .map((day) => {
      const firstId = day.firstConstructionEventId;
      const events = day.events
        .slice(0, 5)
        .map((ev) => {
          const time = formatEventTime(ev);
          const timeHtml = time ? `<small class="event-time">${escapeHtml(time)}</small> ` : "";
          const loc = ev.location ? `<small> 📍${escapeHtml(ev.location)}</small>` : "";
          const departureHtml =
            day.departure && ev.id === firstId ? renderDeparturePrepHtml(day.departure) : "";
          const colorStyle = eventCalendarColorStyle(ev);
          const liStyle = colorStyle ? ` style="${colorStyle}"` : "";
          const calBadge = eventCalendarBadgeHtml(ev);
          return `<li class="${departureHtml ? "has-departure" : ""}"${liStyle}><span>${CAT_ICON[ev.category] || "📌"}</span><span>${calBadge}${timeHtml}<strong>${escapeHtml(ev.title)}</strong>${loc}${renderEventDescriptionHtml(ev.description, `${day.date}-${ev.id}`)}${renderEventLocationHtml(ev.location)}${departureHtml}</span></li>`;
        })
        .join("");
      const more = day.events.length > 5 ? `<li>他${day.events.length - 5}件</li>` : "";
      const unavail = day.unavailable
        ? `<span class="schedule-unavail-badge">🚫 現場不可</span>`
        : "";
      return `<article class="${dayCardClass(day)}" data-date="${day.date}" role="button" tabindex="0">
        <div class="schedule-day-head">
          <div>
            <div class="schedule-day-date">${formatDateShort(day.date)}（${day.weekday}）</div>
            <div class="section-hint" style="margin:0;">予定 ${day.eventCount} 件</div>
          </div>
          <div class="schedule-availability">
            <span class="stars">${escapeHtml(day.availability?.stars || "")}</span>
            <span>${escapeHtml(day.availability?.label || "")}</span>
          </div>
        </div>
        ${unavail}
        <ul class="schedule-event-list">${events}${more}</ul>
        <p class="section-hint" style="margin:0.35rem 0 0;font-size:0.82rem;">タップで詳細</p>
      </article>`;
    })
    .join("");

  bindEventDescSnippets($("week-days"));
  bindDeparturePrepCards($("week-days"), departuresById, {
    apiFetch: (path, opts) => api(path, opts),
    onSaved: async () => loadWeek(),
    toast,
  });
  $("week-days").querySelectorAll("[data-date]").forEach((card) => {
    const open = () => openDayDetailByDate(card.dataset.date);
    card.addEventListener("click", (ev) => {
      if (ev.target.closest(".event-desc-snippet, .event-map-btn")) return;
      open();
    });
    card.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        open();
      }
    });
  });
}

function renderThreeWeekBlocks(blocks) {
  $("three-blocks").innerHTML = blocks
    .map(
      (b) => `<section class="schedule-three-week-section">
        <h3>${escapeHtml(b.label)}</h3>
        <p style="margin:0 0 0.5rem;">🟫 工事 <strong>${b.constructionCount}</strong> 件 · 合計 ${b.totalEvents} 件</p>
        <div class="schedule-three-days">${(b.days || [])
          .map(
            (day) => `<button type="button" class="schedule-mini-day" data-date="${day.date}">
              <span class="schedule-mini-day-date">${formatDateShort(day.date)}（${day.weekday}）</span>
              <span>${escapeHtml(day.availability?.stars || "")} ${day.eventCount}件</span>
              ${day.unavailable ? '<span class="schedule-unavail-badge">不可</span>' : ""}
            </button>`
          )
          .join("")}</div>
      </section>`
    )
    .join("");
  $("three-blocks").querySelectorAll(".schedule-mini-day").forEach((btn) => {
    btn.addEventListener("click", () => openDayDetailByDate(btn.dataset.date));
  });
}

function refreshTodayDepartureAlert() {
  const mount = $("departure-alert-mount");
  if (!mount) return;
  if (!todayDeparture) {
    mount.classList.add("hidden");
    mount.innerHTML = "";
    return;
  }
  const html = renderDepartureAlertCard(todayDeparture);
  if (html) {
    mount.innerHTML = html;
    bindDepartureAlertCards(mount);
    mount.classList.remove("hidden");
  } else {
    mount.classList.add("hidden");
    mount.innerHTML = "";
  }
  startDepartureReminderPolling(todayDeparture, (path, opts) => api(path, opts));
}

async function loadWeek() {
  try {
    const data = await api(`/week?offset=${weekOffset}`);
    $("week-label").textContent = data.label;
    $("week-range").textContent = `${formatDateShort(data.startDate)}〜${formatDateShort(data.endDate)}`;
    renderSummary(data.summary);
    renderWeekDays(data.days);
    refreshTodayDepartureAlert();
  } catch (e) {
    $("week-days").innerHTML = `<div class="error-friendly">${renderFriendlyErrorHtml(e, e.status)}</div>`;
  }
}

async function loadThreeWeeks() {
  try {
    const data = await api(`/three-weeks?offset=${threeOffset}`);
    $("three-label").textContent = threeOffset === 0 ? "今から3週間" : `${threeOffset > 0 ? "+" : ""}${threeOffset}週`;
    renderThreeWeekBlocks(data.blocks || []);
  } catch (e) {
    $("three-blocks").innerHTML = `<div class="error-friendly">${renderFriendlyErrorHtml(e, e.status)}</div>`;
  }
}

function renderMonthGrid(view) {
  $("month-label").textContent = view.label;
  const cells = view.weeks
    .flat()
    .map((cell) => {
      const cls = [
        "schedule-month-cell",
        cell.isCurrentMonth ? "" : "outside",
        cell.unavailable ? "unavailable" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const cats = cell.categories
        .map((c) => `<div class="cat-line">${c.icon} ${escapeHtml(c.label)}${c.count > 1 ? `×${c.count}` : ""}</div>`)
        .join("");
      const extra = cell.extraCount > 0 ? `<div class="cat-line">他${cell.extraCount}件</div>` : "";
      const unavail = cell.unavailable ? `<div class="cat-line" style="color:#b91c1c;">🚫</div>` : "";
      return `<div class="${cls}" data-date="${cell.date}" data-in-month="${cell.isCurrentMonth ? "1" : "0"}" role="button" tabindex="0">
        <div class="day-num">${cell.dayOfMonth}</div>
        ${cats}${extra}${unavail}
      </div>`;
    })
    .join("");
  $("month-grid").innerHTML = cells;
  $("month-grid").querySelectorAll("[data-in-month='1']").forEach((cell) => {
    const open = () => openDayDetailByDate(cell.dataset.date);
    cell.addEventListener("click", open);
    cell.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        open();
      }
    });
  });
}

async function loadMonth() {
  try {
    const data = await api(`/month?year=${monthYear}&month=${monthMonth}`);
    renderMonthGrid(data);
  } catch (e) {
    $("month-grid").innerHTML = `<div class="error-friendly">${renderFriendlyErrorHtml(e, e.status)}</div>`;
  }
}

function renderDispatchBlock(dispatch) {
  if (!dispatch?.stops?.length) return "";
  const stops = dispatch.stops
    .map((s, i) => {
      const leg = dispatch.legs[i];
      const legHtml = leg
        ? `<div class="dispatch-leg">↓ ${leg.durationMin}分</div>`
        : "";
      const navBtn = s.navUrl
        ? `<a class="btn-sub btn-small" href="${escapeHtml(s.navUrl)}" target="_blank" rel="noopener">📍ナビ開始</a>`
        : "";
      return `${legHtml}<div class="dispatch-stop">
        <strong>${escapeHtml(s.time)}</strong> ${escapeHtml(s.title)}
        ${s.address ? `<br><small>${escapeHtml(s.address)}</small>` : ""}
        ${navBtn}
      </div>`;
    })
    .join("");
  return `<div class="dispatch-block">
    <p class="section-label" style="margin-top:0.75rem;">🚐 本日の配車</p>
    <p>${escapeHtml(dispatch.driver)} / ${escapeHtml(dispatch.vehicle)}</p>
    ${stops}
  </div>`;
}

function renderDayDetailBody(detail) {
  const day = detail.day;
  const events = day.events.length
    ? day.events
        .map(
          (ev) =>
            `<p>${CAT_ICON[ev.category] || "📌"} <strong>${escapeHtml(CAT_LABEL[ev.category] || "")}</strong> — ${escapeHtml(ev.title)}${renderEventDescSnippet(ev.description, `detail-${ev.id}`)}</p>`
        )
        .join("")
    : "<p>予定はありません</p>";

  const weatherHtml = renderWeatherMini(detail.weather);
  const locationLine = detail.weather?.location
    ? `<p class="section-hint" style="margin:0 0 0.35rem;">📍 ${escapeHtml(detail.weather.location)}</p>`
    : "";

  let unavailHtml = "";
  if (day.unavailable) {
    unavailHtml = `<p class="schedule-unavail-badge">🚫 現場不可: ${escapeHtml(day.unavailable.reason)}</p>
      <button type="button" class="btn-sub btn-small" id="btn-del-unavail" data-id="${day.unavailable.id}">現場不可を解除</button>`;
  } else {
    unavailHtml = `<button type="button" class="btn-sub btn-small" id="btn-set-unavail-detail" data-date="${day.date}">この日を現場不可にする</button>`;
  }

  return `
    ${locationLine}
    ${weatherHtml}
    <p>空き度: <strong>${escapeHtml(day.availability?.stars || "")}</strong> ${escapeHtml(day.availability?.label || "")}</p>
    <p class="section-label" style="margin:0.5rem 0 0.25rem;">📋 予定一覧</p>
    <div>${events}</div>
    ${renderDispatchBlock(detail.dispatch)}
    <div style="margin-top:0.75rem;">${unavailHtml}</div>`;
}

function bindDayDetailActions(day) {
  $("btn-del-unavail")?.addEventListener("click", async () => {
    const delBtn = $("btn-del-unavail");
    try {
      await api(`/unavailable/${delBtn.dataset.id}`, { method: "DELETE" });
      toast("現場不可を解除しました");
      $("day-detail").classList.add("hidden");
      await refreshCurrent();
    } catch (e) {
      toastError(e, e.status);
    }
  });
  $("btn-set-unavail-detail")?.addEventListener("click", () => {
    openUnavailForm(day.date);
  });
}

function openDayDetailByDate(date) {
  if (!date) return;
  openDayEditModal(date, {
    onSaved: () => {
      refreshCurrent().catch(() => {});
    },
  });
}

function openUnavailForm(date) {
  $("unavail-date").value = date;
  $("unavail-form").classList.remove("hidden");
}

async function fetchGoogleCalendarStatus() {
  const token = getCustomerToken();
  const res = await fetch("/api/google-calendar/status", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(apiErrorMessage(data, res.status));
    e.status = res.status;
    e.code = data.code;
    throw e;
  }
  return data;
}

function renderCalendarStatusLine(cal) {
  const lines = [`Googleカレンダー: ${cal.displayLabel}`];
  if (cal.displayStatus === "not_configured") {
    lines.push("VPS の .env に GOOGLE_CALENDAR_ENABLED と OAuth クライアント情報を設定してください");
  } else if (cal.displayStatus === "not_logged_in") {
    lines.push("「Googleログイン」ボタンから初回認証を行ってください");
  } else if (cal.displayStatus === "sync_failed" && cal.sync?.lastSyncError) {
    lines.push(cal.sync.lastSyncError);
  } else if (cal.sync?.lastSyncedAt) {
    const at = new Date(cal.sync.lastSyncedAt).toLocaleString("ja-JP");
    lines.push(`最終同期: ${at}（${cal.sync.eventCount ?? 0}件）`);
  } else if (cal.displayStatus === "logged_in") {
    lines.push("「Google予定を同期」でカレンダーを取得できます");
  } else if (!cal.configured || cal.mode === "mock") {
    lines.push("Googleカレンダー未設定 — 連携設定からログインしてください");
    if (Array.isArray(cal.missingEnv) && cal.missingEnv.length) {
      lines.push(`不足: ${cal.missingEnv.join(", ")}`);
    }
  }
  return lines.join(" — ");
}

async function refreshSyncStatus() {
  try {
    const [st, cal] = await Promise.all([api("/oauth/status"), fetchGoogleCalendarStatus()]);
    const mapsLabel = st.mapsIntegration?.label ?? "未設定";
    const mapsHint = st.mapsIntegration?.hint ?? "";
    const calLabel = cal.displayLabel ?? st.calendarIntegration?.label ?? "未設定";
    const badgeEl = $("integration-badges");
    if (badgeEl) {
      badgeEl.innerHTML = renderIntegrationBadges(calLabel, mapsLabel, mapsHint);
    }
    const el = $("sync-status");
    const btn = $("btn-sync-calendar");
    if (!el) return;
    el.textContent = renderCalendarStatusLine(cal);
    el.classList.toggle("sync-error", cal.displayStatus === "sync_failed");
    if (btn) {
      btn.textContent = cal.buttonLabel || "Google予定を同期";
      btn.disabled = Boolean(cal.buttonDisabled);
      if (cal.displayStatus === "not_configured") {
        btn.title = "Google Calendar のクライアントID等を .env に設定してください";
      } else if (cal.displayStatus === "not_logged_in") {
        btn.title = "Googleアカウントでログインしてカレンダー連携を完了します";
      } else {
        btn.title = "Googleカレンダーの予定を同期します";
      }
    }
  } catch {
    /* ignore */
  }
}

async function refreshCurrent() {
  if (currentMode === "week") await loadWeek();
  else if (currentMode === "three") await loadThreeWeeks();
  else await loadMonth();
}

async function init() {
  await requireCustomerLogin(customerCodeFromPath());
  practicalNav = initPracticalNav({
    appId: "schedule_v1",
    appName: "日程調整",
    theme: "orange",
  });
  practicalNav.setToast(toast);
  practicalNav.setBackVisible(false);

  let reasonPresets = [];
  try {
    const presetData = await api("/presets");
    reasonPresets = presetData.reasonPresets || [];
  } catch {
    reasonPresets = [];
  }
  initDayEditModal({
    api: Object.assign(
      (path, opts) => api(path, opts),
      { token: () => getCustomerToken() }
    ),
    toast,
    reasonPresets,
  });

  showMode("week");
  await loadWeek();
  await refreshSyncStatus();
  await initDepartureReminderClient({
    apiFetch: (path, opts) => api(path, opts),
    toast,
    departure: todayDeparture,
  });

  const oauth = new URLSearchParams(window.location.search).get("oauth");
  if (oauth === "ok") toast("Google連携が完了しました");

  $("btn-sync-calendar")?.addEventListener("click", async () => {
    const btn = $("btn-sync-calendar");
    if (btn.disabled) return;
    btn.disabled = true;
    const prevLabel = btn.textContent;
    btn.textContent = "処理中…";
    try {
      const cal = await fetchGoogleCalendarStatus();
      if (!cal.configured || cal.mode === "mock") {
        toast("Googleカレンダー未設定：設定画面でログインしてください");
        return;
      }
      if (cal.displayStatus === "not_logged_in" || !cal.connected) {
        window.location.href = "/auth/google";
        return;
      }
      btn.textContent = "同期中…";
      if (cal.needsRelogin || cal.scope?.needsReLogin) {
        toast("権限が不足しています。設定画面から再ログインしてください。");
        return;
      }
      const syncBody = {
        weeks: 1,
        weekOffset,
        syncDirection: "bidirectional",
        selectedCalendarId: cal.settings?.calendarId || "primary",
        timezone: "Asia/Tokyo",
      };
      showSyncDebug(syncBody);
      const result = await api("/sync/google", {
        method: "POST",
        body: JSON.stringify(syncBody),
      });
      if (result.mode !== "real") {
        toast("本番接続が必要です。Googleカレンダー設定からログインしてください。");
        return;
      }
      const modeLabel = result.modeLabel || (result.mode === "real" ? "Google" : result.mode);
      toast(`同期完了（${result.count}件・${modeLabel}）`);
      await refreshSyncStatus();
      await refreshCurrent();
    } catch (e) {
      if (e.status === 503 && String(e.message || "").includes("Googleカレンダー")) {
        toast(e.message || "Googleカレンダー未設定：設定画面でログインしてください");
      } else if (e.message) {
        toast(e.message);
      } else {
        toastError(e, e.status);
      }
      await refreshSyncStatus();
    } finally {
      const latest = await fetchGoogleCalendarStatus().catch(() => null);
      btn.disabled = Boolean(latest?.buttonDisabled);
      btn.textContent = latest?.buttonLabel || prevLabel || "Google予定を同期";
    }
  });

  $("mode-week").addEventListener("click", async () => {
    showMode("week");
    await loadWeek();
  });
  $("mode-three").addEventListener("click", async () => {
    showMode("three");
    await loadThreeWeeks();
  });
  $("mode-month").addEventListener("click", async () => {
    showMode("month");
    await loadMonth();
  });

  $("btn-prev-week").addEventListener("click", async () => {
    weekOffset -= 1;
    await loadWeek();
  });
  $("btn-next-week").addEventListener("click", async () => {
    weekOffset += 1;
    await loadWeek();
  });
  $("btn-this-week").addEventListener("click", async () => {
    weekOffset = 0;
    await loadWeek();
  });

  $("btn-prev-three").addEventListener("click", async () => {
    threeOffset -= 1;
    await loadThreeWeeks();
  });
  $("btn-next-three").addEventListener("click", async () => {
    threeOffset += 1;
    await loadThreeWeeks();
  });

  $("btn-prev-month").addEventListener("click", async () => {
    monthMonth -= 1;
    if (monthMonth < 1) {
      monthMonth = 12;
      monthYear -= 1;
    }
    await loadMonth();
  });
  $("btn-next-month").addEventListener("click", async () => {
    monthMonth += 1;
    if (monthMonth > 12) {
      monthMonth = 1;
      monthYear += 1;
    }
    await loadMonth();
  });

  $("btn-close-day").addEventListener("click", () => $("day-detail").classList.add("hidden"));
  $("btn-cancel-unavail").addEventListener("click", () => $("unavail-form").classList.add("hidden"));

  $("btn-save-unavail").addEventListener("click", async () => {
    const date = $("unavail-date").value;
    const reason = $("unavail-reason").value;
    if (!date || !reason) {
      toast("日付と理由を選んでください");
      return;
    }
    try {
      await api("/unavailable", {
        method: "POST",
        body: JSON.stringify({ date, reason }),
      });
      toast("現場不可を登録しました");
      $("unavail-form").classList.add("hidden");
      $("day-detail").classList.add("hidden");
      await refreshCurrent();
    } catch (e) {
      toastError(e, e.status);
    }
  });
}

init().catch((e) => {
  console.error(e);
  $("week-days").innerHTML = `<div class="error-friendly">${renderFriendlyErrorHtml(e, e.status)}</div>`;
});
