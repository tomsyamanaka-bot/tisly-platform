/** 出発リマインダー + 持ち物確認通知 v1 */

import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import type { ProjectRefV1 } from "../field-ops/field-ops-types.js";
import { getFieldCheckProgressV1 } from "../field-ops/field-check-v1-store.js";
import {
  buildDayTravelBlocks,
  enrichDispatchLegDurations,
  type MapsDurationSource,
} from "./google-maps-service.js";
import { buildDayDispatch, type DayDispatch } from "./route-planner-service.js";
import { fetchCalendarEvents } from "../services/googleCalendar.js";
import {
  hasCachedCalendarEvents,
  listCachedCalendarEvents,
} from "./schedule-calendar-store.js";
import { resolveEventProjectRef } from "./address-extract-service.js";
import type { ScheduleEvent } from "./schedule-types.js";

async function loadCalendarEventsForDate(date: string): Promise<ScheduleEvent[]> {
  if (hasCachedCalendarEvents()) {
    return listCachedCalendarEvents(date, date);
  }
  return fetchCalendarEvents(date, date);
}

export interface ScheduleDayDepartureV1 {
  id: string;
  date: string;
  projectId: string | null;
  projectSource: ProjectRefV1["source"] | null;
  firstEventId: string | null;
  eventTitle: string | null;
  departureTime: string;
  reminderMinutesBefore: number;
  reminderEnabled: boolean;
  reminderTime: string;
  reminderSentAt: string | null;
  travelDurationMin: number | null;
  travelDurationSource: MapsDurationSource | null;
  fieldCheckUrl: string | null;
  fieldCheckProgress: { checked: number; total: number } | null;
  createdAt: string;
  updatedAt: string;
}

export interface FirstSiteOfDay {
  firstEventId: string | null;
  eventTitle: string;
  startTime: string;
  projectId: string | null;
  projectSource: ProjectRefV1["source"] | null;
}

const DEFAULT_REMINDER_MINUTES = 30;
const TRAVEL_BUFFER_MIN = 10;

