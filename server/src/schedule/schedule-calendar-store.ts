/** Google Calendar 同期イベントのローカルキャッシュ */

import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { buildGoogleEventLocalId } from "./google-calendar-target-calendars.js";
import type { ScheduleEvent } from "./schedule-types.js";

import type { GoogleCalendarSafeLog } from "./google-calendar-safe-log.js";

export interface CalendarSyncMeta {
  lastSyncedAt: string | null;
  eventCount: number;
  rangeStart: string | null;
  rangeEnd: string | null;
  lastSyncStatus?: "success" | "failed" | null;
  lastSyncError?: string | null;
  lastSyncSafeLog?: GoogleCalendarSafeLog | null;
  lastSyncCreated?: number;
  lastSyncUpdated?: number;
  lastSyncSkipped?: number;
  lastSyncFailed?: number;
}

export interface CalendarUpsertStats {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
}

function rowToEvent(r: Record<string, unknown>): ScheduleEvent {
  return {
    id: String(r.id),
    date: String(r.event_date),
    title: String(r.title),
    category: r.category as ScheduleEvent["category"],
    source: r.source as ScheduleEvent["source"],
    externalId: r.external_id ? String(r.external_id) : null,
    startTime: r.start_time ? String(r.start_time) : null,
    endTime: r.end_time ? String(r.end_time) : null,
    allDay: Boolean(r.all_day),
    location: r.location ? String(r.location) : null,
    description: r.description ? String(r.description) : null,
    calendarId: r.calendar_id ? String(r.calendar_id) : null,
    calendarColor: r.calendar_color ? String(r.calendar_color) : null,
    calendarSummary: r.calendar_summary ? String(r.calendar_summary) : null,
  };
}

/** calendarId + Google event.id でローカル主キーを決定 */
export function resolveScheduleEventLocalId(ev: ScheduleEvent): string {
  if (ev.calendarId && ev.externalId) {
    return buildGoogleEventLocalId(ev.calendarId, ev.externalId);
  }
  if (ev.id?.trim()) return ev.id.trim();
  return uuid();
}

const UPSERT_SQL = `INSERT INTO schedule_calendar_events
 (id, external_id, event_date, title, category, source, start_time, end_time, all_day, location, description, calendar_id, calendar_color, calendar_summary, synced_at)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
 ON CONFLICT(id) DO UPDATE SET
   external_id = excluded.external_id,
   event_date = excluded.event_date,
   title = excluded.title,
   category = excluded.category,
   source = excluded.source,
   start_time = excluded.start_time,
   end_time = excluded.end_time,
   all_day = excluded.all_day,
   location = excluded.location,
   description = excluded.description,
   calendar_id = excluded.calendar_id,
   calendar_color = excluded.calendar_color,
   calendar_summary = excluded.calendar_summary,
   synced_at = datetime('now')`;

