import {
  customerCodeFromPath,
  getCustomerToken,
  requireCustomerLogin,
} from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";
import { friendlyHttpError } from "./tisly-friendly-errors.js";

const API = "/api/schedule/v1";
const CAT_ICON = { construction: "🟫", office: "🟦", family: "🟩", urgent: "🟥" };
const CAT_LABEL = { construction: "工事", office: "事務", family: "家族", urgent: "重要" };

const $ = (id) => document.getElementById(id);

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
          return `<p>${CAT_ICON[ev.category] || "📌"} <strong>${escapeHtml(CAT_LABEL[ev.category] || "")}</strong>
            ${time ? `<span style="opacity:0.8;"> ${escapeHtml(time)}</span>` : ""}
            — ${escapeHtml(ev.title)}${loc}</p>`;
        })
        .join("")
    : "<p>予定はありません</p>";
  $("day-events").innerHTML = `<p class="section-label">📋 予定一覧</p>${events}`;
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

function renderUnavail(day) {
  if (day.unavailable) {
    $("day-unavail").innerHTML = `
      <p class="schedule-unavail-badge">🚫 現場不可: ${escapeHtml(day.unavailable.reason)}</p>
      <button type="button" class="btn-sub btn-small" id="btn-del-unavail" data-id="${day.unavailable.id}">現場不可を解除</button>`;
    $("btn-del-unavail")?.addEventListener("click", async () => {
      try {
        await api(`/unavailable/${day.unavailable.id}`, { method: "DELETE" });
        toast("現場不可を解除しました");
        await loadDay(day.date);
      } catch (e) {
        toast(friendlyHttpError(e.message, e.status).title);
      }
    });
  } else {
    $("day-unavail").innerHTML = `
      <p class="section-label">現場不可設定</p>
      <button type="button" class="btn-sub btn-small" id="btn-set-unavail">この日を現場不可にする</button>`;
    $("btn-set-unavail")?.addEventListener("click", async () => {
      try {
        await api("/unavailable", {
          method: "POST",
          body: JSON.stringify({ date: day.date, reason: "事務処理" }),
        });
        toast("現場不可を登録しました");
        await loadDay(day.date);
      } catch (e) {
        toast(friendlyHttpError(e.message, e.status).title);
      }
    });
  }
}

async function loadDay(date) {
  const detail = await api(`/day?date=${encodeURIComponent(date)}`);
  $("day-title").textContent = `${formatDateShort(date)}（${detail.day.weekday}）`;
  renderWeather(detail.weather);
  renderEvents(detail.day);
  renderDispatch(detail.dispatch);
  renderUnavail(detail.day);
  if (detail.memo) {
    $("day-memo").classList.remove("hidden");
    $("day-memo").innerHTML = `<p class="section-label">📝 メモ</p><p>${escapeHtml(detail.memo)}</p>`;
  } else {
    $("day-memo").classList.add("hidden");
  }
  const maps = $("day-maps");
  if (detail.mapsUrl) {
    maps.href = detail.mapsUrl;
    maps.style.display = "block";
  } else {
    maps.style.display = "none";
  }
}

async function init() {
  await requireCustomerLogin(customerCodeFromPath());
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
  } catch (e) {
    toast(friendlyHttpError(e.message, e.status).title);
  }
}

init().catch(console.error);
