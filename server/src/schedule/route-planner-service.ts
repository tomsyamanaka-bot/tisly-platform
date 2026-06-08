/** 配車表 — 案件データから自動生成（将来 Directions API 接続可能構成） */

import { getDatabase } from "../db/database.js";
import type { ScheduleEvent } from "./schedule-types.js";

export interface RouteStop {
  time: string;
  title: string;
  address?: string;
  mapsQuery?: string;
  projectId?: string;
  assignee?: string;
  navUrl?: string;
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

const DEFAULT_DRIVER = process.env.DISPATCH_DEFAULT_DRIVER ?? "山中";
const DEFAULT_VEHICLE = process.env.DISPATCH_DEFAULT_VEHICLE ?? "ハイエース";

export function mapsDirectionsUrl(origin: string, destination: string): string {
  const o = encodeURIComponent(origin);
  const d = encodeURIComponent(destination);
  return `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}&travelmode=driving`;
}

export function mapsNavUrl(destination: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

function mockDurationMin(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return 12 + (h % 25);
}

interface ProjectStop {
  time: string;
  title: string;
  address: string;
  projectId: string;
  assignee: string | null;
}

function parseJsonSchedule(raw: string | null): { date?: string; startTime?: string } | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { date?: string; startTime?: string };
  } catch {
    return null;
  }
}

/** 案件テーブルから当日の現場ストップを取得 */
function loadProjectStopsForDate(date: string): ProjectStop[] {
  const stops: ProjectStop[] = [];
  const db = getDatabase();

  const businessRows = db
    .prepare(
      `SELECT id, title, address, customer_name, survey_schedule_json, construction_schedule_json
       FROM business_projects ORDER BY updated_at DESC LIMIT 100`
    )
    .all() as Array<Record<string, string | null>>;

  for (const row of businessRows) {
    const survey = parseJsonSchedule(row.survey_schedule_json as string | null);
    const construction = parseJsonSchedule(row.construction_schedule_json as string | null);
    const sched = construction?.date === date ? construction : survey?.date === date ? survey : null;
    if (!sched) continue;
    const address = String(row.address ?? "").trim() || String(row.title ?? "現場");
    stops.push({
      time: sched.startTime ?? "09:00",
      title: String(row.title ?? row.customer_name ?? "案件"),
      address,
      projectId: String(row.id),
      assignee: null,
    });
  }

  const surveyRows = db
    .prepare(
      `SELECT project_id, site_name, address, assignee, survey_date
       FROM survey_projects WHERE survey_date = ? ORDER BY updated_at DESC`
    )
    .all(date) as Array<Record<string, string | null>>;

  for (const row of surveyRows) {
    const exists = stops.some((s) => s.title === String(row.site_name));
    if (exists) continue;
    stops.push({
      time: "10:00",
      title: String(row.site_name ?? "現調"),
      address: String(row.address ?? row.site_name ?? "現場"),
      projectId: String(row.project_id),
      assignee: row.assignee ? String(row.assignee) : null,
    });
  }

  return stops.sort((a, b) => a.time.localeCompare(b.time));
}

function constructionStopsFromEvents(events: ScheduleEvent[]): RouteStop[] {
  const times = ["08:30", "10:00", "13:00", "15:30"];
  return events
    .filter((e) => e.category === "construction")
    .slice(0, 4)
    .map((ev, i) => ({
      time: ev.startTime ?? times[i] ?? "16:00",
      title: ev.title,
      address: ev.location ?? ev.title,
      mapsQuery: ev.location ?? ev.title,
      navUrl: mapsNavUrl(ev.location ?? ev.title),
    }));
}

function projectStopsToRoute(stops: ProjectStop[]): RouteStop[] {
  return stops.map((s) => ({
    time: s.time,
    title: s.title,
    address: s.address,
    mapsQuery: s.address,
    projectId: s.projectId,
    assignee: s.assignee ?? undefined,
    navUrl: mapsNavUrl(s.address),
  }));
}

/** 案件優先、なければカレンダー工事予定から配車表を構築 */
export function buildDayDispatch(date: string, events: ScheduleEvent[]): DayDispatch | null {
  const projectStops = loadProjectStopsForDate(date);
  let stops: RouteStop[] = projectStops.length
    ? projectStopsToRoute(projectStops)
    : constructionStopsFromEvents(events);

  if (!stops.length) return null;

  const driver =
    projectStops.find((s) => s.assignee)?.assignee ?? DEFAULT_DRIVER;
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
    driver,
    vehicle: DEFAULT_VEHICLE,
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
