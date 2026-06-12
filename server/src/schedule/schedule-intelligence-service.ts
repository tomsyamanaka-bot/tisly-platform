/** 日程調整レベル4 — 天気・移動時間・1日判定 */

import {
  extractEventAddress,
  geocodeQueryFromAddress,
  resolveEventProjectRef,
  type ExtractedAddress,
} from "./address-extract-service.js";
import { getFieldCheckProgressV1 } from "../field-ops/field-check-v1-store.js";
import { geocodeAddress } from "./geocode-service.js";
import {
  fetchDrivingDurationMinForIntelligence,
  getDefaultDepartureOrigin,
  getDefaultDepartureOriginLabel,
  isGoogleMapsApiConfigured,
  mapsDirectionsUrl,
  type MapsDurationSource,
} from "./google-maps-service.js";
import { fetchDayWeather, type DayWeather, type WeatherSlot } from "./weather-service.js";
import type { ScheduleEvent } from "./schedule-types.js";

export type ScheduleFeasibility = "comfortable" | "caution" | "tight" | "unknown";

export interface EventTravelInfo {
  label: string;
  /** カード表示用（例: 🏠→現場 / 現場①→現場②） */
  compactLabel: string;
  origin: string | null;
  destination: string | null;
  durationMin: number | null;
  durationSource: MapsDurationSource;
  durationLabel: string;
  mapsUrl: string | null;
  mapsAvailable: boolean;
  cacheHit: boolean;
}

export interface EventFieldCheckInfo {
  checked: number;
  total: number;
  url: string | null;
}

export interface ScheduleEventIntelligence {
  index: number;
  eventId: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  calendarSummary: string | null;
  calendarColor: string | null;
  address: ExtractedAddress;
  weather: DayWeather | null;
  weatherSlots: WeatherSlot[];
  travel: EventTravelInfo;
  fieldCheck: EventFieldCheckInfo | null;
}

export interface DayGapJudgment {
  fromEventId: string;
  toEventId: string;
  gapMin: number;
  travelMin: number | null;
  feasibility: ScheduleFeasibility;
}

export interface DayScheduleIntelligence {
  date: string;
  defaultOrigin: string;
  defaultOriginLabel: string;
  mapsApiConfigured: boolean;
  events: ScheduleEventIntelligence[];
  totalTravelMin: number | null;
  totalScheduledMin: number;
  totalBindingMin: number | null;
  feasibility: ScheduleFeasibility;
  feasibilityLabel: string;
  feasibilityIcon: string;
  gaps: DayGapJudgment[];
  returnToOrigin?: EventTravelInfo;
}

export interface ScheduleIntelligenceDebug {
  mapsApiConfigured: boolean;
  defaultOrigin: string;
  defaultOriginLabel: string;
  geocodeResults: Array<{ query: string; lat: number; lon: number; source: string }>;
  weatherResults: Array<{ eventId: string; source: string; location: string }>;
  routeResults: Array<{
    origin: string;
    destination: string;
    durationMin: number | null;
    source: MapsDurationSource;
    cacheHit: boolean;
  }>;
  addressExtractions: Array<{
    eventId: string;
    title: string;
    source: string;
    displayAddress: string;
    fullAddress: string | null;
  }>;
}

const FEASIBILITY_META: Record<
  ScheduleFeasibility,
  { label: string; icon: string }
> = {
  comfortable: { label: "余裕あり", icon: "🟢" },
  caution: { label: "注意", icon: "🟡" },
  tight: { label: "厳しい", icon: "🔴" },
  unknown: { label: "不明", icon: "⚪" },
};

function sortEventsByStart(events: ScheduleEvent[]): ScheduleEvent[] {
  return [...events].sort((a, b) => {
    if (a.allDay && !b.allDay) return -1;
    if (!a.allDay && b.allDay) return 1;
    const ta = a.startTime ?? "99:99";
    const tb = b.startTime ?? "99:99";
    return ta.localeCompare(tb);
  });
}

