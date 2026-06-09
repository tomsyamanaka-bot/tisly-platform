import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { fetchCalendarEvents } from "../services/googleCalendar.js";
import {
  hasCachedCalendarEvents,
  listCachedCalendarEvents,
} from "./schedule-calendar-store.js";
import type {
  DayAvailability,
  ScheduleDayCard,
  ScheduleEvent,
  ScheduleMonthDayCell,
  ScheduleMonthView,
  ScheduleThreeWeekBlock,
  ScheduleWeekSummary,
  ScheduleWeekView,
  UnavailableDay,
} from "./schedule-types.js";
import { SCHEDULE_CATEGORY_META } from "./schedule-types.js";
import { buildDayDispatch } from "./route-planner-service.js";
import { fetchDayWeather } from "./weather-service.js";
import type { ScheduleDayDetail } from "./schedule-types.js";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function parseOffset(raw: unknown): number {
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-52, Math.min(52, Math.trunc(n)));
}

function weekStartFromOffset(offset: number): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff + offset * 7);
  return monday.toISOString().slice(0, 10);
}

function weekLabel(offset: number): string {
  if (offset === 0) return "今週";
  if (offset === -1) return "前週";
  if (offset === 1) return "来週";
  if (offset < 0) return `${-offset}週前`;
  return `${offset}週後`;
}

export function calcAvailability(eventCount: number, unavailable: boolean): DayAvailability {
  if (unavailable) {
    return { stars: "現場不可", label: "現場不可", level: "unavailable" };
  }
  if (eventCount === 0) return { stars: "★★★★★", label: "空いています", level: "free" };
  if (eventCount <= 2) return { stars: "★★★★☆", label: "余裕あり", level: "light" };
  if (eventCount <= 4) return { stars: "★★☆☆☆", label: "やや混雑", level: "busy" };
  return { stars: "満車", label: "いっぱい", level: "full" };
}

