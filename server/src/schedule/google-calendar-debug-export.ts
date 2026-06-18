/** Google Calendar デバッグ用データ出力 */

import { listGoogleCalendarEventsForId } from "../services/googleCalendar.js";
import {
  assertGoogleCalendarSyncAllowed,
  listGoogleCalendarsDetailed,
  type GoogleCalendarListItem,
} from "../services/googleOAuthService.js";
import {
  filterReadableCalendars,
  resolvePullTargetCalendarIds,
  calendarMetaMap,
  formatTargetCalendarNames,
} from "./google-calendar-target-calendars.js";
import { getGoogleCalendarSettingsV1 } from "./google-calendar-sync-store.js";

export interface GoogleCalendarListDebugItem {
  calendarId: string;
  summary: string;
  primary: boolean;
  selected: boolean;
  accessRole: string;
  backgroundColor: string | null;
}

export interface GoogleCalendarEventDebugItem {
  title: string;
  start: string;
  end: string;
  calendarId: string;
  calendarName: string;
  date: string;
  allDay?: boolean;
}

export function toCalendarListDebugItem(c: GoogleCalendarListItem): GoogleCalendarListDebugItem {
  return {
    calendarId: c.id,
    summary: c.summary,
    primary: c.primary,
    selected: c.selected === true,
    accessRole: c.accessRole,
    backgroundColor: c.backgroundColor ?? null,
  };
}

export async function fetchGoogleCalendarListDebug(): Promise<{
  calendars: GoogleCalendarListDebugItem[];
  usedFallback: boolean;
  syncMode: string;
  pullTargetIds: string[];
  pullTargetNames: string[];
}> {
  const settings = getGoogleCalendarSettingsV1();
  const list = await listGoogleCalendarsDetailed();
  const allCalendars = list.usedFallback ? [list.fallback] : list.calendars;
  const pullIds = resolvePullTargetCalendarIds(settings, allCalendars);
  const meta = calendarMetaMap(allCalendars);
  return {
    calendars: allCalendars.map(toCalendarListDebugItem),
    usedFallback: list.usedFallback,
    syncMode: settings.syncMode,
    pullTargetIds: pullIds,
    pullTargetNames: formatTargetCalendarNames(pullIds, meta),
  };
}

export async function fetchGoogleCalendarEventsDebug(
  startDate: string,
  endDate: string,
  options?: { allReadable?: boolean }
): Promise<{
  events: GoogleCalendarEventDebugItem[];
  calendarCount: number;
  eventCount: number;
}> {
  const guard = assertGoogleCalendarSyncAllowed();
  if (!guard.ok) {
    throw new Error(guard.error);
  }
  const settings = getGoogleCalendarSettingsV1();
  const list = await listGoogleCalendarsDetailed();
  const allCalendars = list.usedFallback ? [list.fallback] : list.calendars;
  const meta = calendarMetaMap(allCalendars);
  const targetIds = options?.allReadable
    ? filterReadableCalendars(allCalendars).map((c) => c.id)
    : resolvePullTargetCalendarIds(settings, allCalendars);

  const events: GoogleCalendarEventDebugItem[] = [];
  for (const calId of targetIds) {
    const cal = meta.get(calId);
    const batch = await listGoogleCalendarEventsForId(calId, startDate, endDate, {
      calendarColor: cal?.backgroundColor ?? null,
      calendarSummary: cal?.summary ?? null,
    });
    for (const ev of batch) {
      const start = ev.allDay
        ? ev.date
        : `${ev.date}T${ev.startTime ?? "00:00"}:00+09:00`;
      const end = ev.allDay
        ? ev.date
        : `${ev.date}T${ev.endTime ?? ev.startTime ?? "00:00"}:00+09:00`;
      events.push({
        title: ev.title,
        start,
        end,
        calendarId: calId,
        calendarName: cal?.summary ?? calId,
        date: ev.date,
        allDay: ev.allDay,
      });
    }
  }
  events.sort((a, b) => {
    if (a.start !== b.start) return a.start.localeCompare(b.start);
    return a.title.localeCompare(b.title, "ja");
  });
  return { events, calendarCount: targetIds.length, eventCount: events.length };
}

export function findDenGenAmiEvents(events: GoogleCalendarEventDebugItem[]): {
  pattern: string;
  matches: GoogleCalendarEventDebugItem[];
  byDayLabel: Array<{ label: string; event: GoogleCalendarEventDebugItem | null }>;
} {
  const pattern = "伝元案件)阿見";
  const matches = events.filter(
    (e) => e.title.includes(pattern) || (e.title.includes("伝元") && e.title.includes("阿見"))
  );
  const dayLabels = ["(1/3日目)", "(2/3日目)", "(3/3日目)"];
  const byDayLabel = dayLabels.map((label) => ({
    label,
    event: matches.find((e) => e.title.includes(label)) ?? null,
  }));
  return { pattern, matches, byDayLabel };
}
