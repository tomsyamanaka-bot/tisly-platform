import {
  customerCodeFromPath,
  getCustomerToken,
  requireCustomerLogin,
} from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";
import { friendlyHttpError } from "./tisly-friendly-errors.js";
import {
  initDayEditModal,
  openDayEditModal,
  renderDayMemoSummary,
} from "./schedule-day-edit-modal.js";
import {
  bindEventDescSnippets,
  renderScheduleEventLine,
  renderTravelBlocksHtml,
  renderIntegrationBadges,
  renderNavIconButton,
} from "./schedule-event-ui.js";
import {
  bindDepartureAlertCards,
  bindDeparturePrepCards,
  initDepartureReminderClient,
  renderDepartureAlertCard,
  renderDeparturePrepHtml,
} from "./departure-reminder.js";
import {
  bindWorkSessionPanels,
  renderWorkSessionPanel,
} from "./work-session-ui.js";
import {
  bindIntelligenceEventCards,
  renderDayIntelligenceEvents,
  renderDayIntelligenceSummary,
  renderWeatherSlotsHtml,
} from "./schedule-intelligence-ui.js";

const API = "/api/schedule/v1";
const WORK_API = "/api/work-session/v1";
const CAT_ICON = { construction: "🟫", office: "🟦", family: "🟩", urgent: "🟥" };
const CAT_LABEL = { construction: "工事", office: "事務", family: "家族", urgent: "重要" };

const $ = (id) => document.getElementById(id);

let currentDate = "";
let reasonPresets = [];
let lastDetail = null;
let currentDeparture = null;

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
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