function rowToUnavailable(r: Record<string, unknown>): UnavailableDay {
  return {
    id: String(r.id),
    date: String(r.unavailable_date),
    reason: String(r.reason ?? ""),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function listUnavailableDays(startDate: string, endDate: string): UnavailableDay[] {
  const rows = getDatabase()
    .prepare(
      `SELECT id, unavailable_date, reason, created_at, updated_at
       FROM schedule_unavailable_days
       WHERE unavailable_date >= ? AND unavailable_date <= ?
       ORDER BY unavailable_date ASC`
    )
    .all(startDate, endDate) as Record<string, unknown>[];
  return rows.map(rowToUnavailable);
}

function buildDayCard(
  date: string,
  events: ScheduleEvent[],
  unavailableMap: Map<string, UnavailableDay>
): ScheduleDayCard {
  const d = new Date(`${date}T12:00:00`);
  const dayEvents = events.filter((e) => e.date === date);
  const unavailable = unavailableMap.get(date) ?? null;
  return {
    date,
    weekday: WEEKDAY_LABELS[d.getDay()],
    weekdayIndex: d.getDay(),
    eventCount: dayEvents.length,
    events: dayEvents,
    unavailable,
    availability: calcAvailability(dayEvents.length, Boolean(unavailable)),
  };
}

function buildSummary(days: ScheduleDayCard[]): ScheduleWeekSummary {
  let constructionCount = 0;
  let officeCount = 0;
  let familyCount = 0;
  let unavailableDays = 0;
  let freeDays = 0;
  let totalEvents = 0;
  for (const day of days) {
    if (day.unavailable) unavailableDays += 1;
    if (day.availability.level === "free") freeDays += 1;
    totalEvents += day.eventCount;
    for (const ev of day.events) {
      if (ev.category === "construction") constructionCount += 1;
      else if (ev.category === "office") officeCount += 1;
      else if (ev.category === "family") familyCount += 1;
    }
  }
  return {
    constructionCount,
    officeCount,
    familyCount,
    unavailableDays,
    freeDays,
    totalEvents,
  };
}

async function loadCalendarEvents(startDate: string, endDate: string): Promise<ScheduleEvent[]> {
  if (hasCachedCalendarEvents()) {
    return listCachedCalendarEvents(startDate, endDate);
  }
  return fetchCalendarEvents(startDate, endDate);
}

export async function getScheduleWeekView(offsetRaw?: unknown): Promise<ScheduleWeekView> {
  const offset = parseOffset(offsetRaw);
  const startDate = weekStartFromOffset(offset);
  const endDate = addDays(startDate, 6);
  const events = await loadCalendarEvents(startDate, endDate);
  const unavailable = listUnavailableDays(startDate, endDate);
  const unavailableMap = new Map(unavailable.map((u) => [u.date, u]));
  const days: ScheduleDayCard[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(buildDayCard(addDays(startDate, i), events, unavailableMap));
  }
  return {
    offset,
    label: weekLabel(offset),
    startDate,
    endDate,
    days,
    summary: buildSummary(days),
  };
}

export async function getScheduleThreeWeekView(offsetRaw?: unknown): Promise<{
  offset: number;
  blocks: ScheduleThreeWeekBlock[];
}> {
  const offset = parseOffset(offsetRaw);
  const startDate = weekStartFromOffset(offset);
  const rangeEnd = addDays(startDate, 20);
  const allEvents = await loadCalendarEvents(startDate, rangeEnd);
  const unavailable = listUnavailableDays(startDate, rangeEnd);
  const unavailableMap = new Map(unavailable.map((u) => [u.date, u]));
  const blocks: ScheduleThreeWeekBlock[] = [];
  for (let w = 0; w < 3; w++) {
    const blockStart = addDays(startDate, w * 7);
    const blockEnd = addDays(blockStart, 6);
    const blockEvents = allEvents.filter((e) => e.date >= blockStart && e.date <= blockEnd);
    const constructionCount = blockEvents.filter((e) => e.category === "construction").length;
    const days: ScheduleDayCard[] = [];
    for (let i = 0; i < 7; i++) {
      days.push(buildDayCard(addDays(blockStart, i), allEvents, unavailableMap));
    }
    const m1 = Number(blockStart.slice(5, 7));
    const d1 = Number(blockStart.slice(8, 10));
    const m2 = Number(blockEnd.slice(5, 7));
    const d2 = Number(blockEnd.slice(8, 10));
    blocks.push({
      startDate: blockStart,
      endDate: blockEnd,
      label: `${m1}/${d1}〜${m2}/${d2}`,
      constructionCount,
      totalEvents: blockEvents.length,
      days,
    });
  }
  return { offset, blocks };
}

export async function getScheduleDayDetail(
  dateRaw: unknown,
  opts?: { location?: string }
): Promise<ScheduleDayDetail | null> {
  const date = String(dateRaw ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const events = await loadCalendarEvents(date, date);
  const unavailable = listUnavailableDays(date, date);
  const unavailableMap = new Map(unavailable.map((u) => [u.date, u]));
  const day = buildDayCard(date, events, unavailableMap);
  const weather = await fetchDayWeather(date, { location: opts?.location });
  const dispatch = buildDayDispatch(date, day.events);
  const firstSite = dispatch?.stops?.[0]?.address ?? day.events.find((e) => e.location)?.location ?? null;
  const mapsUrl = firstSite
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(firstSite)}`
    : null;
  const dayNote = getScheduleDayNote(date);
  const memo = dayNote?.note?.trim() ? dayNote.note : null;
  return { day, weather, dispatch, memo, mapsUrl };
}

export interface ScheduleDayNote {
  date: string;
  note: string;
  updatedAt: string;
}

export function getScheduleDayNote(dateRaw: unknown): ScheduleDayNote | null {
  const date = String(dateRaw ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const row = getDatabase()
    .prepare(`SELECT note_date, note, updated_at FROM schedule_day_notes WHERE note_date = ?`)
    .get(date) as { note_date: string; note: string; updated_at: string } | undefined;
  if (!row) return null;
  return { date: row.note_date, note: row.note ?? "", updatedAt: row.updated_at };
}

export function upsertScheduleDayNote(dateRaw: unknown, noteRaw: unknown): ScheduleDayNote {
  const date = String(dateRaw ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("valid date required (YYYY-MM-DD)");
  const note = String(noteRaw ?? "");
  const existing = getDatabase()
    .prepare(`SELECT note_date FROM schedule_day_notes WHERE note_date = ?`)
    .get(date) as { note_date: string } | undefined;
  if (existing) {
    getDatabase()
      .prepare(`UPDATE schedule_day_notes SET note = ?, updated_at = datetime('now') WHERE note_date = ?`)
      .run(note, date);
  } else {
    getDatabase()
      .prepare(
        `INSERT INTO schedule_day_notes (note_date, note, created_at, updated_at)
         VALUES (?, ?, datetime('now'), datetime('now'))`
      )
      .run(date, note);
  }
  const saved = getScheduleDayNote(date);
  if (!saved) throw new Error("failed to save day note");
  return saved;
}

export async function getScheduleMonthView(yearRaw: unknown, monthRaw: unknown): Promise<ScheduleMonthView> {
  const year = Math.max(2020, Math.min(2100, Number(yearRaw) || new Date().getFullYear()));
  const month = Math.max(1, Math.min(12, Number(monthRaw) || new Date().getMonth() + 1));
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const last = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const events = await loadCalendarEvents(first, last);
  const unavailable = listUnavailableDays(first, last);
  const unavailableMap = new Map(unavailable.map((u) => [u.date, u]));

  const firstWd = new Date(`${first}T12:00:00`).getDay();
  const gridStart = addDays(first, -firstWd);
  const weeks: ScheduleMonthDayCell[][] = [];
  let cursor = gridStart;
  for (let w = 0; w < 6; w++) {
    const row: ScheduleMonthDayCell[] = [];
    for (let d = 0; d < 7; d++) {
      const iso = cursor;
      const dayEvents = events.filter((e) => e.date === iso);
      const catCounts = new Map<string, number>();
      for (const ev of dayEvents) {
        catCounts.set(ev.category, (catCounts.get(ev.category) ?? 0) + 1);
      }
      const categories = [...catCounts.entries()].map(([category, count]) => {
        const meta = SCHEDULE_CATEGORY_META[category as keyof typeof SCHEDULE_CATEGORY_META];
        return {
          category: category as ScheduleMonthDayCell["categories"][0]["category"],
          icon: meta?.icon ?? "📌",
          label: meta?.label ?? category,
          count,
        };
      });
      const visibleCats = 3;
      const extraCount = Math.max(0, categories.length - visibleCats);
      row.push({
        date: iso,
        dayOfMonth: Number(iso.slice(8, 10)),
        isCurrentMonth: iso.slice(0, 7) === first.slice(0, 7),
        categories: categories.slice(0, visibleCats),
        extraCount: extraCount + Math.max(0, dayEvents.length - categories.reduce((s, c) => s + c.count, 0)),
        events: dayEvents,
        unavailable: unavailableMap.get(iso) ?? null,
      });
      cursor = addDays(cursor, 1);
    }
    weeks.push(row);
    if (cursor > last && w >= 4) break;
  }
  return { year, month, label: `${year}年${month}月`, weeks };
}

export async function getScheduleSummary(range: string, offsetRaw?: unknown): Promise<ScheduleWeekSummary> {
  if (range === "week") {
    const week = await getScheduleWeekView(offsetRaw);
    return week.summary;
  }
  const week = await getScheduleWeekView(0);
  return week.summary;
}

export function createUnavailableDay(input: { date: string; reason: string }): UnavailableDay {
  const date = input.date?.trim();
  const reason = input.reason?.trim();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("valid date required (YYYY-MM-DD)");
  if (!reason) throw new Error("reason required");
  const existing = getDatabase()
    .prepare(`SELECT id FROM schedule_unavailable_days WHERE unavailable_date = ?`)
    .get(date) as { id: string } | undefined;
  if (existing) throw new Error("unavailable day already exists for this date");
  const id = uuid();
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO schedule_unavailable_days (id, unavailable_date, reason, created_at, updated_at)
       VALUES (?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(id, date, reason);
  return rowToUnavailable({
    id,
    unavailable_date: date,
    reason,
    created_at: now,
    updated_at: now,
  });
}

export function updateUnavailableDay(id: string, patch: { reason?: string }): UnavailableDay | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM schedule_unavailable_days WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  const reason = patch.reason?.trim() ?? String(row.reason);
  getDatabase()
    .prepare(`UPDATE schedule_unavailable_days SET reason = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(reason, id);
  return rowToUnavailable({ ...row, reason });
}

export function deleteUnavailableDay(id: string): boolean {
  const r = getDatabase().prepare(`DELETE FROM schedule_unavailable_days WHERE id = ?`).run(id);
  return r.changes > 0;
}
