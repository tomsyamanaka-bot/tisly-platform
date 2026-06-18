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

export function isCalendarReadable(c: GoogleCalendarListItem): boolean {
  const role = (c.accessRole ?? "").toLowerCase();
  return role === "owner" || role === "writer" || role === "reader" || c.writable === true;
}

export function filterWritableCalendars(calendars: GoogleCalendarListItem[]): GoogleCalendarListItem[] {
  return calendars.filter(isCalendarWritable);
}

export function filterReadableCalendars(calendars: GoogleCalendarListItem[]): GoogleCalendarListItem[] {
  return calendars.filter(isCalendarReadable);
}

export function filterGoogleSelectedCalendars(calendars: GoogleCalendarListItem[]): GoogleCalendarListItem[] {
  return calendars.filter((c) => c.selected === true);
}

function pickAllowedIds(ids: string[], allowedIds: Set<string>, fallback: string): string[] {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  const allowed = unique.filter((id) => allowedIds.has(id));
  if (allowed.length) return allowed;
  const first = [...allowedIds][0];
  return first ? [first] : [fallback];
}

/** Google → TiSLY 取得対象（読取専用カレンダーも含む） */
export function resolvePullTargetCalendarIds(
  settings: GoogleCalendarSettingsV1,
  calendars: GoogleCalendarListItem[]
): string[] {
  const readable = filterReadableCalendars(calendars);
  const readableIds = new Set(readable.map((c) => c.id));
  const fallback = settings.calendarId?.trim() || "primary";

  switch (settings.syncMode) {
    case "google_selected":
      return pickAllowedIds(
        filterGoogleSelectedCalendars(readable).map((c) => c.id),
        readableIds,
        fallback
      );
    case "primary_only": {
      const primary = readable.find((c) => c.primary) ?? readable.find((c) => c.id === "primary");
      return primary ? [primary.id] : pickAllowedIds([fallback], readableIds, fallback);
    }
    case "multiple": {
      const ids = settings.calendarIds?.length ? settings.calendarIds : [fallback];
      return pickAllowedIds(ids, readableIds, fallback);
    }
    case "all_writable":
      return readable.map((c) => c.id);
    case "selected_only":
    default:
      return pickAllowedIds([fallback], readableIds, fallback);
  }
}

/** TiSLY → Google 書き込み対象（書き込み可能カレンダーのみ） */
export function resolvePushTargetCalendarIds(
  settings: GoogleCalendarSettingsV1,
  calendars: GoogleCalendarListItem[]
): string[] {
  const writable = filterWritableCalendars(calendars);
  const writableIds = new Set(writable.map((c) => c.id));
  const fallback = settings.calendarId?.trim() || "primary";

  switch (settings.syncMode) {
    case "google_selected":
      return pickAllowedIds(
        filterGoogleSelectedCalendars(writable).map((c) => c.id),
        writableIds,
        fallback
      );
    case "primary_only": {
      const primary = writable.find((c) => c.primary) ?? writable.find((c) => c.id === "primary");
      return primary ? [primary.id] : pickAllowedIds([fallback], writableIds, fallback);
    }
    case "multiple": {
      const ids = settings.calendarIds?.length ? settings.calendarIds : [fallback];
      return pickAllowedIds(ids, writableIds, fallback);
    }
    case "all_writable":
      return writable.map((c) => c.id);
    case "selected_only":
    default:
      return pickAllowedIds([fallback], writableIds, fallback);
  }
}

/** @deprecated pull/push 共通 — pull 側と同じ */
export function resolveTargetCalendarIds(
  settings: GoogleCalendarSettingsV1,
  calendars: GoogleCalendarListItem[]
): string[] {
  return resolvePullTargetCalendarIds(settings, calendars);
}

export function calendarMetaMap(
  calendars: GoogleCalendarListItem[]
): Map<string, GoogleCalendarListItem> {
  return new Map(calendars.map((c) => [c.id, c]));
}

export function formatTargetCalendarNames(
  ids: string[],
  meta: Map<string, GoogleCalendarListItem>
): string[] {
  return ids.map((id) => meta.get(id)?.summary ?? id);
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
  google_selected: "Google表示ONと同じ",
};

export function defaultSyncModeFromSettings(settings: GoogleCalendarSettingsV1): GoogleCalendarSyncMode {
  return settings.syncMode ?? "google_selected";
}

export function resolveTargetCalendarIdsFromSettings(
  calendars: GoogleCalendarListItem[]
): string[] {
  return resolvePullTargetCalendarIds(getGoogleCalendarSettingsV1(), calendars);
}

export function resolvePullTargetCalendarIdsFromSettings(
  calendars: GoogleCalendarListItem[]
): string[] {
  return resolvePullTargetCalendarIds(getGoogleCalendarSettingsV1(), calendars);
}