function dateFromQuery() {
  const p = new URLSearchParams(window.location.search);
  return p.get("date")?.slice(0, 10) ?? "";
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
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

function renderWeather(weather) {
  const el = $("day-weather");
  if (!el) return;
  const html = renderWeatherSlotsHtml(weather?.slots, { inline: false, practical: true });
  if (!html) {
    el.innerHTML = "";
    el.classList.add("hidden");
    return;
  }
  el.classList.remove("hidden");
  el.innerHTML = html;
}

function renderDepartureSection(detail) {
  const el = $("day-departure");
  if (!el) return;
  currentDeparture = detail.departure ?? null;
  if (!currentDeparture) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  el.classList.remove("hidden");
  el.innerHTML = renderDeparturePrepHtml(currentDeparture);
  bindDeparturePrepCards(el, { [currentDeparture.id]: currentDeparture }, {
    apiFetch: (path, opts) => api(path, opts),
    onSaved: async (saved) => {
      currentDeparture = saved;
      if (lastDetail) {
        lastDetail.departure = saved;
        renderDepartureSection(lastDetail);
      }
    },
    toast,
  });
}

function enrichIntelligenceWithDeparture(intelligence, departure, firstEventId) {
  if (!intelligence?.events?.length) return intelligence;
  const idx = intelligence.events.findIndex((ev) => ev.eventId === firstEventId);
  const targetIdx = idx >= 0 ? idx : 0;
  const progress = departure?.fieldCheckProgress ?? { checked: 0, total: 0 };
  const fallbackUrl = departure?.fieldCheckUrl ?? null;
  const events = intelligence.events.map((item, i) => {
    if (item.fieldCheck?.url) return item;
    if (i !== targetIdx || !fallbackUrl) return item;
    return {
      ...item,
      fieldCheck: {
        checked: progress.checked,
        total: progress.total,
        url: fallbackUrl,
      },
    };
  });
  return { ...intelligence, events };
}

function renderEvents(day, intelligence, departure) {
  const el = $("day-events");
  const intel = enrichIntelligenceWithDeparture(
    intelligence,
    departure,
    day.firstConstructionEventId
  );
  if (intel?.events?.length) {
    el.innerHTML = renderDayIntelligenceEvents(intel, {
      catIcon: CAT_ICON,
      catLabel: CAT_LABEL,
    });
    bindIntelligenceEventCards(el);
    return;
  }
  const events = day.events.length
    ? day.events
        .map((ev) => {
          const time = ev.allDay
            ? "終日"
            : [ev.startTime, ev.endTime].filter(Boolean).join("〜");
          return `<article class="schedule-intel-card schedule-intel-card-compact">
            <div class="schedule-intel-summary schedule-intel-practical">
              ${time ? `<div class="schedule-intel-time">${escapeHtml(time)}</div>` : ""}
              <div class="schedule-intel-title">${escapeHtml(ev.title)}</div>
            </div>
          </article>`;
        })
        .join("")
    : "<p class='section-hint'>予定はありません</p>";
  el.innerHTML = events;
}

function renderIntelligenceSummary(intelligence) {
  const el = $("day-intelligence-summary");
  if (!el) return;
  el.innerHTML = intelligence ? renderDayIntelligenceSummary(intelligence) : "";
}

function renderDepartureAlert(detail) {
  const mount = $("departure-alert-mount");
  if (!mount) return;
  const html = renderDepartureAlertCard(detail.departure);
  if (html) {
    mount.innerHTML = html;
    bindDepartureAlertCards(mount);
    mount.classList.remove("hidden");
  } else {
    mount.classList.add("hidden");
    mount.innerHTML = "";
  }
}

function renderTravel(detail) {
  const el = $("day-travel");
  if (!el) return;
  if (detail.intelligence?.events?.length) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  const html = renderTravelBlocksHtml(detail.travelBlocks, detail.mapsIntegration);
  if (!html) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  el.classList.remove("hidden");
  el.innerHTML = html;
}

function renderMemoSummary(detail) {
  const el = $("day-memo-summary");
  if (!el) return;
  el.classList.add("hidden");
  el.innerHTML = "";
}

function renderSiteWorkSessions(detail) {
  const el = $("day-work-sessions");
  if (!el) return;
  el.classList.add("hidden");
  el.innerHTML = "";
}

async function workApi(path, opts = {}) {
  const token = getCustomerToken();
  const res = await fetch(`${WORK_API}${path.replace(WORK_API, "")}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

function renderDispatch(dispatch) {
  $("day-dispatch").classList.add("hidden");
  $("day-dispatch").innerHTML = "";
}

function openEditForCurrentDate() {
  if (!currentDate) return;
  openDayEditModal(currentDate, {
    showDetailLink: false,
    onSaved: async () => {
      if (currentDate) await loadDay(currentDate);
    },
  });
}

function bindMemoSummaryOpen() {
  const el = $("day-memo-summary");
  const title = $("day-title");
  const open = () => openEditForCurrentDate();
  el?.addEventListener("click", open);
  el?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      open();
    }
  });
  title?.addEventListener("click", open);
}

async function loadDay(date) {
  currentDate = date;
  const detail = await api(`/day?date=${encodeURIComponent(date)}`);
  lastDetail = detail;
  $("day-title").textContent = `${formatDateShort(date)}（${detail.day.weekday}）`;
  renderWeather(detail.weather);
  renderDepartureAlert(detail);
  renderMemoSummary(detail);
  renderDepartureSection(detail);
  renderEvents(detail.day, detail.intelligence, detail.departure);
  renderIntelligenceSummary(detail.intelligence);
  renderTravel(detail);
  renderDispatch(detail.dispatch);
  renderSiteWorkSessions(detail);
  await initDepartureReminderClient({
    apiFetch: (path, opts) => api(path, opts),
    toast,
    departure: detail.departure,
  });
  const maps = $("day-maps");
  if (maps) maps.style.display = "none";
}

async function loadReasonPresets() {
  try {
    const data = await api("/presets");
    reasonPresets = data.reasonPresets || [];
  } catch {
    reasonPresets = [];
  }
}

async function init() {
  await requireCustomerLogin(customerCodeFromPath());
  await loadReasonPresets();
  initDayEditModal({
    api: Object.assign((path, opts) => api(path, opts), { token: () => getCustomerToken() }),
    toast,
    reasonPresets,
  });
  bindMemoSummaryOpen();

  const nav = initPracticalNav({
    appId: "schedule_v1",
    appName: "日程詳細",
    theme: "orange",
    onBack: () => {
      window.location.href = "/schedule-v1";
    },
  });
  nav.setToast(toast);

  const date = dateFromQuery();
  if (!date) {
    toast("日付が指定されていません");
    return;
  }
  try {
    const status = await api("/oauth/status");
    const badgeEl = $("integration-badges");
    if (badgeEl) {
      badgeEl.innerHTML = "";
      badgeEl.classList.add("hidden");
    }
    await loadDay(date);
    if (new URLSearchParams(window.location.search).get("edit") === "1") {
      openEditForCurrentDate();
    }
  } catch (e) {
    toast(friendlyHttpError(e.message, e.status).title);
  }
}

init().catch(console.error);
