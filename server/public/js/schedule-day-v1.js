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

const API = "/api/schedule/v1";
const CAT_ICON = { construction: "🟫", office: "🟦", family: "🟩", urgent: "🟥" };
const CAT_LABEL = { construction: "工事", office: "事務", family: "家族", urgent: "重要" };

const $ = (id) => document.getElementById(id);

let currentDate = "";
let reasonPresets = [];
let lastDetail = null;

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

function renderEventDescription(description, eventKey) {
  if (!description?.trim()) return "";
  const text = description.trim();
  const lines = text.split(/\n/).filter(Boolean);
  const preview = lines.slice(0, 2).join(" ").slice(0, 80);
  const truncated = preview.length < text.replace(/\n/g, " ").length;
  const label = truncated ? "メモ" : "説明";
  return `<br><button type="button" class="event-desc-snippet" data-desc-key="${escapeHtml(eventKey)}" data-desc-full="${escapeHtml(text)}" aria-expanded="false">${label}: ${escapeHtml(preview)}${truncated ? "…" : ""}</button>`;
}

function bindEventDescSnippets(root) {
  root?.querySelectorAll(".event-desc-snippet").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const full = btn.dataset.descFull || "";
      const expanded = btn.getAttribute("aria-expanded") === "true";
      if (expanded) {
        const lines = full.split(/\n/).filter(Boolean);
        const preview = lines.slice(0, 2).join(" ").slice(0, 80);
        const truncated = preview.length < full.replace(/\n/g, " ").length;
        btn.innerHTML = `${truncated ? "メモ" : "説明"}: ${escapeHtml(preview)}${truncated ? "…" : ""}`;
        btn.setAttribute("aria-expanded", "false");
        return;
      }
      btn.innerHTML = `説明: ${escapeHtml(full).replace(/\n/g, "<br>")}`;
      btn.setAttribute("aria-expanded", "true");
    });
  });
}

function renderWeather(weather) {
  if (!weather?.slots?.length) {
    $("day-weather").innerHTML = "";
    return;
  }
  $("day-weather").innerHTML = weather.slots
    .map((slot) => {
      const rainCls = slot.highlightRain ? ' style="color:#b91c1c;font-weight:600;"' : "";
      return `<span class="weather-slot"${rainCls}>${slot.icon}${slot.label} ${slot.precipChance}% ${slot.tempC}℃</span>`;
    })
    .join(" ");
}

function renderEvents(day) {
  const events = day.events.length
    ? day.events
        .map((ev) => {
          const time =
            ev.allDay ? "終日" : [ev.startTime, ev.endTime].filter(Boolean).join("〜") || "";
          const loc = ev.location ? `<br><small>📍 ${escapeHtml(ev.location)}</small>` : "";
          const desc = renderEventDescription(ev.description, ev.id);
          return `<p>${CAT_ICON[ev.category] || "📌"} <strong>${escapeHtml(CAT_LABEL[ev.category] || "")}</strong>
            ${time ? `<span style="opacity:0.8;"> ${escapeHtml(time)}</span>` : ""}
            — ${escapeHtml(ev.title)}${loc}${desc}</p>`;
        })
        .join("")
    : "<p>予定はありません</p>";
  $("day-events").innerHTML = `<p class="section-label">📋 予定一覧</p>${events}`;
  bindEventDescSnippets($("day-events"));
}

function renderMemoSummary(detail) {
  const el = $("day-memo-summary");
  if (!el) return;
  el.innerHTML = `
    <p class="section-label" style="margin:0 0 0.35rem;">📝 日付メモ・現場不可・備考</p>
    ${renderDayMemoSummary({
      memo: detail.memo,
      eventRemark: detail.eventRemark,
      unavailable: detail.day.unavailable,
    })}
    <p class="section-hint" style="margin:0.5rem 0 0;font-size:0.82rem;">タップして編集</p>`;
}

function renderDispatch(dispatch) {
  if (!dispatch?.stops?.length) {
    $("day-dispatch").classList.add("hidden");
    return;
  }
  $("day-dispatch").classList.remove("hidden");
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
  $("day-dispatch").innerHTML = `
    <p class="section-label">🚐 本日の配車</p>
    <p>${escapeHtml(dispatch.driver)} / ${escapeHtml(dispatch.vehicle)}</p>
    ${stops}`;
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
  renderMemoSummary(detail);
  renderEvents(detail.day);
  renderDispatch(detail.dispatch);
  const maps = $("day-maps");
  if (detail.mapsUrl) {
    maps.href = detail.mapsUrl;
    maps.style.display = "block";
  } else {
    maps.style.display = "none";
  }
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
    await loadDay(date);
    if (new URLSearchParams(window.location.search).get("edit") === "1") {
      openEditForCurrentDate();
    }
  } catch (e) {
    toast(friendlyHttpError(e.message, e.status).title);
  }
}

init().catch(console.error);
