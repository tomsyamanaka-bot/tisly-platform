/** 日程調整レベル4 — 予定カード・日次サマリー表示 */

import { escapeScheduleHtml, eventCalendarBadgeHtml } from "./schedule-event-ui.js";

export function formatEventTimeRange(ev) {
  if (ev.allDay) return "終日";
  const parts = [ev.startTime, ev.endTime].filter(Boolean);
  return parts.length ? parts.join("〜") : "";
}

export function renderWeatherSlotsHtml(slots, { inline = false } = {}) {
  if (!slots?.length) return "";
  const sep = inline ? " " : "<br>";
  return slots
    .map((slot) => {
      const rainCls = slot.highlightRain ? ' style="color:#b91c1c;font-weight:600;"' : "";
      return `<span class="weather-slot"${rainCls}>${slot.icon}${escapeScheduleHtml(slot.label)} ${slot.precipChance}% ${slot.tempC}℃</span>`;
    })
    .join(sep);
}

function travelDurationText(travel) {
  if (travel.durationLabel === "移動時間未計算" || travel.durationLabel === "移動時間API未設定") {
    return escapeScheduleHtml(travel.durationLabel);
  }
  return `<strong>${escapeScheduleHtml(travel.durationLabel)}</strong>`;
}

function renderTravelLineHtml(travel) {
  const route = escapeScheduleHtml(travel.compactLabel || travel.label || "移動");
  return `<div class="schedule-intel-travel">🚗 ${route} ${travelDurationText(travel)}</div>`;
}

function renderMaterialLineHtml(fieldCheck) {
  if (!fieldCheck?.total) return "";
  const label =
    fieldCheck.checked >= fieldCheck.total
      ? `🎒 材料チェック完了 ${fieldCheck.checked}/${fieldCheck.total}`
      : `🎒 材料チェック ${fieldCheck.checked}/${fieldCheck.total}`;
  if (fieldCheck.url) {
    return `<a class="schedule-intel-material" href="${escapeScheduleHtml(fieldCheck.url)}">${escapeScheduleHtml(label)}</a>`;
  }
  return `<div class="schedule-intel-material">${escapeScheduleHtml(label)}</div>`;
}

function renderNavIconHtml(mapsUrl) {
  if (!mapsUrl) {
    return `<span class="schedule-nav-icon-btn schedule-nav-icon-disabled" title="ナビ不可" aria-hidden="true">🧭</span>`;
  }
  return `<a class="schedule-nav-icon-btn" href="${escapeScheduleHtml(mapsUrl)}" target="_blank" rel="noopener" title="ナビ開始" aria-label="ナビ開始">🧭</a>`;
}

export function renderIntelligenceEventCard(evIntel, { catIcon, catLabel } = {}) {
  const ev = evIntel;
  const time = formatEventTimeRange(ev);
  const addr = ev.address?.displayAddress ?? "住所未設定";
  const travel = ev.travel ?? {};
  const weatherHtml = renderWeatherSlotsHtml(ev.weatherSlots, { inline: true });
  const calBadgeCompact = eventCalendarBadgeHtml(
    {
      calendarColor: ev.calendarColor,
      calendarSummary: ev.calendarSummary,
    },
    { compact: true }
  );
  const eventKey = escapeScheduleHtml(ev.eventId ?? ev.id ?? "");

  return `<article class="schedule-intel-card schedule-intel-card-compact" data-intel-event-id="${eventKey}">
    <button type="button" class="schedule-intel-summary" data-intel-toggle="1" aria-expanded="false" aria-label="予定の詳細を開く">
      ${time ? `<div class="schedule-intel-time">${escapeScheduleHtml(time)}</div>` : ""}
      <div class="schedule-intel-title">${escapeScheduleHtml(ev.title)}</div>
      ${calBadgeCompact}
      ${weatherHtml ? `<div class="schedule-intel-weather">${weatherHtml}</div>` : ""}
      ${renderTravelLineHtml(travel)}
      ${renderMaterialLineHtml(ev.fieldCheck)}
    </button>
    <div class="schedule-intel-details" hidden>
      <div class="schedule-intel-detail-row">
        <span class="schedule-intel-address-compact">📍 ${escapeScheduleHtml(addr)}</span>
        ${renderNavIconHtml(travel.mapsUrl)}
      </div>
    </div>
  </article>`;
}

export function bindIntelligenceEventCards(root) {
  root?.querySelectorAll("[data-intel-toggle]").forEach((btn) => {
    if (btn.dataset.intelBound === "1") return;
    btn.dataset.intelBound = "1";
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const card = btn.closest("[data-intel-event-id]");
      const details = card?.querySelector(".schedule-intel-details");
      if (!details) return;
      const expanded = btn.getAttribute("aria-expanded") === "true";
      const next = !expanded;
      btn.setAttribute("aria-expanded", next ? "true" : "false");
      btn.setAttribute("aria-label", next ? "予定の詳細を閉じる" : "予定の詳細を開く");
      details.hidden = !next;
      card?.classList.toggle("schedule-intel-expanded", next);
    });
  });
  root?.querySelectorAll(".schedule-intel-material, .schedule-nav-icon-btn").forEach((el) => {
    el.addEventListener("click", (ev) => ev.stopPropagation());
  });
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
