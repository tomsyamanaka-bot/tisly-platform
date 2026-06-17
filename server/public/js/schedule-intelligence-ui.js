/** 日程調整レベル4 — 予定カード・日次サマリー表示 */

import { escapeScheduleHtml } from "./schedule-event-ui.js";

export function formatEventTimeRange(ev) {
  if (ev.allDay) return "終日";
  const parts = [ev.startTime, ev.endTime].filter(Boolean);
  return parts.length ? parts.join("〜") : "";
}

export function renderWeatherSlotsHtml(slots, { inline = false, practical = false, precipOnly = false } = {}) {
  if (!slots?.length) return "";
  const sep = inline ? " " : "<br>";
  return slots
    .map((slot) => {
      if (practical && !precipOnly) {
        return `<span class="weather-slot">${slot.icon}${escapeScheduleHtml(slot.label)}</span>`;
      }
      const rainCls = slot.highlightRain ? ' style="color:#b91c1c;font-weight:600;"' : "";
      const suffix = precipOnly
        ? ` ${slot.precipChance}%`
        : ` ${slot.precipChance}% ${slot.tempC}℃`;
      return `<span class="weather-slot"${rainCls}>${slot.icon}${escapeScheduleHtml(slot.label)}${suffix}</span>`;
    })
    .join(sep);
}

/** 日付カード上部 — 🏠基準地天気 */
export function renderBaseWeatherHtml(weather) {
  const label = `<div class="weather-block-label">🏠基準地天気</div>`;
  if (weather?.status === "fetch_failed" || !weather?.slots?.length) {
    return `<div class="schedule-weather-mini weather-block">${label}<div class="weather-block-status">取得失敗</div></div>`;
  }
  const slotsHtml = renderWeatherSlotsHtml(weather.slots, { precipOnly: true, inline: false });
  return `<div class="schedule-weather-mini weather-block">${label}${slotsHtml}</div>`;
}

/** 予定カード — 📍現場天気 */
export function renderSiteWeatherHtml(evIntel) {
  const status =
    evIntel?.weatherStatus ??
    (evIntel?.weatherSlots?.length ? "ok" : "address_unset");
  const label = `<div class="weather-block-label">📍現場天気</div>`;
  if (status === "address_unset") {
    return `<div class="schedule-intel-weather weather-block">${label}<div class="weather-block-status">住所未設定</div></div>`;
  }
  if (status === "fetch_failed") {
    return `<div class="schedule-intel-weather weather-block">${label}<div class="weather-block-status">取得失敗</div></div>`;
  }
  const slotsHtml = renderWeatherSlotsHtml(evIntel.weatherSlots, { precipOnly: true, inline: true });
  return `<div class="schedule-intel-weather weather-block">${label}${slotsHtml}</div>`;
}

const MAPS_API_UNSET_LABEL = "Google Maps API\u672a\u8a2d\u5b9a";
const ADDRESS_UNSET_LABEL = "\u4f4f\u6240\u672a\u8a2d\u5b9a";
const TRAVEL_UNCALCULATED_LABEL = "\u79fb\u52d5\u6642\u9593\u672a\u8a08\u7b97";
const TRAVEL_FETCH_FAILED_LABEL = "\u79fb\u52d5\u6642\u9593\u53d6\u5f97\u5931\u6557";

function travelLabelIsMuted(label) {
  return (
    !label ||
    label === TRAVEL_UNCALCULATED_LABEL ||
    label === TRAVEL_FETCH_FAILED_LABEL ||
    label === ADDRESS_UNSET_LABEL
  );
}

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
  let inner = "";
  if (label === MAPS_API_UNSET_LABEL) {
    inner = `${route} <span class="schedule-intel-travel-muted">${escapeScheduleHtml(MAPS_API_UNSET_LABEL)}</span>`;
  } else if (travelLabelIsMuted(label)) {
    inner = `${route} <span class="schedule-intel-travel-muted">${escapeScheduleHtml(label || TRAVEL_UNCALCULATED_LABEL)}</span>`;
  } else {
    inner = `${route} <strong>${escapeScheduleHtml(label)}</strong>`;
  }
  const mapsUrl = travel.mapsUrl?.trim();
  if (mapsUrl) {
    return `<a class="schedule-intel-travel schedule-intel-travel-link" href="${escapeScheduleHtml(mapsUrl)}" target="_blank" rel="noopener" aria-label="Googleマップでナビ">${inner}</a>`;
  }
  return `<div class="schedule-intel-travel">${inner}</div>`;
}

