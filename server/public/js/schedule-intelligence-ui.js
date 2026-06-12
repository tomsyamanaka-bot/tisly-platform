/** 日程調整レベル4 — 予定カード・日次サマリー表示 */

import { escapeScheduleHtml, eventCalendarBadgeHtml } from "./schedule-event-ui.js";

export function formatEventTimeRange(ev) {
  if (ev.allDay) return "終日";
  const parts = [ev.startTime, ev.endTime].filter(Boolean);
  return parts.length ? parts.join("〜") : "";
}

export function renderWeatherSlotsHtml(slots, { inline = false } = {}) {
  if (!slots?.length) return "";
  const sep = inline ? " · " : "<br>";
  return slots
    .map((slot) => {
      const rainCls = slot.highlightRain ? ' style="color:#b91c1c;font-weight:600;"' : "";
      return `<span class="weather-slot"${rainCls}>${slot.icon}${escapeScheduleHtml(slot.label)} ${slot.precipChance}% ${slot.tempC}℃</span>`;
    })
    .join(sep);
}

export function renderIntelligenceEventCard(evIntel, { catIcon, catLabel } = {}) {
  const ev = evIntel;
  const time = formatEventTimeRange(ev);
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
  const weatherHtml = renderWeatherSlotsHtml(ev.weatherSlots, { inline: true });
  const indexLabel = ev.index != null ? `${ev.index}. ` : "";
  const summaryParts = [weatherHtml, travelText].filter(Boolean).join(" · ");
  const calBadgeCompact = eventCalendarBadgeHtml({
    calendarColor: ev.calendarColor,
    calendarSummary: ev.calendarSummary,
  }, { compact: true });

  return `<article class="schedule-intel-card schedule-intel-card-compact friendly-card">
    <div class="schedule-intel-head-compact">
      ${time ? `<div class="schedule-intel-time">${escapeScheduleHtml(time)}</div>` : ""}
      <div class="schedule-intel-title">${indexLabel}${escapeScheduleHtml(ev.title)}</div>
      ${calBadgeCompact}
    </div>
    ${summaryParts ? `<div class="schedule-intel-summary-line">${summaryParts}</div>` : ""}
    <div class="schedule-intel-address-compact">${addrIcon} ${escapeScheduleHtml(addr)}</div>
    <div class="schedule-intel-maps-compact">${mapsBtn}</div>
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
  return `<section class="schedule-day-summary schedule-day-summary-compact friendly-card">
    <p class="section-label schedule-day-summary-label">📊 1日のまとめ</p>
    <div class="schedule-day-summary-body">
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