export function subtractMinutes(time: string, minutes: number): string {
  const parts = time.split(":");
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  let total = h * 60 + m - minutes;
  total = ((total % 1440) + 1440) % 1440;
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

export function calcDefaultDepartureTime(startTime: string, travelMin: number): string {
  return subtractMinutes(startTime, travelMin + TRAVEL_BUFFER_MIN);
}

export function calcReminderTime(departureTime: string, reminderMinutesBefore: number): string {
  return subtractMinutes(departureTime, reminderMinutesBefore);
}

function sortByStartTime(events: ScheduleEvent[]): ScheduleEvent[] {
  return [...events].sort((a, b) => {
    const ta = a.startTime ?? "99:99";
    const tb = b.startTime ?? "99:99";
    return ta.localeCompare(tb);
  });
}

export function findFirstConstructionEvent(events: ScheduleEvent[]): ScheduleEvent | null {
  const construction = sortByStartTime(events.filter((e) => e.category === "construction"));
  return construction[0] ?? null;
}

export function resolveFirstSiteOfDay(
  events: ScheduleEvent[],
  dispatch: DayDispatch | null
): FirstSiteOfDay | null {
  const firstEv = findFirstConstructionEvent(events);
  const firstStop = dispatch?.stops?.[0];
  if (!firstEv && !firstStop) return null;

  const evRef = firstEv ? resolveEventProjectRef(firstEv) : null;
  const projectId = firstStop?.projectId ?? evRef?.projectId ?? null;
  const projectSource =
    (firstStop?.projectId ? inferProjectSource(firstStop.projectId) : null) ??
    evRef?.projectSource ??
    (projectId ? inferProjectSource(projectId) : null);
  return {
    firstEventId: firstEv?.id ?? null,
    eventTitle: firstEv?.title ?? firstStop?.title ?? "現場",
    startTime: firstStop?.time ?? firstEv?.startTime ?? "09:00",
    projectId,
    projectSource,
  };
}

function inferProjectSource(projectId: string): ProjectRefV1["source"] | null {
  const db = getDatabase();
  const biz = db.prepare(`SELECT id FROM business_projects WHERE id = ?`).get(projectId);
  if (biz) return "business";
  const survey = db.prepare(`SELECT project_id FROM survey_projects WHERE project_id = ?`).get(projectId);
  if (survey) return "survey";
  return null;
}

function buildFieldCheckUrl(
  date: string,
  projectId: string | null,
  projectSource: ProjectRefV1["source"] | null
): string | null {
  if (!projectId || !projectSource) return null;
  const q = new URLSearchParams({
    projectId,
    source: projectSource,
    date,
  });
  return `/field-check-v1?${q.toString()}`;
}

function resolveFieldCheckProgress(
  date: string,
  projectId: string | null,
  projectSource: ProjectRefV1["source"] | null
): { checked: number; total: number } | null {
  if (!projectId || !projectSource) return null;
  return getFieldCheckProgressV1({ source: projectSource, projectId }, date);
}

function rowToDeparture(r: Record<string, unknown>): ScheduleDayDepartureV1 {
  const departureTime = String(r.departure_time);
  const reminderMinutesBefore = Number(r.reminder_minutes_before ?? DEFAULT_REMINDER_MINUTES);
  const date = String(r.departure_date);
  const projectId = r.project_id != null ? String(r.project_id) : null;
  const projectSource =
    r.project_source === "business" || r.project_source === "survey" ? r.project_source : null;
  return {
    id: String(r.id),
    date,
    projectId,
    projectSource,
    firstEventId: r.first_event_id != null ? String(r.first_event_id) : null,
    eventTitle: r.event_title != null ? String(r.event_title) : null,
    departureTime,
    reminderMinutesBefore,
    reminderEnabled: Number(r.reminder_enabled ?? 1) === 1,
    reminderTime: calcReminderTime(departureTime, reminderMinutesBefore),
    reminderSentAt: r.reminder_sent_at != null ? String(r.reminder_sent_at) : null,
    travelDurationMin: r.travel_duration_min != null ? Number(r.travel_duration_min) : null,
    travelDurationSource:
      r.travel_duration_source === "api" ||
      r.travel_duration_source === "mock" ||
      r.travel_duration_source === "none"
        ? r.travel_duration_source
        : null,
    fieldCheckUrl: buildFieldCheckUrl(date, projectId, projectSource),
    fieldCheckProgress: resolveFieldCheckProgress(date, projectId, projectSource),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

async function computeTravelToFirstSite(
  date: string,
  events: ScheduleEvent[],
  dispatch: DayDispatch | null
): Promise<{ minutes: number; source: MapsDurationSource }> {
  let enriched = dispatch;
  if (enriched) {
    enriched = await enrichDispatchLegDurations(enriched);
  }
  const blocks = await buildDayTravelBlocks(date, enriched, events);
  const first = blocks.find((b) => b.kind === "current_to_site");
  if (first?.durationMin != null) {
    return { minutes: first.durationMin, source: first.durationSource };
  }
  return { minutes: 20, source: "mock" };
}

export async function buildDepartureContext(date: string): Promise<{
  events: ScheduleEvent[];
  dispatch: DayDispatch | null;
  firstSite: FirstSiteOfDay | null;
  travel: { minutes: number; source: MapsDurationSource };
}> {
  const events = await loadCalendarEventsForDate(date);
  let dispatch = buildDayDispatch(date, events);
  if (dispatch) {
    dispatch = await enrichDispatchLegDurations(dispatch);
  }
  const firstSite = resolveFirstSiteOfDay(events, dispatch);
  const travel = await computeTravelToFirstSite(date, events, dispatch);
  return { events, dispatch, firstSite, travel };
}

export function getDepartureByDate(date: string): ScheduleDayDepartureV1 | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const row = getDatabase()
    .prepare(`SELECT * FROM schedule_day_departures WHERE departure_date = ?`)
    .get(date) as Record<string, unknown> | undefined;
  return row ? rowToDeparture(row) : null;
}

export function getDepartureById(id: string): ScheduleDayDepartureV1 | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM schedule_day_departures WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToDeparture(row) : null;
}

function syncDayDepartureTravel(
  existing: ScheduleDayDepartureV1,
  firstSite: FirstSiteOfDay,
  travel: { minutes: number; source: MapsDurationSource }
): ScheduleDayDepartureV1 {
  const prevTravel = existing.travelDurationMin ?? 20;
  const autoFromPrev = calcDefaultDepartureTime(firstSite.startTime, prevTravel);
  const autoFromNew = calcDefaultDepartureTime(firstSite.startTime, travel.minutes);
  const departureStillAuto = existing.departureTime === autoFromPrev;
  const travelChanged =
    existing.travelDurationMin !== travel.minutes ||
    existing.travelDurationSource !== travel.source;
  const contextChanged =
    existing.firstEventId !== firstSite.firstEventId ||
    existing.projectId !== firstSite.projectId ||
    existing.projectSource !== firstSite.projectSource ||
    existing.eventTitle !== firstSite.eventTitle;

  if (!travelChanged && !contextChanged) return existing;

  const departureTime = departureStillAuto ? autoFromNew : existing.departureTime;
  const now = new Date().toISOString();

  getDatabase()
    .prepare(
      `UPDATE schedule_day_departures SET
        project_id = ?,
        project_source = ?,
        first_event_id = ?,
        event_title = ?,
        departure_time = ?,
        travel_duration_min = ?,
        travel_duration_source = ?,
        updated_at = ?
       WHERE id = ?`
    )
    .run(
      firstSite.projectId,
      firstSite.projectSource,
      firstSite.firstEventId,
      firstSite.eventTitle,
      departureTime,
      travel.minutes,
      travel.source,
      now,
      existing.id
    );

  return getDepartureByDate(existing.date)!;
}

export async function ensureDayDeparture(date: string): Promise<ScheduleDayDepartureV1 | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const { firstSite, travel } = await buildDepartureContext(date);
  if (!firstSite) return getDepartureByDate(date);

  const existing = getDepartureByDate(date);
  if (existing) return syncDayDepartureTravel(existing, firstSite, travel);

  const now = new Date().toISOString();
  const id = uuid();
  const departureTime = calcDefaultDepartureTime(firstSite.startTime, travel.minutes);

  getDatabase()
    .prepare(
      `INSERT INTO schedule_day_departures (
        id, departure_date, project_id, project_source, first_event_id, event_title,
        departure_time, reminder_minutes_before, reminder_enabled, reminder_sent_at,
        travel_duration_min, travel_duration_source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?, ?, ?)`
    )
    .run(
      id,
      date,
      firstSite.projectId,
      firstSite.projectSource,
      firstSite.firstEventId,
      firstSite.eventTitle,
      departureTime,
      DEFAULT_REMINDER_MINUTES,
      travel.minutes,
      travel.source,
      now,
      now
    );

  return getDepartureByDate(date);
}

