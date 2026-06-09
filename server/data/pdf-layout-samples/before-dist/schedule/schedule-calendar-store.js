/** Google Calendar 同期イベントのローカルキャッシュ */
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
function rowToEvent(r) {
    return {
        id: String(r.id),
        date: String(r.event_date),
        title: String(r.title),
        category: r.category,
        source: r.source,
        externalId: r.external_id ? String(r.external_id) : null,
        startTime: r.start_time ? String(r.start_time) : null,
        endTime: r.end_time ? String(r.end_time) : null,
        allDay: Boolean(r.all_day),
        location: r.location ? String(r.location) : null,
        description: r.description ? String(r.description) : null,
    };
}
export function listCachedCalendarEvents(startDate, endDate) {
    const rows = getDatabase()
        .prepare(`SELECT * FROM schedule_calendar_events
       WHERE event_date >= ? AND event_date <= ?
       ORDER BY event_date ASC, start_time ASC`)
        .all(startDate, endDate);
    return rows.map(rowToEvent);
}
export function hasCachedCalendarEvents() {
    const row = getDatabase()
        .prepare(`SELECT COUNT(*) AS c FROM schedule_calendar_events`)
        .get();
    return row.c > 0;
}
export function replaceCachedCalendarEvents(startDate, endDate, events) {
    const db = getDatabase();
    const tx = db.transaction(() => {
        db.prepare(`DELETE FROM schedule_calendar_events WHERE event_date >= ? AND event_date <= ?`).run(startDate, endDate);
        const insert = db.prepare(`INSERT INTO schedule_calendar_events
       (id, external_id, event_date, title, category, source, start_time, end_time, all_day, location, description, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`);
        const now = new Date().toISOString();
        for (const ev of events) {
            insert.run(ev.id || uuid(), ev.externalId ?? null, ev.date, ev.title, ev.category, ev.source, ev.startTime ?? null, ev.endTime ?? null, ev.allDay ? 1 : 0, ev.location ?? null, ev.description ?? null);
        }
        db.prepare(`INSERT OR REPLACE INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`).run("schedule_calendar_sync_meta", JSON.stringify({
            lastSyncedAt: now,
            eventCount: events.length,
            rangeStart: startDate,
            rangeEnd: endDate,
        }));
    });
    tx();
    return events.length;
}
export function getCalendarSyncMeta() {
    const row = getDatabase()
        .prepare(`SELECT value_json FROM platform_settings WHERE key = ?`)
        .get("schedule_calendar_sync_meta");
    if (!row) {
        return { lastSyncedAt: null, eventCount: 0, rangeStart: null, rangeEnd: null };
    }
    try {
        const parsed = JSON.parse(row.value_json);
        return parsed;
    }
    catch {
        return { lastSyncedAt: null, eventCount: 0, rangeStart: null, rangeEnd: null };
    }
}