function parseTimeToMinutes(time: string | null | undefined): number | null {
  if (!time?.trim()) return null;
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function eventDurationMin(ev: ScheduleEvent): number {
  const start = parseTimeToMinutes(ev.startTime);
  const end = parseTimeToMinutes(ev.endTime);
  if (start == null) return 0;
  if (end == null || end <= start) return 60;
  return end - start;
}

function gapBetweenEvents(prev: ScheduleEvent, next: ScheduleEvent): number | null {
  const endPrev = parseTimeToMinutes(prev.endTime) ?? parseTimeToMinutes(prev.startTime);
  const startNext = parseTimeToMinutes(next.startTime);
  if (endPrev == null || startNext == null) return null;
  return startNext - endPrev;
}

function judgeGap(gapMin: number | null, travelMin: number | null, mapsOk: boolean): ScheduleFeasibility {
  if (!mapsOk || gapMin == null || travelMin == null) return "unknown";
  const slack = gapMin - travelMin;
  if (slack >= 30) return "comfortable";
  if (slack >= 10) return "caution";
  return "tight";
}

function worstFeasibility(levels: ScheduleFeasibility[]): ScheduleFeasibility {
  if (!levels.length) return "unknown";
  if (levels.includes("unknown")) return "unknown";
  if (levels.includes("tight")) return "tight";
  if (levels.includes("caution")) return "caution";
  return "comfortable";
}

function travelDurationLabel(
  minutes: number | null,
  source: MapsDurationSource,
  mapsConfigured: boolean,
  hasAddress: boolean
): string {
  if (!hasAddress) return "移動時間未計算";
  if (!mapsConfigured) return "移動時間API未設定";
  if (minutes == null || source === "none") return "移動時間未計算";
  return `${minutes}分`;
}

const SITE_CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

function siteCircled(index: number): string {
  return SITE_CIRCLED[index] ?? String(index + 1);
}

/** カード用の移動ラベル（1件目: 🏠→現場、2件目以降: 現場①→現場②） */
export function buildTravelCompactLabel(eventIndex: number): string {
  if (eventIndex <= 0) return "🏠→現場";
  return `現場${siteCircled(eventIndex - 1)}→現場${siteCircled(eventIndex)}`;
}

function buildFieldCheckForEvent(
  date: string,
  event: ScheduleEvent
): EventFieldCheckInfo | null {
  const ref = resolveEventProjectRef(event);
  if (!ref) return null;
  const progress = getFieldCheckProgressV1(
    { source: ref.projectSource, projectId: ref.projectId },
    date
  );
  const q = new URLSearchParams({
    projectId: ref.projectId,
    source: ref.projectSource,
    date,
  });
  return {
    checked: progress?.checked ?? 0,
    total: progress?.total ?? 0,
    url: `/field-check-v1?${q.toString()}`,
  };
}

function buildTravelInfo(input: {
  label: string;
  compactLabel: string;
  origin: string | null;
  destination: string | null;
  durationMin: number | null;
  durationSource: MapsDurationSource;
  mapsConfigured: boolean;
  hasAddress: boolean;
  cacheHit: boolean;
}): EventTravelInfo {
  const mapsAvailable = Boolean(
    input.hasAddress && input.origin && input.destination && input.mapsConfigured
  );
  return {
    label: input.label,
    compactLabel: input.compactLabel,
    origin: input.origin,
    destination: input.destination,
    durationMin: input.durationMin,
    durationSource: input.durationSource,
    durationLabel: travelDurationLabel(
      input.durationMin,
      input.durationSource,
      input.mapsConfigured,
      input.hasAddress
    ),
    mapsUrl:
      mapsAvailable && input.origin && input.destination
        ? mapsDirectionsUrl(input.origin, input.destination)
        : null,
    mapsAvailable,
    cacheHit: input.cacheHit,
  };
}

async function weatherForEvent(
  date: string,
  address: ExtractedAddress
): Promise<{ weather: DayWeather | null; slots: WeatherSlot[] }> {
  const query = geocodeQueryFromAddress(address) ?? address.cityHint;
  if (!query) return { weather: null, slots: [] };
  try {
    const geo = await geocodeAddress(query);
    const weather = await fetchDayWeather(date, {
      location: geo.label,
      lat: geo.lat,
      lon: geo.lon,
    });
    return { weather, slots: weather.slots };
  } catch {
    return { weather: null, slots: [] };
  }
}

export async function buildDayScheduleIntelligence(
  date: string,
  events: ScheduleEvent[],
  opts?: { includeReturnToOrigin?: boolean }
): Promise<DayScheduleIntelligence> {
  const sorted = sortEventsByStart(events);
  const mapsConfigured = isGoogleMapsApiConfigured();
  const defaultOrigin = getDefaultDepartureOrigin();
  const defaultOriginLabel = getDefaultDepartureOriginLabel();
  const intelligenceEvents: ScheduleEventIntelligence[] = [];
  const gaps: DayGapJudgment[] = [];
  let totalTravelSum = 0;
  let travelLegCount = 0;
  let travelComplete = true;
  let totalScheduled = 0;
  const addresses: ExtractedAddress[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const ev = sorted[i]!;
    const address = extractEventAddress(ev);
    addresses.push(address);
    const { weather, slots } = await weatherForEvent(date, address);

    const prevAddress = i > 0 ? addresses[i - 1]! : null;
    const origin =
      i === 0
        ? defaultOrigin || null
        : prevAddress?.fullAddress ?? prevAddress?.cityHint ?? null;
    const destination = address.fullAddress ?? address.cityHint;
    const hasAddress = Boolean(destination);

    const travelCompactLabel = buildTravelCompactLabel(i);
    let travelLabel = "";
    if (i === 0) {
      travelLabel = defaultOrigin
        ? `${defaultOriginLabel} → 現場`
        : "自宅 → 現場";
    } else {
      travelLabel = `現場${siteCircled(i - 1)} → 現場${siteCircled(i)}`;
    }

    let durationMin: number | null = null;
    let durationSource: MapsDurationSource = "none";
    let cacheHit = false;

    if (hasAddress && origin && destination) {
      const dur = await fetchDrivingDurationMinForIntelligence(origin, destination, date);
      durationMin = dur.minutes;
      durationSource = dur.source;
      cacheHit = dur.cacheHit;
    } else if (hasAddress && i === 0 && destination && !defaultOrigin) {
      durationMin = null;
      durationSource = "none";
    }

    if (hasAddress) {
      travelLegCount += 1;
      if (!mapsConfigured || durationMin == null) {
        travelComplete = false;
      } else {
        totalTravelSum += durationMin;
      }
    }

    const travel = buildTravelInfo({
      label: travelLabel,
      compactLabel: travelCompactLabel,
      origin: origin ?? (i === 0 ? defaultOriginLabel : null),
      destination,
      durationMin,
      durationSource,
      mapsConfigured,
      hasAddress,
      cacheHit,
    });

    totalScheduled += eventDurationMin(ev);

    intelligenceEvents.push({
      index: i + 1,
      eventId: ev.id,
      title: ev.title,
      startTime: ev.startTime ?? null,
      endTime: ev.endTime ?? null,
      allDay: Boolean(ev.allDay),
      calendarSummary: ev.calendarSummary ?? null,
      calendarColor: ev.calendarColor ?? null,
      address,
      weather,
      weatherSlots: slots,
      travel,
      fieldCheck: buildFieldCheckForEvent(date, ev),
    });

    if (i > 0) {
      const prevEv = sorted[i - 1]!;
      const gapMin = gapBetweenEvents(prevEv, ev);
      const feasibility = judgeGap(gapMin, durationMin, mapsConfigured && hasAddress);
      gaps.push({
        fromEventId: prevEv.id,
        toEventId: ev.id,
        gapMin: gapMin ?? 0,
        travelMin: durationMin,
        feasibility,
      });
    }
  }

  let returnToOrigin: EventTravelInfo | undefined;
  if (opts?.includeReturnToOrigin && defaultOrigin && addresses.length) {
    const last = addresses[addresses.length - 1]!;
    const dest = last.fullAddress ?? last.cityHint;
    if (dest) {
      const dur = await fetchDrivingDurationMinForIntelligence(dest, defaultOrigin, date);
      if (!mapsConfigured || dur.minutes == null) travelComplete = false;
      else totalTravelSum += dur.minutes;
      returnToOrigin = buildTravelInfo({
        label: "最終現場 → 通常出発地",
        compactLabel: "現場→🏠",
        origin: dest,
        destination: defaultOrigin,
        durationMin: dur.minutes,
        durationSource: dur.source,
        mapsConfigured,
        hasAddress: true,
        cacheHit: dur.cacheHit,
      });
    }
  }

  let totalTravel: number | null;
  if (!sorted.length) {
    totalTravel = 0;
  } else if (!travelComplete || (travelLegCount > 0 && !mapsConfigured)) {
    totalTravel = null;
  } else {
    totalTravel = totalTravelSum;
  }

  const gapLevels = gaps.map((g) => g.feasibility);
  let feasibility: ScheduleFeasibility;
  if (!sorted.length) {
    feasibility = "comfortable";
  } else if (!mapsConfigured) {
    feasibility = "unknown";
  } else if (!gapLevels.length) {
    feasibility = addresses.some((a) => a.mapsAvailable) ? "comfortable" : "unknown";
  } else if (gapLevels.includes("unknown")) {
    feasibility = "unknown";
  } else {
    feasibility = worstFeasibility(gapLevels);
  }

  const meta = FEASIBILITY_META[feasibility];
  const totalBindingMin =
    totalTravel != null ? totalScheduled + totalTravel : null;

  return {
    date,
    defaultOrigin,
    defaultOriginLabel,
    mapsApiConfigured: mapsConfigured,
    events: intelligenceEvents,
    totalTravelMin: totalTravel,
    totalScheduledMin: totalScheduled,
    totalBindingMin,
    feasibility,
    feasibilityLabel: meta.label,
    feasibilityIcon: meta.icon,
    gaps,
    returnToOrigin,
  };
}

export async function buildScheduleIntelligenceDebug(
  date: string,
  events: ScheduleEvent[]
): Promise<ScheduleIntelligenceDebug> {
  const intelligence = await buildDayScheduleIntelligence(date, events, {
    includeReturnToOrigin: true,
  });
  const geocodeResults: ScheduleIntelligenceDebug["geocodeResults"] = [];
  const weatherResults: ScheduleIntelligenceDebug["weatherResults"] = [];
  const routeResults: ScheduleIntelligenceDebug["routeResults"] = [];
  const addressExtractions: ScheduleIntelligenceDebug["addressExtractions"] = [];

  for (const ev of intelligence.events) {
    addressExtractions.push({
      eventId: ev.eventId,
      title: ev.title,
      source: ev.address.source,
      displayAddress: ev.address.displayAddress,
      fullAddress: ev.address.fullAddress,
    });
    const query = geocodeQueryFromAddress(ev.address);
    if (query) {
      const geo = await geocodeAddress(query);
      geocodeResults.push({
        query,
        lat: geo.lat,
        lon: geo.lon,
        source: geo.source,
      });
    }
    weatherResults.push({
      eventId: ev.eventId,
      source: ev.weather?.source ?? "none",
      location: ev.weather?.location ?? "",
    });
    routeResults.push({
      origin: ev.travel.origin ?? "",
      destination: ev.travel.destination ?? "",
      durationMin: ev.travel.durationMin,
      source: ev.travel.durationSource,
      cacheHit: ev.travel.cacheHit,
    });
  }

  return {
    mapsApiConfigured: intelligence.mapsApiConfigured,
    defaultOrigin: intelligence.defaultOrigin,
    defaultOriginLabel: intelligence.defaultOriginLabel,
    geocodeResults,
    weatherResults,
    routeResults,
    addressExtractions,
  };
}

export function buildDailySummaryResponse(intelligence: DayScheduleIntelligence) {
  return {
    date: intelligence.date,
    defaultOriginLabel: intelligence.defaultOriginLabel,
    mapsApiConfigured: intelligence.mapsApiConfigured,
    events: intelligence.events.map((ev) => ({
      index: ev.index,
      eventId: ev.eventId,
      title: ev.title,
      startTime: ev.startTime,
      endTime: ev.endTime,
      calendarSummary: ev.calendarSummary,
      address: ev.address.displayAddress,
      addressSource: ev.address.source,
      weather: ev.weatherSlots.map((s) => ({
        period: s.period,
        label: s.label,
        icon: s.icon,
        precipChance: s.precipChance,
        tempC: s.tempC,
      })),
      travel: {
        label: ev.travel.label,
        compactLabel: ev.travel.compactLabel,
        durationMin: ev.travel.durationMin,
        durationLabel: ev.travel.durationLabel,
        mapsUrl: ev.travel.mapsUrl,
      },
      fieldCheck: ev.fieldCheck,
    })),
    totalTravelMin: intelligence.totalTravelMin,
    totalScheduledMin: intelligence.totalScheduledMin,
    totalBindingMin: intelligence.totalBindingMin,
    feasibility: intelligence.feasibility,
    feasibilityLabel: intelligence.feasibilityLabel,
    feasibilityIcon: intelligence.feasibilityIcon,
    returnToOrigin: intelligence.returnToOrigin
      ? {
          durationMin: intelligence.returnToOrigin.durationMin,
          mapsUrl: intelligence.returnToOrigin.mapsUrl,
        }
      : null,
  };
}
