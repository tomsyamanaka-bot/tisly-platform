/** 同期モードに応じた Google カレンダー ID の解決 */

import type { GoogleCalendarListItem } from "../services/googleOAuthService.js";
import {
  getGoogleCalendarSettingsV1,
  type GoogleCalendarSettingsV1,
  type GoogleCalendarSyncMode,
} from "./google-calendar-sync-store.js";

export function isCalendarWritable(c: GoogleCalendarListItem): boolean {
  if (c.writable === false) return false;
  const role = (c.accessRole ?? "").toLowerCase();
  return role === "owner" || role === "writer";
}

export function filterWritableCalendars(calendars: GoogleCalendarListItem[]): GoogleCalendarListItem[] {
  return calendars.filter(isCalendarWritable);
}

export function resolveTargetCalendarIds(
  settings: GoogleCalendarSettingsV1,
  calendars: GoogleCalendarListItem[]
): string[] {
  const writable = filterWritableCalendars(calendars);
  const writableIds = new Set(writable.map((c) => c.id));
  const fallback = settings.calendarId?.trim() || "primary";

  const pick = (ids: string[]): string[] => {
    const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    const allowed = unique.filter((id) => writableIds.has(id));
    return allowed.length ? allowed : writable.length ? [writable[0].id] : [fallback];
  };

  switch (settings.syncMode) {
    case "primary_only": {
      const primary = writable.find((c) => c.primary) ?? writable.find((c) => c.id === "primary");
      return primary ? [primary.id] : pick([fallback]);
    }
    case "multiple": {
      const ids = settings.calendarIds?.length ? settings.calendarIds : [fallback];
      return pick(ids);
    }
    case "all_writable":
      return writable.map((c) => c.id);
    case "selected_only":
    default:
      return pick([fallback]);
  }
}

export function calendarMetaMap(
  calendars: GoogleCalendarListItem[]
): Map<string, GoogleCalendarListItem> {
  return new Map(calendars.map((c) => [c.id, c]));
}

export function sanitizeCalendarIdForEventId(calendarId: string): string {
  return calendarId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64);
}

export function buildGoogleEventLocalId(calendarId: string, googleEventId: string): string {
  return `gcal-${sanitizeCalendarIdForEventId(calendarId)}-${googleEventId}`;
}

export const SYNC_MODE_LABELS: Record<GoogleCalendarSyncMode, string> = {
  primary_only: "primaryのみ",
  selected_only: "選択カレンダーのみ",
  multiple: "複数カレンダー同期",
  all_writable: "全カレンダー同期",
};

export function defaultSyncModeFromSettings(settings: GoogleCalendarSettingsV1): GoogleCalendarSyncMode {
  return settings.syncMode ?? "selected_only";
}

export function resolveTargetCalendarIdsFromSettings(
  calendars: GoogleCalendarListItem[]
): string[] {
  return resolveTargetCalendarIds(getGoogleCalendarSettingsV1(), calendars);
}