function renderMaterialLineHtml(fieldCheck) {
  if (!fieldCheck?.url) return "";
  const label =
    fieldCheck.total > 0
      ? `🎒 ${fieldCheck.checked}/${fieldCheck.total}`
      : "🎒 材料チェックを開く";
  return `<a class="btn-sub btn-small schedule-intel-material" href="${escapeScheduleHtml(fieldCheck.url)}" style="position:relative;z-index:2;pointer-events:auto;">${escapeScheduleHtml(label)}</a>`;
}

function needsAddressInput(evIntel) {
  return !evIntel?.address?.fullAddress;
}

function renderAddressUnsetBlock(evIntel) {
  if (!needsAddressInput(evIntel)) return "";
  const eventKey = escapeScheduleHtml(evIntel.eventId ?? evIntel.id ?? "");
  return `<div class="schedule-intel-address-unset">
    <span class="schedule-intel-address-label">住所未設定</span>
    <button type="button" class="btn-sub btn-small schedule-intel-address-btn" data-event-id="${eventKey}">住所を入力</button>
  </div>`;
}

export function renderIntelligenceEventCard(
  evIntel,
  { catIcon, catLabel, showMapsUnsetBanner = false, mapsApiConfigured = true } = {}
) {
  const ev = evIntel;
  const time = formatEventTimeRange(ev);
  const travel = ev.travel ?? {};
  const weatherHtml = needsAddressInput(ev) ? "" : renderSiteWeatherHtml(ev);
  const eventKey = escapeScheduleHtml(ev.eventId ?? ev.id ?? "");

  return `<article class="schedule-intel-card schedule-intel-card-compact" data-intel-event-id="${eventKey}">
    <div class="schedule-intel-summary schedule-intel-practical">
      ${time ? `<div class="schedule-intel-time">${escapeScheduleHtml(time)}</div>` : ""}
      <div class="schedule-intel-title">${escapeScheduleHtml(ev.title)}</div>
      ${weatherHtml ? weatherHtml : ""}
      ${renderTravelLineHtml(travel, { showMapsUnsetBanner, mapsApiConfigured })}
      ${renderAddressUnsetBlock(ev)}
      ${renderMaterialLineHtml(ev.fieldCheck)}
    </div>
  </article>`;
}

export function bindIntelligenceEventCards(root) {
  root?.querySelectorAll(".schedule-intel-material").forEach((el) => {
    el.addEventListener("click", (ev) => ev.stopPropagation());
    el.addEventListener("mousedown", (ev) => ev.stopPropagation());
    el.addEventListener("touchstart", (ev) => ev.stopPropagation(), { passive: true });
  });
  root?.querySelectorAll(".schedule-intel-travel-link").forEach((el) => {
    el.addEventListener("click", (ev) => ev.stopPropagation());
    el.addEventListener("touchstart", (ev) => ev.stopPropagation(), { passive: true });
  });
}

export function enrichIntelligenceWithDeparture(intelligence, departure, firstEventId) {
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

export function renderWeekIntelligenceEventItemHtml(
  evIntel,
  intelligence,
  { departureHtml = "" } = {}
) {
  const card = renderIntelligenceEventCard(evIntel, {
    mapsApiConfigured: intelligence?.mapsApiConfigured !== false,
  });
  const departureBlock = departureHtml
    ? `<div class="schedule-event-departure">${departureHtml}</div>`
    : "";
  return `<li class="schedule-event-item schedule-event-practical schedule-event-intel">${card}${departureBlock}</li>`;
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