export function listCachedCalendarEvents(startDate: string, endDate: string): ScheduleEvent[] {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM schedule_calendar_events
       WHERE event_date >= ? AND event_date <= ?
       ORDER BY event_date ASC, start_time ASC`
    )
    .all(startDate, endDate) as Record<string, unknown>[];
  return rows.map(rowToEvent);
}

export function hasCachedCalendarEvents(): boolean {
  const row = getDatabase()
    .prepare(`SELECT COUNT(*) AS c FROM schedule_calendar_events`)
    .get() as { c: number };
  return row.c > 0;
}

function recordCalendarSyncSuccessMeta(
  startDate: string,
  endDate: string,
  stats: CalendarUpsertStats
): void {
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT OR REPLACE INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(
      "schedule_calendar_sync_meta",
      JSON.stringify({
        lastSyncedAt: now,
        eventCount: stats.created + stats.updated,
        rangeStart: startDate,
        rangeEnd: endDate,
        lastSyncStatus: stats.failed > 0 && stats.created + stats.updated === 0 ? "failed" : "success",
        lastSyncError: null,
        lastSyncSafeLog: null,
        lastSyncCreated: stats.created,
        lastSyncUpdated: stats.updated,
        lastSyncSkipped: stats.skipped,
        lastSyncFailed: stats.failed,
      })
    );
}

/** 同期範囲の予定を UPSERT（DELETE+INSERT では重複 id で落ちるため） */
export function upsertCachedCalendarEvents(
  startDate: string,
  endDate: string,
  events: ScheduleEvent[]
): CalendarUpsertStats {
  const db = getDatabase();
  const stats: CalendarUpsertStats = {
    fetched: events.length,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };

  const existsStmt = db.prepare(`SELECT 1 AS ok FROM schedule_calendar_events WHERE id = ? LIMIT 1`);
  const upsert = db.prepare(UPSERT_SQL);

  for (const raw of events) {
    if (!raw.title?.trim() || !raw.date?.trim()) {
      stats.skipped += 1;
      continue;
    }
    const ev: ScheduleEvent = { ...raw, id: resolveScheduleEventLocalId(raw) };
    try {
      const existed = Boolean(existsStmt.get(ev.id));
      upsert.run(
        ev.id,
        ev.externalId ?? null,
        ev.date,
        ev.title,
        ev.category,
        ev.source,
        ev.startTime ?? null,
        ev.endTime ?? null,
        ev.allDay ? 1 : 0,
        ev.location ?? null,
        ev.description ?? null,
        ev.calendarId ?? null,
        ev.calendarColor ?? null,
        ev.calendarSummary ?? null
      );
      if (existed) stats.updated += 1;
      else stats.created += 1;
    } catch (e) {
      stats.failed += 1;
      console.error("[schedule-calendar-store] upsert failed", {
        id: ev.id,
        calendarId: ev.calendarId,
        externalId: ev.externalId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (stats.created + stats.updated > 0 || stats.failed === 0) {
    recordCalendarSyncSuccessMeta(startDate, endDate, stats);
  }

  return stats;
}

/** @deprecated upsertCachedCalendarEvents を使用 */
export function replaceCachedCalendarEvents(
  startDate: string,
  endDate: string,
  events: ScheduleEvent[]
): number {
  const stats = upsertCachedCalendarEvents(startDate, endDate, events);
  return stats.created + stats.updated;
}

export function recordCalendarSyncFailure(
  errorMessage: string,
  safeLog?: GoogleCalendarSafeLog | null
): void {
  const prev = getCalendarSyncMeta();
  getDatabase()
    .prepare(
      `INSERT OR REPLACE INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(
      "schedule_calendar_sync_meta",
      JSON.stringify({
        ...prev,
        lastSyncStatus: "failed",
        lastSyncError: errorMessage,
        lastSyncSafeLog: safeLog ?? prev.lastSyncSafeLog ?? null,
      })
    );
}

export function getCalendarSyncMeta(): CalendarSyncMeta {
  const row = getDatabase()
    .prepare(`SELECT value_json FROM platform_settings WHERE key = ?`)
    .get("schedule_calendar_sync_meta") as { value_json: string } | undefined;
  if (!row) {
    return { lastSyncedAt: null, eventCount: 0, rangeStart: null, rangeEnd: null };
  }
  try {
    const parsed = JSON.parse(row.value_json) as CalendarSyncMeta;
    return parsed;
  } catch {
    return { lastSyncedAt: null, eventCount: 0, rangeStart: null, rangeEnd: null };
  }
}

export const GOOGLE_CALENDAR_DUPLICATE_SYNC_ERROR_UI =
  "Googleカレンダー同期に失敗しました。\n予定の重複保存エラーです。再同期してください。";

export function isScheduleCalendarDuplicateError(message: string): boolean {
  return /UNIQUE constraint failed.*schedule_calendar_events|SQLITE_CONSTRAINT.*schedule_calendar_events/i.test(
    message
  );
}

export function formatScheduleCalendarDuplicateErrorForUi(message: string): string {
  if (isScheduleCalendarDuplicateError(message)) {
    return GOOGLE_CALENDAR_DUPLICATE_SYNC_ERROR_UI;
  }
  return message;
}
