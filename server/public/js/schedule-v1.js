import {
  customerCodeFromPath,
  getCustomerToken,
  requireCustomerLogin,
} from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";
import { friendlyHttpError, renderFriendlyErrorHtml } from "./tisly-friendly-errors.js";

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

function toastError(err, status) {
  if (status === 401 || /unauthorized/i.test(String(err?.message || ""))) {
    toast("ログインが切れました。もう一度ログインしてください");
    return;
  }
  const f = friendlyHttpError(err?.message || err, status);
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
    const e = new Error(data.error || `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return data;
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
      return `<span class="weather-slot"${rainCls}>${slot.icon} ${slot.label} ${slot.precipChance}% ${slot.tempC}℃</span>`;
    })
    .join(" ");
  return `<div class="schedule-weather-mini">${lines}</div>`;
}

function dayCardClass(day) {
  if (day.unavailable) return "schedule-day-card unavailable";
  if (day.availability?.level === "busy" || day.availability?.level === "full") return "schedule-day-card busy";
  return "schedule-day-card";
}

function renderWeekDays(days) {
  $("week-days").innerHTML = days
    .map((day) => {
      const events = day.events
        .slice(0, 5)
        .map(
          (ev) =>
            `<li><span>${CAT_ICON[ev.category] || "📌"}</span><span>${escapeHtml(ev.title)}</span></li>`
        )
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

  $("week-days").querySelectorAll("[data-date]").forEach((card) => {
    const open = () => openDayDetailByDate(card.dataset.date);
    card.addEventListener("click", open);
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

async function loadWeek() {
  try {
    const data = await api(`/week?offset=${weekOffset}`);
    $("week-label").textContent = data.label;
    $("week-range").textContent = `${formatDateShort(data.startDate)}〜${formatDateShort(data.endDate)}`;
    renderSummary(data.summary);
    renderWeekDays(data.days);
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
        ? `<div class="dispatch-leg">↓ ${escapeHtml(leg.memo || "車")} ${leg.durationMin}分 <a href="${escapeHtml(leg.mapsUrl)}" target="_blank" rel="noopener">地図</a></div>`
        : "";
      return `${legHtml}<div class="dispatch-stop"><strong>${escapeHtml(s.time)}</strong> ${escapeHtml(s.title)}</div>`;
    })
    .join("");
  return `<div class="dispatch-block">
    <p class="section-label" style="margin-top:0.75rem;">🚐 配車表</p>
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
            `<p>${CAT_ICON[ev.category] || "📌"} <strong>${escapeHtml(CAT_LABEL[ev.category] || "")}</strong> — ${escapeHtml(ev.title)}</p>`
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

async function openDayDetailByDate(date) {
  if (!date) return;
  try {
    const detail = await api(`/day?date=${encodeURIComponent(date)}`);
    $("day-detail-title").textContent = `${formatDateShort(date)}（${detail.day.weekday}）`;
    $("day-detail-body").innerHTML = renderDayDetailBody(detail);
    $("day-detail").classList.remove("hidden");
    $("unavail-form").classList.add("hidden");
    bindDayDetailActions(detail.day);
  } catch (e) {
    toastError(e, e.status);
  }
}

function openUnavailForm(date) {
  $("unavail-date").value = date;
  $("unavail-form").classList.remove("hidden");
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

  showMode("week");
  await loadWeek();

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
