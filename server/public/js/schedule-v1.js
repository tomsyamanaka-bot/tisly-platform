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
  renderIntegrationBadges,
  escapeScheduleHtml,
  renderWeekEventItemHtml,
  renderNavIconButton,
} from "./schedule-event-ui.js";
import {
  bindDepartureAlertCards,
  bindDeparturePrepCards,
  initDepartureReminderClient,
  renderDepartureAlertCard,
  renderDeparturePrepHtml,
  startDepartureReminderPolling,
} from "./departure-reminder.js";
import {
  bindAddressInputButtons,
  bindIntelligenceEventCards,
  enrichIntelligenceWithDeparture,
  renderBaseWeatherHtml,
  renderWeekIntelligenceEventItemHtml,
} from "./schedule-intelligence-ui.js";
import {
  createLoadWatchdog,
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchJson,
} from "./tisly-fetch-v1.js";
import { cacheGet, cacheMeta, cacheSet } from "./tisly-data-cache-v1.js";

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

const SYNC_DUPLICATE_ERROR_UI =
  "Googleカレンダー同期に失敗しました。予定の重複保存エラーです。再同期してください。";

function formatSyncErrorForUi(err) {
  const detail =
    err.details?.detailLog ||
    err.details?.googleErrorMessage ||
    err.message ||
    "";
  console.error("[schedule-sync]", detail, err.details ?? {});
  const msg = err.message || detail || "同期に失敗しました";
  if (/UNIQUE constraint|重複保存|schedule_calendar_events/i.test(`${msg} ${detail}`)) {
    return SYNC_DUPLICATE_ERROR_UI;
  }
  return msg;
}

