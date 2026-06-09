/** Google Maps — ナビURL（常時）+ Directions API（キー設定時のみ） */

import type { DayDispatch } from "./route-planner-service.js";
import type { ScheduleEvent } from "./schedule-types.js";

export function mapsDirectionsUrl(origin: string, destination: string): string {
  const o = encodeURIComponent(origin);
  const d = encodeURIComponent(destination);
  return `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}&travelmode=driving`;
}

export function mapsNavUrl(destination: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

export type MapsDurationSource = "api" | "mock" | "none";

export interface MapsIntegrationStatus {
  apiConfigured: boolean;
  mode: "api" | "nav_only";
  label: "未設定" | "仮連携中" | "本番連携済み";
  hint: string;
}

export interface DayTravelBlock {
  id: string;
  kind: "current_to_site" | "site_to_site";
  label: string;
  origin: string;
  destination: string;
  durationMin: number | null;
  durationSource: MapsDurationSource;
  mapsUrl: string;
}

export function isGoogleMapsApiConfigured(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim());
}

export function getMapsIntegrationStatus(): MapsIntegrationStatus {
  const apiConfigured = isGoogleMapsApiConfigured();
  return {
    apiConfigured,
    mode: apiConfigured ? "api" : "nav_only",
    label: apiConfigured ? "本番連携済み" : "未設定",
    hint: apiConfigured ? "" : "Google Maps API未設定：ナビ起動のみ",
  };
}

export function mockDurationMin(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return 12 + (h % 25);
}

export async function fetchDrivingDurationMin(
  origin: string,
  destination: string
): Promise<{ minutes: number; source: MapsDurationSource }> {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  const seed = `${origin}:${destination}`;
  if (!key) {
    return { minutes: mockDurationMin(seed), source: "mock" };
  }
  try {
    const params = new URLSearchParams({
      origin,
      destination,
      mode: "driving",
      language: "ja",
      key,
    });
    const res = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params}`);
    const json = (await res.json()) as {
      status?: string;
      routes?: Array<{ legs?: Array<{ duration?: { value?: number } }> }>;
    };
    const seconds = json.routes?.[0]?.legs?.[0]?.duration?.value;
    if (json.status === "OK" && typeof seconds === "number" && seconds > 0) {
      return { minutes: Math.max(1, Math.round(seconds / 60)), source: "api" };
    }
  } catch {
    /* fallback to mock */
  }
  return { minutes: mockDurationMin(seed), source: "mock" };
}

const DEFAULT_ORIGIN = process.env.DISPATCH_DEFAULT_ORIGIN ?? "事務所（守谷市）";

function firstSiteDestination(
  dispatch: DayDispatch | null,
  events: ScheduleEvent[]
): string | null {
  const fromDispatch = dispatch?.stops?.[0]?.address ?? dispatch?.stops?.[0]?.title;
  if (fromDispatch?.trim()) return fromDispatch.trim();
  const withLoc = events.find((e) => e.location?.trim());
  if (withLoc?.location) return withLoc.location.trim();
  const construction = events.find((e) => e.category === "construction");
  return construction?.title?.trim() ?? null;
}

export async function buildDayTravelBlocks(
  date: string,
  dispatch: DayDispatch | null,
  events: ScheduleEvent[]
): Promise<DayTravelBlock[]> {
  const blocks: DayTravelBlock[] = [];
  const firstDest = firstSiteDestination(dispatch, events);
  if (firstDest) {
    const dur = await fetchDrivingDurationMin(DEFAULT_ORIGIN, firstDest);
    blocks.push({
      id: `${date}-current-to-first`,
      kind: "current_to_site",
      label: `現在地 → ${firstDest}`,
      origin: DEFAULT_ORIGIN,
      destination: firstDest,
      durationMin: dur.minutes,
      durationSource: dur.source,
      mapsUrl: mapsDirectionsUrl(DEFAULT_ORIGIN, firstDest),
    });
  }
  if (dispatch?.legs?.length) {
    for (let i = 0; i < dispatch.legs.length; i++) {
      const leg = dispatch.legs[i]!;
      const origin = leg.mapsUrl.includes("origin=")
        ? dispatch.stops[i]?.address ?? leg.fromTitle
        : leg.fromTitle;
      const dest = dispatch.stops[i + 1]?.address ?? leg.toTitle;
      const dur = await fetchDrivingDurationMin(origin, dest);
      blocks.push({
        id: `${date}-leg-${i}`,
        kind: "site_to_site",
        label: `${leg.fromTitle} → ${leg.toTitle}`,
        origin,
        destination: dest,
        durationMin: dur.minutes,
        durationSource: dur.source,
        mapsUrl: leg.mapsUrl,
      });
    }
  }
  return blocks;
}

export async function enrichDispatchLegDurations(dispatch: DayDispatch): Promise<DayDispatch> {
  if (!dispatch.legs.length) return dispatch;
  const legs = await Promise.all(
    dispatch.legs.map(async (leg, i) => {
      const origin = dispatch.stops[i]?.address ?? leg.fromTitle;
      const dest = dispatch.stops[i + 1]?.address ?? leg.toTitle;
      const dur = await fetchDrivingDurationMin(origin, dest);
      return {
        ...leg,
        durationMin: dur.minutes,
        memo: dur.source === "api" ? "API" : leg.memo ?? "車",
      };
    })
  );
  return { ...dispatch, legs };
}
