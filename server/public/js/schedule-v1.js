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
        ? `<span class="schedule-unavail-badge">現場不可 — ${escapeHtml(day.unavailable.reason)}</span>`
        : "";
      return `<article class="${dayCardClass(day)}" data-date="${day.date}">
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
        <button type="button" class="btn-sub" style="margin-top:0.5rem;width:100%;" data-set-unavail="${day.date}">この日を現場不可にする</button>
      </article>`;
    })
    .join("");

  $("week-days").querySelectorAll("[data-date]").forEach((card) => {
    card.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-set-unavail]")) return;
      openDayDetail(card.dataset.date, days.find((d) => d.date === card.dataset.date));
    });
  });
  $("week-days").querySelectorAll("[data-set-unavail]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      openUnavailForm(btn.dataset.setUnavail);
    });
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
    $("three-label").textContent = threeOffset === 0 ? "今から3週間" : `${threeOffset > 0 ? threeOffset : threeOffset}週`;
    $("three-blocks").innerHTML = data.blocks
      .map(
        (b) => `<div class="schedule-three-week-card">
          <h3>${escapeHtml(b.label)}</h3>
          <p style="margin:0;font-size:1.1rem;">🟫 工事 <strong>${b.constructionCount}</strong> 件</p>
          <p class="section-hint" style="margin:0.25rem 0 0;">合計 ${b.totalEvents} 件の予定</p>
        </div>`
      )
      .join("");
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
      const unavail = cell.unavailable ? `<div class="cat-line" style="color:#b91c1c;">🚫 現場不可</div>` : "";
      return `<div class="${cls}" data-date="${cell.date}" data-in-month="${cell.isCurrentMonth ? "1" : "0"}">
        <div class="day-num">${cell.dayOfMonth}</div>
        ${cats}${extra}${unavail}
      </div>`;
    })
    .join("");
  $("month-grid").innerHTML = cells;
  $("month-grid").querySelectorAll("[data-in-month='1']").forEach((cell) => {
    cell.addEventListener("click", () => openMonthDay(cell.dataset.date));
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

function openDayDetail(date, day) {
  if (!day) return;
  $("day-detail-title").textContent = `${formatDateShort(date)}（${day.weekday}）`;
  const events = day.events.length
    ? day.events
        .map((ev) => `<p>${CAT_ICON[ev.category] || "📌"} ${escapeHtml(CAT_LABEL[ev.category] || "")} — ${escapeHtml(ev.title)}</p>`)
        .join("")
    : "<p>予定はありません</p>";
  const unavail = day.unavailable
    ? `<p class="schedule-unavail-badge">現場不可: ${escapeHtml(day.unavailable.reason)}</p>
       <button type="button" class="btn-sub" id="btn-del-unavail" data-id="${day.unavailable.id}">現場不可を解除</button>`
    : "";
  $("day-detail-body").innerHTML = `
    <p>空き度: <strong>${escapeHtml(day.availability?.stars || "")}</strong> ${escapeHtml(day.availability?.label || "")}</p>
    ${unavail}
    <div>${events}</div>`;
  $("day-detail").classList.remove("hidden");
  const delBtn = $("btn-del-unavail");
  delBtn?.addEventListener("click", async () => {
    try {
      await api(`/unavailable/${delBtn.dataset.id}`, { method: "DELETE" });
      toast("現場不可を解除しました");
      $("day-detail").classList.add("hidden");
      await refreshCurrent();
    } catch (e) {
      toastError(e, e.status);
    }
  });
}

async function openMonthDay(date) {
  try {
    const data = await api(`/week?offset=0`);
    const day = data.days.find((d) => d.date === date);
    if (day) {
      openDayDetail(date, day);
      return;
    }
    const month = await api(`/month?year=${monthYear}&month=${monthMonth}`);
    const cell = month.weeks.flat().find((c) => c.date === date);
    $("day-detail-title").textContent = formatDateShort(date);
    const events = (cell?.events || [])
      .map((ev) => `<p>${CAT_ICON[ev.category] || "📌"} ${escapeHtml(ev.title)}</p>`)
      .join("") || "<p>予定はありません</p>";
    $("day-detail-body").innerHTML = events;
    $("day-detail").classList.remove("hidden");
  } catch (e) {
    toastError(e, e.status);
  }
}

function openUnavailForm(date) {
  $("unavail-date").value = date;
  $("unavail-form").classList.remove("hidden");
  $("day-detail").classList.add("hidden");
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