function formatSyncTimestampJa(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${h}:${min}`;
}

function syncCountsFrom(cal, result) {
  const sync = cal?.sync ?? {};
  const fetched =
    result?.fetched ??
    sync.lastSyncFetched ??
    sync.eventCount ??
    result?.count ??
    0;
  const updated = result?.updated ?? sync.lastSyncUpdated ?? 0;
  const created = result?.created ?? sync.lastSyncCreated ?? 0;
  const skipped = result?.skipped ?? sync.lastSyncSkipped ?? 0;
  return { fetched, updated, created, skipped };
}

function formatSyncErrorText(err) {
  return formatSyncErrorForUi(err);
}

function buildSyncDetailText(cal, lastSyncBody) {
  const sync = cal?.sync ?? {};
  const lines = [];
  const counts = syncCountsFrom(cal, lastSyncBody);
  if (counts.created || counts.skipped) {
    lines.push(`作成 ${counts.created}件 · スキップ ${counts.skipped}件`);
  }
  if (sync.rangeStart && sync.rangeEnd) {
    lines.push(`同期範囲: ${sync.rangeStart}〜${sync.rangeEnd}`);
  }
  if (lastSyncBody) {
    const calendarId = lastSyncBody.selectedCalendarId || lastSyncBody.calendarId || "primary";
    const dateFrom = lastSyncBody.dateFrom || lastSyncBody.startDate;
    const dateTo = lastSyncBody.dateTo || lastSyncBody.endDate;
    lines.push(
      `送信: ${calendarId} / ${lastSyncBody.syncDirection || "bidirectional"} / ${dateFrom}〜${dateTo}`
    );
  }
  const safeLog = sync.lastSyncSafeLog;
  if (safeLog && typeof safeLog === "object") {
    const hint = safeLog.hint || safeLog.summary;
    if (hint) lines.push(String(hint));
  }
  return lines.join("\n");
}

function buildSyncStatusView(cal, { lastError, lastSyncBody } = {}) {
  const sync = cal?.sync ?? {};
  const summaryLines = [];
  let detailText = "";
  let detailToggleLabel = "詳細";
  let showToggle = false;
  let cardClass = "";

  if (cal.displayStatus === "sync_failed") {
    cardClass = "sync-error-state";
    summaryLines.push("Googleカレンダー：同期失敗");
    const err =
      lastError ||
      (sync.lastSyncError
        ? /UNIQUE constraint|重複保存|schedule_calendar_events/i.test(sync.lastSyncError)
          ? SYNC_DUPLICATE_ERROR_UI
          : sync.lastSyncError
        : "同期に失敗しました");
    detailText = err;
    detailToggleLabel = "詳細を見る";
    showToggle = Boolean(detailText);
  } else if (cal.displayStatus === "sync_success") {
    cardClass = "sync-success-state";
    summaryLines.push("Googleカレンダー：同期成功");
    if (sync.lastSyncedAt) {
      summaryLines.push(`最終同期：${formatSyncTimestampJa(sync.lastSyncedAt)}`);
    }
    const counts = syncCountsFrom(cal, lastSyncBody);
    summaryLines.push(`取得：${counts.fetched}件　更新：${counts.updated}件`);
    detailText = buildSyncDetailText(cal, lastSyncBody);
    showToggle = Boolean(detailText);
  } else if (cal.displayStatus === "not_configured") {
    summaryLines.push("Googleカレンダー：未設定");
    summaryLines.push("連携画面または .env で OAuth を設定してください");
  } else if (cal.displayStatus === "not_logged_in") {
    summaryLines.push("Googleカレンダー：未ログイン");
    summaryLines.push("連携画面から Google ログインしてください");
  } else if (cal.displayStatus === "logged_in") {
    summaryLines.push("Googleカレンダー：ログイン済み");
    summaryLines.push("「Google予定を同期」で予定を取得できます");
  } else if (!cal.configured || cal.mode === "mock") {
    summaryLines.push("Googleカレンダー：未設定");
    summaryLines.push("連携設定からログインしてください");
    if (Array.isArray(cal.missingEnv) && cal.missingEnv.length) {
      detailText = `不足: ${cal.missingEnv.join(", ")}`;
      showToggle = true;
    }
  } else {
    summaryLines.push(`Googleカレンダー：${cal.displayLabel || "—"}`);
  }

  return { summaryLines, detailText, detailToggleLabel, showToggle, cardClass };
}

let lastSyncRequestBody = null;
let initWatchdog = null;

function scheduleErrorHtml(err, status) {
  const code = err?.code || "";
  const st = status ?? err?.status ?? 0;
  const msg = String(err?.message || "");
  if (st === 401 || /unauthorized|ログイン/i.test(msg)) {
    return `<strong>ログイン期限切れ</strong>もう一度ログインしてください。<br><small>→ App Hub（/app）からログインし直してください。</small>`;
  }
  if (code === "timeout" || /timeout|タイムアウト/i.test(msg)) {
    return `<strong>予定取得がタイムアウトしました</strong>サーバー応答がありません（${Math.round(DEFAULT_FETCH_TIMEOUT_MS / 1000)}秒）。<br><small>→ 電波を確認して「再読み込み」をお試しください。</small>`;
  }
  if (code === "network_error" || /通信に失敗|load failed|failed to fetch/i.test(msg)) {
    return `<strong>予定取得に失敗しました</strong>通信できませんでした。電波またはWi-Fiを確認してください。<br><small>→ 接続が戻ったらページを再読み込みしてください。</small>`;
  }
  if (st === 503 && /google|カレンダー/i.test(msg)) {
    return `<strong>Google同期未設定</strong>Googleカレンダー連携が完了していません。<br><small>→ 「連携」からログインしてください。</small>`;
  }
  if (st >= 500) {
    return `<strong>予定取得失敗（サーバーエラー）</strong>しばらくしてからもう一度お試しください。<br><small>→ 続く場合は担当者に連絡してください。</small>`;
  }
  return renderFriendlyErrorHtml(err, st);
}

function showScheduleOfflineBanner(savedAt) {
  const card = $("sync-status-card");
  const summaryEl = $("sync-status-summary");
  if (!card || !summaryEl) return;
  card.classList.remove("hidden");
  card.classList.add("sync-error-state");
  const when = savedAt
    ? new Date(savedAt).toLocaleString("ja-JP", { timeZone: SCHEDULE_TZ })
    : "—";
  summaryEl.innerHTML = `<p class="schedule-sync-line"><strong>オフライン表示</strong></p><p class="schedule-sync-line">前回保存した予定を表示しています（${escapeHtml(when)}）</p>`;
}

function clearScheduleOfflineBanner() {
  /* refreshSyncStatus が上書きする */
}

function renderSyncStatusCard(cal, { lastError, expandDetail = false } = {}) {
  const card = $("sync-status-card");
  const summaryEl = $("sync-status-summary");
  const detailEl = $("sync-status-detail");
  const toggleBtn = $("btn-sync-detail-toggle");
  if (!card || !summaryEl) return;

  const view = buildSyncStatusView(cal, {
    lastError,
    lastSyncBody: lastSyncRequestBody,
  });
  if (!view.summaryLines.length) {
    card.classList.add("hidden");
    return;
  }

  card.classList.remove("hidden", "sync-error-state", "sync-success-state");
  if (view.cardClass) card.classList.add(view.cardClass);

  summaryEl.innerHTML = view.summaryLines
    .map((line) => `<p class="schedule-sync-line">${escapeHtml(line)}</p>`)
    .join("");

  if (detailEl) {
    detailEl.textContent = view.detailText || "";
    const showDetail = expandDetail && view.detailText;
    detailEl.classList.toggle("hidden", !showDetail);
    detailEl.setAttribute("aria-hidden", showDetail ? "false" : "true");
  }

  if (toggleBtn) {
    if (view.showToggle && view.detailText) {
      toggleBtn.classList.remove("hidden");
      toggleBtn.textContent = expandDetail ? "詳細を閉じる" : view.detailToggleLabel;
      toggleBtn.setAttribute("aria-expanded", expandDetail ? "true" : "false");
    } else {
      toggleBtn.classList.add("hidden");
      toggleBtn.setAttribute("aria-expanded", "false");
    }
  }
}

function bindSyncDetailToggle() {
  const toggleBtn = $("btn-sync-detail-toggle");
  if (!toggleBtn || toggleBtn.dataset.bound) return;
  toggleBtn.dataset.bound = "1";
  toggleBtn.addEventListener("click", () => {
    const detailEl = $("sync-status-detail");
    const expanded = detailEl?.classList.contains("hidden");
    detailEl?.classList.toggle("hidden", !expanded);
    detailEl?.setAttribute("aria-hidden", expanded ? "false" : "true");
    toggleBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
    toggleBtn.textContent = expanded
      ? "詳細を閉じる"
      : toggleBtn.dataset.defaultLabel || "詳細";
  });
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
  const label = opts.label || "日程API";
  const data = await fetchJson(
    `${API}${path}`,
    {
      ...opts,
      label,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    },
    opts.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS
  );
  return data;
}

const SCHEDULE_TZ = "Asia/Tokyo";

function addDaysIso(iso, n) {
  const d = new Date(`${iso}T12:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: SCHEDULE_TZ });
}

