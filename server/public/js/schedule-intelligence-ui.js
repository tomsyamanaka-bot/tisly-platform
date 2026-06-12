/** 日程調整レベル4 — 予定カード・日次サマリー表示 */

import { escapeScheduleHtml } from "./schedule-event-ui.js";

export function formatEventTimeRange(ev) {
  if (ev.allDay) return "終日";
  const parts = [ev.startTime, ev.endTime].filter(Boolean);
  return parts.length ? parts.join("〜") : "";
}

export function renderWeatherSlotsHtml(slots, { inline = false, practical = false } = {}) {
  if (!slots?.length) return "";
  const sep = inline ? " " : "<br>";
  return slots
    .map((slot) => {
      if (practical) {
        return `<span class="weather-slot">${slot.icon}${escapeScheduleHtml(slot.label)}</span>`;
      }
      const rainCls = slot.highlightRain ? ' style="color:#b91c1c;font-weight:600;"' : "";
      return `<span class="weather-slot"${rainCls}>${slot.icon}${escapeScheduleHtml(slot.label)} ${slot.precipChance}% ${slot.tempC}℃</span>`;
    })
    .join(sep);
}

function renderTravelLineHtml(travel) {
  const dur =
    travel.durationLabel === "移動時間未計算" || travel.durationLabel === "移動時間API未設定"
      ? escapeScheduleHtml(travel.durationLabel)
      : `<strong>${escapeScheduleHtml(travel.durationLabel)}</strong>`;
  return `<div class="schedule-intel-travel">🚗所要時間 ${dur}</div>`;
}

function renderMaterialLineHtml(fieldCheck) {
  if (!fieldCheck?.url) return "";
  const label =
    fieldCheck.total > 0
      ? `🎒 ${fieldCheck.checked}/${fieldCheck.total}`
      : "🎒 材料チェックを開く";
  return `<a class="schedule-intel-material" href="${escapeScheduleHtml(fieldCheck.url)}">${escapeScheduleHtml(label)}</a>`;
}

export function renderIntelligenceEventCard(evIntel, { catIcon, catLabel } = {}) {
  const ev = evIntel;
  const time = formatEventTimeRange(ev);
  const travel = ev.travel ?? {};
  const weatherHtml = renderWeatherSlotsHtml(ev.weatherSlots, { inline: true, practical: true });
  const eventKey = escapeScheduleHtml(ev.eventId ?? ev.id ?? "");

  return `<article class="schedule-intel-card schedule-intel-card-compact" data-intel-event-id="${eventKey}">
    <div class="schedule-intel-summary schedule-intel-practical">
      ${time ? `<div class="schedule-intel-time">${escapeScheduleHtml(time)}</div>` : ""}
      <div class="schedule-intel-title">${escapeScheduleHtml(ev.title)}</div>
      ${weatherHtml ? `<div class="schedule-intel-weather">${weatherHtml}</div>` : ""}
      ${renderTravelLineHtml(travel)}
      ${renderMaterialLineHtml(ev.fieldCheck)}
    </div>
  </article>`;
}

export function bindIntelligenceEventCards(root) {
  root?.querySelectorAll(".schedule-intel-material").forEach((el) => {
    el.addEventListener("click", (ev) => ev.stopPropagation());
  });
}

export function renderDayIntelligenceSummary(intelligence) {
  return "";
}

export function renderDayIntelligenceEvents(intelligence, opts = {}) {
  if (!intelligence?.events?.length) {
    return `<p class="section-hint">予定はありません</p>`;
  }
  return intelligence.events
    .map((ev) => renderIntelligenceEventCard(ev, opts))
    .join("");
}