export function updateDayDeparture(
  id: string,
  patch: {
    departureTime?: string;
    reminderMinutesBefore?: number;
    reminderEnabled?: boolean;
    reminderSentAt?: string | null;
  }
): ScheduleDayDepartureV1 | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM schedule_day_departures WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;

  const departureTime =
    patch.departureTime != null && /^\d{2}:\d{2}$/.test(patch.departureTime)
      ? patch.departureTime
      : String(row.departure_time);
  const reminderMinutesBefore =
    patch.reminderMinutesBefore != null && patch.reminderMinutesBefore >= 0
      ? Math.min(180, Math.trunc(patch.reminderMinutesBefore))
      : Number(row.reminder_minutes_before ?? DEFAULT_REMINDER_MINUTES);
  const reminderEnabled =
    patch.reminderEnabled !== undefined ? (patch.reminderEnabled ? 1 : 0) : Number(row.reminder_enabled ?? 1);
  const reminderSentAt =
    patch.reminderSentAt !== undefined ? patch.reminderSentAt : row.reminder_sent_at != null ? String(row.reminder_sent_at) : null;
  const now = new Date().toISOString();

  getDatabase()
    .prepare(
      `UPDATE schedule_day_departures SET
        departure_time = ?,
        reminder_minutes_before = ?,
        reminder_enabled = ?,
        reminder_sent_at = ?,
        updated_at = ?
       WHERE id = ?`
    )
    .run(departureTime, reminderMinutesBefore, reminderEnabled, reminderSentAt, now, id);

  return getDepartureByDate(String(row.departure_date));
}

export function buildDepartureNotificationPayload(
  departure: ScheduleDayDepartureV1
): { title: string; body: string; url: string } {
  const title = "🚐 出発準備";
  const site = departure.eventTitle ?? "最初の現場";
  const body = `今日の最初の現場「${site}」\n材料チェックを確認してください。`;
  const url =
    departure.fieldCheckUrl ??
    (departure.projectId && departure.projectSource
      ? buildFieldCheckUrl(departure.date, departure.projectId, departure.projectSource)!
      : `/schedule-v1/day?date=${departure.date}`);
  return { title, body, url };
}

export async function getTodayDepartureSummary(): Promise<ScheduleDayDepartureV1 | null> {
  const today = new Date().toISOString().slice(0, 10);
  return ensureDayDeparture(today);
}