function scheduleWindowStartFromOffset(offset = 0) {
  const safe = Math.max(0, Math.trunc(offset));
  return addDaysIso(todayIso(), safe * 7);
}

function daysBetweenIso(fromIso, toIso) {
  const from = new Date(`${fromIso}T12:00:00+09:00`);
  const to = new Date(`${toIso}T12:00:00+09:00`);
  return Math.round((to - from) / 86400000);
}

function weekOffsetFromDateParam(dateParam) {
  if (!dateParam) return 0;
  const today = todayIso();
  if (dateParam < today) return 0;
  return Math.floor(daysBetweenIso(today, dateParam) / 7);
}

function showSyncDebug(body) {
  lastSyncRequestBody = body;
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
  $("week-summary").innerHTML = "";
  $("week-summary").classList.add("hidden");
}

function renderWeatherMini(weather) {
  return renderBaseWeatherHtml(weather);
}

function dayCardClass(day) {
  if (day.unavailable) return "schedule-day-card unavailable";
  if (day.availability?.level === "busy" || day.availability?.level === "full") return "schedule-day-card busy";
  return "schedule-day-card";
}

function indexDepartures(days, today = todayIso()) {
  departuresById = {};
  todayDeparture = null;
  for (const day of days) {
    if (day.departure?.id) {
      departuresById[day.departure.id] = day.departure;
      if (day.date === today) todayDeparture = day.departure;
    }
  }
}

