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

const MAPS_API_UNSET_LABEL = "Google Maps API\u672a\u8a2d\u5b9a";
const ADDRESS_UNSET_LABEL = "\u4f4f\u6240\u672a\u8a2d\u5b9a";
const TRAVEL_UNCALCULATED_LABEL = "\u79fb\u52d5\u6642\u9593\u672a\u8a08\u7b97";

function renderTravelLineHtml(
  travel,
  { showMapsUnsetBanner = false, mapsApiConfigured = true } = {}
) {
  if (mapsApiConfigured === false) {
    if (!showMapsUnsetBanner) return "";
    return `<div class="schedule-intel-maps-unset">${escapeScheduleHtml(MAPS_API_UNSET_LABEL)}</div>`;
  }
  const label = travel.durationLabel ?? "";
  const route = escapeScheduleHtml(travel.compactLabel || "🏠→現場");
  if (label === ADDRESS_UNSET_LABEL) {
    return `<div class="schedule-intel-travel">${route} <span class="schedule-intel-travel-muted">${escapeScheduleHtml(ADDRESS_UNSET_LABEL)}</span></div>`;
  }
  const uncalculated = !label || label === TRAVEL_UNCALCULATED_LABEL;
  if (uncalculated) {
    if (!travel.mapsUrl) {
      return `<div class="schedule-intel-travel">${route} <span class="schedule-intel-travel-muted">${escapeScheduleHtml(TRAVEL_UNCALCULATED_LABEL)}</span></div>`;
    }
    return `<div class="schedule-intel-travel">${route} <span class="schedule-intel-travel-muted">${escapeScheduleHtml(TRAVEL_UNCALCULATED_LABEL)}</span></div>`;
  }
  return `<div class="schedule-intel-travel">${route} <strong>${escapeScheduleHtml(label)}</strong></div>`;
}

function renderMaterialLineHtml(fieldCheck) {
  if (!fieldCheck?.url) return "";
  const label =
    fieldCheck.total > 0
      ? `🎒 ${fieldCheck.checked}/${fieldCheck.total}`
      : "🎒 材料チェックを開く";
  return `<a class="btn-sub btn-small schedule-intel-material" href="${escapeScheduleHtml(fieldCheck.url)}">${escapeScheduleHtml(label)}</a>`;
}

function needsAddressInput(evIntel) {
  return !evIntel?.address?.fullAddress;
}

function renderAddressInputButton(evIntel) {
  if (!needsAddressInput(evIntel)) return "";
  const eventKey = escapeScheduleHtml(evIntel.eventId ?? evIntel.id ?? "");
  return `<button type="button" class="btn-sub btn-small schedule-intel-address-btn" data-event-id="${eventKey}">住所を入力</button>`;
}

export function renderIntelligenceEventCard(
  evIntel,
  { catIcon, catLabel, showMapsUnsetBanner = false, mapsApiConfigured = true } = {}
) {
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
      ${renderTravelLineHtml(travel, { showMapsUnsetBanner, mapsApiConfigured })}
      ${renderAddressInputButton(ev)}
      ${renderMaterialLineHtml(ev.fieldCheck)}
    </div>
  </article>`;
}

export function bindIntelligenceEventCards(root) {
  root?.querySelectorAll(".schedule-intel-material").forEach((el) => {
    el.addEventListener("click", (ev) => ev.stopPropagation());
  });
}

export function bindAddressInputButtons(root, { apiFetch, toast, onSaved } = {}) {
  if (!root || !apiFetch) return;
  root.querySelectorAll(".schedule-intel-address-btn").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const eventId = btn.getAttribute("data-event-id");
      if (!eventId) return;
      const current = btn.dataset.currentAddress || "";
      const input = window.prompt("現場の住所を入力してください", current);
      if (input == null) return;
      const address = input.trim();
      if (!address) {
        toast?.("住所を入力してください");
        return;
      }
      btn.disabled = true;
      try {
        await apiFetch(`/events/${encodeURIComponent(eventId)}/address`, {
          method: "PATCH",
          body: JSON.stringify({ address }),
        });
        toast?.("住所を保存しました");
        await onSaved?.();
      } catch (e) {
        toast?.(e.message || "保存に失敗しました");
      } finally {
        btn.disabled = false;
      }
    });
  });
}

export function renderDayIntelligenceSummary(intelligence) {
  return "";
}

export function renderDayIntelligenceEvents(intelligence, opts = {}) {
  if (!intelligence?.events?.length) {
    return `<p class="section-hint">予定はありません</p>`;
  }
  const mapsUnset = intelligence.mapsApiConfigured === false;
  let mapsUnsetShown = false;
  return intelligence.events
    .map((ev) => {
      const showMapsUnsetBanner = mapsUnset && !mapsUnsetShown;
      if (showMapsUnsetBanner) mapsUnsetShown = true;
      return renderIntelligenceEventCard(ev, {
        ...opts,
        showMapsUnsetBanner,
        mapsApiConfigured: intelligence.mapsApiConfigured !== false,
      });
    })
    .join("");
}
