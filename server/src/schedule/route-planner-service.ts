/** Google Maps Directions API 連携準備 — 最初はモック所要時間 */

import type { ScheduleEvent } from "./schedule-types.js";

export interface RouteStop {
  time: string;
  title: string;
  address?: string;
  mapsQuery?: string;
}

export interface RouteLeg {
  fromTitle: string;
  toTitle: string;
  durationMin: number;
  mode: "car";
  mapsUrl: string;
  memo?: string;
}

export interface DayDispatch {
  date: string;
  driver: string;
  vehicle: string;
  stops: RouteStop[];
  legs: RouteLeg[];
}

const MOCK_DRIVER = "山中";
const MOCK_VEHICLE = "ハイエース";

function mapsDirectionsUrl(origin: string, destination: string): string {
  const key = process.env.GOOGLE_MAPS_API_KEY ?? "";
  const o = encodeURIComponent(origin);
  const d = encodeURIComponent(destination);
  if (key) {
    return `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}&travelmode=driving`;
  }
  return `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}&travelmode=driving`;
}

function mockDurationMin(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return 12 + (h % 25);
}

function constructionStops(events: ScheduleEvent[]): RouteStop[] {
  const times = ["08:30", "10:30", "13:00", "15:30"];
  return events
    .filter((e) => e.category === "construction")
    .slice(0, 4)
    .map((ev, i) => ({
      time: times[i] ?? "16:00",
      title: ev.title,
      address: ev.title,
      mapsQuery: ev.title,
    }));
}

/** 将来 Google Maps Distance Matrix API に差し替え */
export function buildDayDispatch(date: string, events: ScheduleEvent[]): DayDispatch | null {
  const stops = constructionStops(events);
  if (!stops.length) return null;

  const legs: RouteLeg[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i];
    const to = stops[i + 1];
    const origin = from.mapsQuery ?? from.title;
    const dest = to.mapsQuery ?? to.title;
    legs.push({
      fromTitle: from.title,
      toTitle: to.title,
      durationMin: mockDurationMin(`${date}:${origin}:${dest}`),
      mode: "car",
      mapsUrl: mapsDirectionsUrl(origin, dest),
      memo: "車",
    });
  }

  return {
    date,
    driver: MOCK_DRIVER,
    vehicle: MOCK_VEHICLE,
    stops,
    legs,
  };
}

export interface SiteTravelHint {
  date: string;
  siteTitle: string;
  prevDurationMin: number | null;
  nextDurationMin: number | null;
  prevFrom: string | null;
  nextTo: string | null;
}

export function travelHintsForSite(
  date: string,
  siteTitle: string,
  dispatch: DayDispatch | null
): SiteTravelHint {
  if (!dispatch) {
    return {
      date,
      siteTitle,
      prevDurationMin: null,
      nextDurationMin: null,
      prevFrom: null,
      nextTo: null,
    };
  }
  const idx = dispatch.stops.findIndex((s) => s.title === siteTitle);
  if (idx < 0) {
    return {
      date,
      siteTitle,
      prevDurationMin: null,
      nextDurationMin: null,
      prevFrom: null,
      nextTo: null,
    };
  }
  const prevLeg = idx > 0 ? dispatch.legs[idx - 1] : null;
  const nextLeg = idx < dispatch.legs.length ? dispatch.legs[idx] : null;
  return {
    date,
    siteTitle,
    prevDurationMin: prevLeg?.durationMin ?? null,
    nextDurationMin: nextLeg?.durationMin ?? null,
    prevFrom: prevLeg?.fromTitle ?? null,
    nextTo: nextLeg?.toTitle ?? null,
  };
}
