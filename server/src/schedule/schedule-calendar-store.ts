/** Google Calendar 同期イベントのローカルキャッシュ */

import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
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
  };
}

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

export function replaceCachedCalendarEvents(
  startDate: string,
  endDate: string,
  events: ScheduleEvent[]
): number {
  const db = getDatabase();
  const tx = db.transaction(() => {
    db.prepare(
      `DELETE FROM schedule_calendar_events WHERE event_date >= ? AND event_date <= ?`
    ).run(startDate, endDate);
    const insert = db.prepare(
      `INSERT INTO schedule_calendar_events
       (id, external_id, event_date, title, category, source, start_time, end_time, all_day, location, description, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    );
    const now = new Date().toISOString();
    for (const ev of events) {
      insert.run(
        ev.id || uuid(),
        ev.externalId ?? null,
        ev.date,
        ev.title,
        ev.category,
        ev.source,
        ev.startTime ?? null,
        ev.endTime ?? null,
        ev.allDay ? 1 : 0,
        ev.location ?? null,
        ev.description ?? null
      );
    }
    db.prepare(
      `INSERT OR REPLACE INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    ).run(
      "schedule_calendar_sync_meta",
      JSON.stringify({
        lastSyncedAt: now,
        eventCount: events.length,
        rangeStart: startDate,
        rangeEnd: endDate,
        lastSyncStatus: "success",
        lastSyncError: null,
        lastSyncSafeLog: null,
      })
    );
  });
  tx();
  return events.length;
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