function updateWeekNavState(offset) {
  const prevBtn = $("btn-prev-week");
  const todayBtn = $("btn-this-week");
  if (prevBtn) {
    prevBtn.disabled = offset <= 0;
    prevBtn.style.visibility = offset <= 0 ? "hidden" : "visible";
  }
  if (todayBtn) {
    todayBtn.classList.toggle("hidden", offset <= 0);
  }
}

function renderWeekDays(days, today = todayIso()) {
  indexDepartures(days, today);
  $("week-days").innerHTML = days
    .map((day) => {
      const isToday = day.date === today;
      const todayBadge = isToday ? '<span class="schedule-today-badge">今日</span>' : "";
      const firstId = day.firstConstructionEventId;
      const intel = enrichIntelligenceWithDeparture(
        day.intelligence,
        day.departure,
        firstId
      );
      const intelByEventId = new Map(
        (intel?.events ?? []).map((ev) => [ev.eventId, ev])
      );
      const events = day.events
        .slice(0, 5)
        .map((ev) => {
          const departureHtml =
            day.departure && ev.id === firstId ? renderDeparturePrepHtml(day.departure) : "";
          const evIntel = intelByEventId.get(ev.id);
          if (evIntel && intel) {
            return renderWeekIntelligenceEventItemHtml(evIntel, intel, { departureHtml });
          }
          const itemHtml = renderWeekEventItemHtml(ev, {
            dayDate: day.date,
            catIcon: CAT_ICON,
            previewLen: 48,
            practical: true,
          });
          if (!departureHtml) return itemHtml;
          return itemHtml.replace(
            "</li>",
            `<div class="schedule-event-departure">${departureHtml}</div></li>`
          );
        })
        .join("");
      const more = day.events.length > 5 ? `<li>他${day.events.length - 5}件</li>` : "";
      const unavail = day.unavailable
        ? `<span class="schedule-unavail-badge">🚫 現場不可</span>`
        : "";
      const weatherHtml = renderWeatherMini(day.weather);
      const todayCls = isToday ? " schedule-day-today" : "";
      return `<article class="${dayCardClass(day)} schedule-day-compact${todayCls}" data-date="${day.date}" role="button" tabindex="0">
        <div class="schedule-day-head schedule-day-head-compact">
          <div class="schedule-day-head-main">
            <span class="schedule-day-date">${formatDateShort(day.date)}（${day.weekday}）${todayBadge}</span>
            ${weatherHtml}
            <span class="schedule-day-count">予定${day.eventCount}件</span>
          </div>
        </div>
        ${unavail}
        <ul class="schedule-event-list schedule-event-list-compact">${events}${more}</ul>
      </article>`;
    })
    .join("");

  bindEventDescSnippets($("week-days"));
  bindIntelligenceEventCards($("week-days"));
  bindAddressInputButtons($("week-days"));
  bindDeparturePrepCards($("week-days"), departuresById, {
    apiFetch: (path, opts) => api(path, opts),
    onSaved: async () => loadWeek(),
    toast,
  });
  $("week-days").querySelectorAll("[data-date]").forEach((card) => {
    const open = () => openDayDetailByDate(card.dataset.date);
    card.addEventListener("click", (ev) => {
      if (
        ev.target.closest(
          ".event-desc-snippet, .event-map-btn, .event-map-link, .departure-prep-card, .departure-kit-btn, [data-departure-edit], [data-departure-toggle], .schedule-intel-material, .schedule-intel-address-btn, .schedule-intel-address-unset, .schedule-intel-travel-link, .travel-block-link"
        )
      ) {
        return;
      }
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
            (day) => {
              const weatherHtml = renderWeatherMini(day.weather);
              return `<button type="button" class="schedule-mini-day" data-date="${day.date}">
              <span class="schedule-mini-day-date">${formatDateShort(day.date)}（${day.weekday}）</span>
              ${weatherHtml}
              <span>${day.eventCount}件</span>
              ${day.unavailable ? '<span class="schedule-unavail-badge">不可</span>' : ""}
            </button>`;
            }
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
  const cacheKey = `week:${weekOffset}`;
  try {
    const data = await api(`/week?offset=${weekOffset}`, { label: "週間予定" });
    cacheSet("schedule", cacheKey, data);
    const today = data.today || todayIso();
    $("week-label").textContent = data.label;
    $("week-range").textContent = `${formatDateShort(data.startDate)}〜${formatDateShort(data.endDate)}`;
    renderSummary(data.summary);
    renderWeekDays(data.days, today);
    updateWeekNavState(data.offset ?? weekOffset);
    refreshTodayDepartureAlert();
    clearScheduleOfflineBanner();
  } catch (e) {
    const cached = cacheGet("schedule", cacheKey);
    if (cached?.days?.length) {
      const meta = cacheMeta("schedule", cacheKey);
      showScheduleOfflineBanner(meta?.savedAt);
      const today = cached.today || todayIso();
      $("week-label").textContent = cached.label || "週間（保存済み）";
      $("week-range").textContent = cached.startDate
        ? `${formatDateShort(cached.startDate)}〜${formatDateShort(cached.endDate)}`
        : "";
      renderSummary(cached.summary);
      renderWeekDays(cached.days, today);
      updateWeekNavState(cached.offset ?? weekOffset);
      refreshTodayDepartureAlert();
      return;
    }
    $("week-days").innerHTML = `<div class="error-friendly">${scheduleErrorHtml(e, e.status)}</div>`;
  }
}

async function loadThreeWeeks() {
  const cacheKey = `three:${threeOffset}`;
  try {
    const data = await api(`/three-weeks?offset=${threeOffset}`, { label: "3週間予定" });
    cacheSet("schedule", cacheKey, data);
    $("three-label").textContent = threeOffset === 0 ? "今から3週間" : `${threeOffset > 0 ? "+" : ""}${threeOffset}週`;
    renderThreeWeekBlocks(data.blocks || []);
  } catch (e) {
    const cached = cacheGet("schedule", cacheKey);
    if (cached?.blocks?.length) {
      showScheduleOfflineBanner(cacheMeta("schedule", cacheKey)?.savedAt);
      $("three-label").textContent = "3週間（保存済み）";
      renderThreeWeekBlocks(cached.blocks);
      return;
    }
    $("three-blocks").innerHTML = `<div class="error-friendly">${scheduleErrorHtml(e, e.status)}</div>`;
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
  const cacheKey = `month:${monthYear}-${monthMonth}`;
  try {
    const data = await api(`/month?year=${monthYear}&month=${monthMonth}`, { label: "月間予定" });
    cacheSet("schedule", cacheKey, data);
    renderMonthGrid(data);
  } catch (e) {
    const cached = cacheGet("schedule", cacheKey);
    if (cached?.weeks?.length) {
      showScheduleOfflineBanner(cacheMeta("schedule", cacheKey)?.savedAt);
      renderMonthGrid(cached);
      return;
    }
    $("month-grid").innerHTML = `<div class="error-friendly">${scheduleErrorHtml(e, e.status)}</div>`;
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
      const navBtn = renderNavIconButton(s.navUrl);
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
  window.location.href = `/schedule-v1/day?date=${encodeURIComponent(date)}`;
}

function openUnavailForm(date) {
  $("unavail-date").value = date;
  $("unavail-form").classList.remove("hidden");
}

async function fetchGoogleCalendarStatus() {
  const token = getCustomerToken();
  return fetchJson(
    "/api/google-calendar/status",
    {
      headers: { Authorization: `Bearer ${token}` },
      label: "Googleカレンダー状態",
    },
    DEFAULT_FETCH_TIMEOUT_MS
  );
}

function renderCalendarStatusLine(cal) {
  return buildSyncStatusView(cal, { lastSyncBody: lastSyncRequestBody }).summaryLines.join("\n");
}

async function refreshSyncStatus(options = {}) {
  try {
    const [st, cal] = await Promise.all([api("/oauth/status"), fetchGoogleCalendarStatus()]);
    const mapsLabel = st.mapsIntegration?.label ?? "未設定";
    const mapsHint = st.mapsIntegration?.hint ?? "";
    const calLabel = cal.displayLabel ?? st.calendarIntegration?.label ?? "未設定";
    const badgeEl = $("integration-badges");
    if (badgeEl) {
      badgeEl.innerHTML = renderIntegrationBadges(calLabel, mapsLabel, mapsHint);
    }
    const btn = $("btn-sync-calendar");
    renderSyncStatusCard(cal, options);
    const toggleBtn = $("btn-sync-detail-toggle");
    if (toggleBtn) {
      toggleBtn.dataset.defaultLabel =
        cal.displayStatus === "sync_failed" ? "詳細を見る" : "詳細";
    }
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
  initWatchdog = createLoadWatchdog(DEFAULT_FETCH_TIMEOUT_MS, () => {
    if ($("week-days") && !$("week-days").innerHTML.trim()) {
      $("week-days").innerHTML = `<div class="error-friendly">${scheduleErrorHtml({ code: "timeout", message: "init timeout" })}</div>`;
    }
  });

  try {
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
      const presetData = await api("/presets", { label: "プリセット" });
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

    const urlDate = new URLSearchParams(window.location.search).get("date")?.slice(0, 10) ?? "";
    weekOffset = weekOffsetFromDateParam(urlDate);

    showMode("week");
    bindSyncDetailToggle();
    await loadWeek();
    await refreshSyncStatus();
    await initDepartureReminderClient({
      apiFetch: (path, opts) => api(path, opts),
      toast,
      departure: todayDeparture,
    });

    const oauth = new URLSearchParams(window.location.search).get("oauth");
    if (oauth === "ok") toast("Google連携が完了しました");
  } finally {
    initWatchdog?.clear();
  }

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
      const dateFrom = scheduleWindowStartFromOffset(weekOffset);
      const dateTo = addDaysIso(dateFrom, 6);
      const syncBody = {
        weeks: 1,
        weekOffset,
        startDate: dateFrom,
        endDate: dateTo,
        dateFrom,
        dateTo,
        syncDirection: "bidirectional",
        selectedCalendarId: cal.settings?.calendarId || "primary",
        timezone: SCHEDULE_TZ,
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
      toast("同期しました");
      const calAfter = await fetchGoogleCalendarStatus().catch(() => cal);
      renderSyncStatusCard(
        {
          ...calAfter,
          displayStatus: "sync_success",
          displayLabel: "同期成功",
          sync: {
            ...(calAfter?.sync ?? {}),
            lastSyncedAt: result.lastSyncedAt || result.sync?.lastSyncedAt || calAfter?.sync?.lastSyncedAt,
            lastSyncFetched: result.fetched ?? calAfter?.sync?.lastSyncFetched,
            lastSyncUpdated: result.updated ?? calAfter?.sync?.lastSyncUpdated,
            lastSyncCreated: result.created ?? calAfter?.sync?.lastSyncCreated,
            lastSyncSkipped: result.skipped ?? calAfter?.sync?.lastSyncSkipped,
            lastSyncStatus: "success",
          },
        },
        { expandDetail: false }
      );
      await refreshSyncStatus();
      await refreshCurrent();
    } catch (e) {
      if (e.status === 503 && String(e.message || "").includes("Googleカレンダー")) {
        toast(e.message || "Googleカレンダー未設定：設定画面でログインしてください");
      } else {
        const errText = formatSyncErrorText(e);
        const calFail = await fetchGoogleCalendarStatus().catch(() => null);
        renderSyncStatusCard(
          calFail || { displayStatus: "sync_failed", displayLabel: "同期失敗", sync: {} },
          { lastError: errText, expandDetail: false }
        );
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
    if (weekOffset <= 0) return;
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
  initWatchdog?.clear();
  $("week-days").innerHTML = `<div class="error-friendly">${scheduleErrorHtml(e, e.status)}</div>`;
});
