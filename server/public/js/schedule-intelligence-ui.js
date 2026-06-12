/** 日程調整レベル4 — 予定カード・日次サマリー表示 */

import { escapeScheduleHtml, eventCalendarBadgeHtml } from "./schedule-event-ui.js";

export function formatEventTimeRange(ev) {
  if (ev.allDay) return "終日";
  const parts = [ev.startTime, ev.endTime].filter(Boolean);
  return parts.length ? parts.join("〜") : "";
}

export function renderWeatherSlotsHtml(slots) {
  if (!slots?.length) return "";
  return slots
    .map((slot) => {
      const rainCls = slot.highlightRain ? ' style="color:#b91c1c;font-weight:600;"' : "";
      return `<span class="weather-slot"${rainCls}>${slot.icon} ${escapeScheduleHtml(slot.label)} ${slot.precipChance}% / ${slot.tempC}℃</span>`;
    })
    .join("<br>");
}

export function renderIntelligenceEventCard(evIntel, { catIcon, catLabel } = {}) {
  const ev = evIntel;
  const time = formatEventTimeRange(ev);
  const calBadge = eventCalendarBadgeHtml({
    calendarColor: ev.calendarColor,
    calendarSummary: ev.calendarSummary,
  });
  const addr = ev.address?.displayAddress ?? "住所未設定";
  const addrIcon = addr === "住所未設定" || addr === "住所未確定" ? "📍" : "📍";
  const travel = ev.travel ?? {};
  const travelText =
    travel.durationLabel === "移動時間未計算" || travel.durationLabel === "移動時間API未設定"
      ? `🚗 ${escapeScheduleHtml(travel.durationLabel)}`
      : `🚗 ${escapeScheduleHtml(travel.label || "移動")} ${escapeScheduleHtml(travel.durationLabel || "")}`;
  const mapsBtn = travel.mapsUrl
    ? `<a class="btn-sub btn-small" href="${escapeScheduleHtml(travel.mapsUrl)}" target="_blank" rel="noopener">🧭 Googleマップ</a>`
    : `<span class="section-hint" style="font-size:0.8rem;">🧭マップ不可</span>`;
  const weatherHtml = renderWeatherSlotsHtml(ev.weatherSlots);
  const indexLabel = ev.index != null ? `${ev.index}. ` : "";

  return `<article class="schedule-intel-card friendly-card" style="margin-bottom:0.65rem;padding:0.65rem 0.75rem;">
    <div class="schedule-intel-head" style="margin-bottom:0.35rem;">
      <strong>${indexLabel}${escapeScheduleHtml(ev.title)}</strong>
      ${time ? `<div class="section-hint" style="margin:0.15rem 0 0;">🕐 ${escapeScheduleHtml(time)}</div>` : ""}
      ${calBadge ? `<div style="margin-top:0.2rem;">${calBadge}</div>` : ""}
    </div>
    ${weatherHtml ? `<div class="schedule-intel-weather" style="font-size:0.85rem;margin:0.35rem 0;line-height:1.5;">${weatherHtml}</div>` : ""}
    <div class="schedule-intel-travel" style="font-size:0.85rem;margin:0.25rem 0;">${travelText}</div>
    <div class="schedule-intel-address" style="font-size:0.85rem;margin:0.25rem 0;">${addrIcon} ${escapeScheduleHtml(addr)}</div>
    <div class="schedule-intel-maps" style="margin-top:0.35rem;">${mapsBtn}</div>
  </article>`;
}

export function renderDayIntelligenceSummary(intelligence) {
  if (!intelligence) return "";
  const travel =
    intelligence.totalTravelMin != null
      ? `${intelligence.totalTravelMin}分`
      : intelligence.mapsApiConfigured
        ? "—"
        : "移動時間API未設定";
  const scheduled = `${intelligence.totalScheduledMin ?? 0}分`;
  const binding =
    intelligence.totalBindingMin != null
      ? `${intelligence.totalBindingMin}分`
      : "—";
  return `<section class="schedule-day-summary friendly-card" style="margin-top:0.75rem;padding:0.75rem;">
    <p class="section-label" style="margin:0 0 0.5rem;">📊 1日のまとめ</p>
    <div style="font-size:0.9rem;line-height:1.6;">
      <div>総移動時間：<strong>${escapeScheduleHtml(travel)}</strong></div>
      <div>総予定時間：<strong>${escapeScheduleHtml(scheduled)}</strong></div>
      <div>移動込み拘束時間：<strong>${escapeScheduleHtml(binding)}</strong></div>
      <div style="margin-top:0.35rem;">判定：${intelligence.feasibilityIcon} <strong>${escapeScheduleHtml(intelligence.feasibilityLabel)}</strong></div>
    </div>
  </section>`;
}

export function renderDayIntelligenceEvents(intelligence, opts = {}) {
  if (!intelligence?.events?.length) {
    return `<p class="section-hint">予定はありません</p>`;
  }
  return intelligence.events
    .map((ev) => renderIntelligenceEventCard(ev, opts))
    .join("");
}
