/** Google Calendar ↔ TiSLY 案件 双方向同期 */

import { createSurveyProjectV1 } from "../survey/survey-v1-store.js";
import {
  classifyEventCategory,
  fetchCalendarEvents,
  syncGoogleCalendarEvents,
} from "../services/googleCalendar.js";
import {
  assertGoogleCalendarSyncAllowed,
  createGoogleCalendarEventForSync,
  getGoogleCalendarOAuthStatus,
  hasGoogleCalendarWriteScope,
  listGoogleCalendarsDetailed,
  markGoogleCalendarEventComplete,
  updateGoogleCalendarEventForSync,
  type GoogleCalendarListItem,
} from "../services/googleOAuthService.js";
import {
  PRIMARY_CALENDAR_FALLBACK,
  assertGoogleCalendarSyncRequest,
  type GoogleCalendarSyncRequestBody,
} from "./google-calendar-sync-params.js";
import {
  buildGoogleEventLocalId,
  calendarMetaMap,
  resolveTargetCalendarIds,
  filterWritableCalendars,
} from "./google-calendar-target-calendars.js";
import { replaceCachedCalendarEvents } from "./schedule-calendar-store.js";
import type { ScheduleEvent } from "./schedule-types.js";
import {
  findLinkByGoogleEventId,
  findLinkByProject,
  getGoogleCalendarSettingsV1,
  listSurveyProjectsForPush,
  saveGoogleCalendarSettingsV1,
  touchGoogleCalendarLastSync,
  upsertGoogleCalendarEventLink,
  type GoogleCalendarSettingsV1,
} from "./google-calendar-sync-store.js";
import type { ProjectRefV1 } from "../field-ops/field-ops-types.js";
import { getDatabase } from "../db/database.js";

export interface FullSyncResultV1 {
  mode: "mock" | "real";
  calendarId: string;
  calendarIds: string[];
  syncMode: GoogleCalendarSettingsV1["syncMode"];
  pulled: number;
  pushed: number;
  projectsCreated: number;
  linksUpdated: number;
  startDate: string;
  endDate: string;
}

async function resolveSyncTargetCalendarIds(
  settings: GoogleCalendarSettingsV1
): Promise<{ ids: string[]; meta: Map<string, GoogleCalendarListItem> }> {
  const list = await listGoogleCalendarsDetailed();
  const calendars = list.usedFallback ? [list.fallback] : list.calendars;
  const ids = resolveTargetCalendarIds(settings, calendars);
  return { ids, meta: calendarMetaMap(calendars) };
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function toDateTimeIso(date: string, time: string): string {
  return `${date}T${time}:00+09:00`;
}

function findMatchingSurveyProject(title: string, date: string): string | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT project_id FROM survey_projects
       WHERE survey_date = ? AND status != 'deleted'
         AND (site_name = ? OR customer_name = ? OR site_name LIKE ?)
       ORDER BY updated_at DESC LIMIT 1`
    )
    .get(date, title, title, `%${title.slice(0, 20)}%`) as { project_id?: string } | undefined;
  return row?.project_id ?? null;
}

async function importEventAsProject(
  ev: ScheduleEvent,
  settings: GoogleCalendarSettingsV1
): Promise<{ created: boolean; projectId: string; projectSource: ProjectRefV1["source"] } | null> {
  if (!ev.externalId) return null;
  if (findLinkByGoogleEventId(ev.externalId)) return null;

  const isConstruction = ev.category === "construction" || ev.category === "urgent";
  if (!isConstruction && !settings.autoCreateProjects) return null;

  let projectId = findMatchingSurveyProject(ev.title, ev.date);
  let created = false;
  if (!projectId && settings.autoCreateProjects && isConstruction) {
    const project = createSurveyProjectV1({
      customerCode: "TOMS001",
      customerName: ev.title,
      siteName: ev.title,
      address: ev.location ?? undefined,
      surveyDate: ev.date,
      notes: ev.description ? `Google予定から自動生成\n${ev.description}` : "Google予定から自動生成",
    });
    projectId = project.projectId;
    created = true;
  }
  if (!projectId) return null;

  upsertGoogleCalendarEventLink({
    googleEventId: ev.externalId,
    googleCalendarId: ev.calendarId || settings.calendarId,
    projectSource: "survey",
    projectId,
    scheduleEventId: ev.id,
    linkKind: created ? "from_google" : "linked",
  });
  return { created, projectId, projectSource: "survey" };
}

async function pullFromGoogle(
  startDate: string,
  endDate: string,
  settings: GoogleCalendarSettingsV1,
  targetIds: string[]
): Promise<{ events: ScheduleEvent[]; projectsCreated: number; linksUpdated: number }> {
  const synced = await syncGoogleCalendarEvents(startDate, endDate, targetIds);
  replaceCachedCalendarEvents(startDate, endDate, synced.events);

  let projectsCreated = 0;
  let linksUpdated = 0;
  for (const ev of synced.events) {
    const result = await importEventAsProject(ev, settings);
    if (result?.created) projectsCreated += 1;
    if (result) linksUpdated += 1;
  }
  return { events: synced.events, projectsCreated, linksUpdated };
}

async function pushToGoogle(
  startDate: string,
  endDate: string,
  settings: GoogleCalendarSettingsV1,
  mode: "mock" | "real",
  targetIds: string[],
  meta: Map<string, GoogleCalendarListItem>
): Promise<{ pushed: number; linksUpdated: number }> {
  let pushed = 0;
  let linksUpdated = 0;

  for (const calId of targetIds) {
    const cal = meta.get(calId);
    const candidates = listSurveyProjectsForPush(startDate, endDate, calId);
    for (const p of candidates) {
      const start = toDateTimeIso(p.surveyDate, p.startTime ?? "09:00");
      const end = toDateTimeIso(p.surveyDate, p.endTime ?? "12:00");
      const created = await createGoogleCalendarEventForSync({
        calendarId: calId,
        title: p.title,
        start,
        end,
        location: p.address ?? undefined,
        description: `TiSLY案件: ${p.projectId}`,
      });
      upsertGoogleCalendarEventLink({
        googleEventId: created.eventId,
        googleCalendarId: calId,
        projectSource: "survey",
        projectId: p.projectId,
        linkKind: "to_google",
      });
      pushed += 1;
      linksUpdated += 1;

      if (mode === "real") {
        getDatabase()
          .prepare(
            `INSERT OR REPLACE INTO schedule_calendar_events
             (id, external_id, event_date, title, category, source, start_time, end_time, all_day, location, description, calendar_id, calendar_color, calendar_summary, synced_at)
             VALUES (?, ?, ?, ?, ?, 'google', ?, ?, 0, ?, ?, ?, ?, ?, datetime('now'))`
          )
          .run(
            buildGoogleEventLocalId(calId, created.eventId),
            created.eventId,
            p.surveyDate,
            p.title,
            classifyEventCategory(p.title),
            p.startTime ?? "09:00",
            p.endTime ?? "12:00",
            p.address,
            `TiSLY案件: ${p.projectId}`,
            calId,
            cal?.backgroundColor ?? null,
            cal?.summary ?? null
          );
      }
    }
  }
  return { pushed, linksUpdated };
}

export async function runFullGoogleCalendarSyncV1(
  input?: GoogleCalendarSyncRequestBody
): Promise<FullSyncResultV1> {
  const guard = assertGoogleCalendarSyncAllowed();
  if (!guard.ok) {
    throw new Error(guard.error);
  }
  const validated = assertGoogleCalendarSyncRequest(input ?? {});
  const oauth = getGoogleCalendarOAuthStatus();
  const settings = validated.settings;
  const startDate = validated.startDate;
  const endDate = validated.endDate;

  let pulled = 0;
  let pushed = 0;
  let projectsCreated = 0;
  let linksUpdated = 0;

  const direction = validated.syncDirection;
  const mode = oauth.mode;
  const { ids: targetIds, meta } = await resolveSyncTargetCalendarIds(settings);

  if (direction === "bidirectional" || direction === "pull_only") {
    const pull = await pullFromGoogle(startDate, endDate, settings, targetIds);
    pulled = pull.events.length;
    projectsCreated = pull.projectsCreated;
    linksUpdated += pull.linksUpdated;
  } else {
    const events = await fetchCalendarEvents(startDate, endDate);
    replaceCachedCalendarEvents(startDate, endDate, events);
    pulled = events.length;
  }

  const canPush =
    (direction === "bidirectional" || direction === "push_only") && hasGoogleCalendarWriteScope();
  if (canPush) {
    const push = await pushToGoogle(startDate, endDate, settings, mode, targetIds, meta);
    pushed = push.pushed;
    linksUpdated += push.linksUpdated;
  }

  touchGoogleCalendarLastSync();

  return {
    mode,
    calendarId: settings.calendarId,
    calendarIds: targetIds,
    syncMode: settings.syncMode,
    pulled,
    pushed,
    projectsCreated,
    linksUpdated,
    startDate,
    endDate,
  };
}

export async function fetchGoogleCalendarListV1(): Promise<{
  calendars: GoogleCalendarListItem[];
  allCalendars: GoogleCalendarListItem[];
  usedFallback: boolean;
  warning?: string;
  httpStatus?: number;
}> {
  const result = await listGoogleCalendarsDetailed();
  if (result.usedFallback) {
    saveGoogleCalendarSettingsV1({
      calendarId: result.fallback.id,
      calendarSummary: result.fallback.summary,
    });
    const fallback = { ...result.fallback, writable: true };
    return {
      calendars: [fallback],
      allCalendars: [fallback],
      usedFallback: true,
      warning: result.apiError,
      httpStatus: result.httpStatus,
    };
  }
  const allCalendars = result.calendars;
  const writable = filterWritableCalendars(allCalendars);
  return { calendars: writable, allCalendars, usedFallback: false };
}

export {
  assertGoogleCalendarSyncRequest,
  validateGoogleCalendarSyncRequest,
  GoogleCalendarSyncError,
  PRIMARY_CALENDAR_FALLBACK,
  sendGoogleCalendarSyncError,
  toGoogleCalendarSyncErrorPayload,
} from "./google-calendar-sync-params.js";

export function updateGoogleCalendarSettingsV1(
  patch: Parameters<typeof saveGoogleCalendarSettingsV1>[0]
): GoogleCalendarSettingsV1 {
  return saveGoogleCalendarSettingsV1(patch);
}

export async function reflectProjectCompletionToGoogleCalendar(
  ref: ProjectRefV1,
  completionTimeIso: string
): Promise<{ updated: boolean; mode: "mock" | "real"; eventId?: string }> {
  const link = findLinkByProject(ref);
  if (!link) return { updated: false, mode: getGoogleCalendarOAuthStatus().mode };

  const settings = getGoogleCalendarSettingsV1();
  const timeLabel = new Date(completionTimeIso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  const result = await markGoogleCalendarEventComplete({
    calendarId: link.googleCalendarId || settings.calendarId,
    eventId: link.googleEventId,
    completionNote: `✅ 作業完了 ${timeLabel}`,
  });
  return { updated: true, mode: result.mode, eventId: link.googleEventId };
}

export async function syncProjectScheduleToGoogle(
  ref: ProjectRefV1,
  input: { date: string; title: string; startTime?: string; endTime?: string; location?: string }
): Promise<{ eventId: string; mode: "mock" | "real" }> {
  const settings = getGoogleCalendarSettingsV1();
  const existing = findLinkByProject(ref);
  const start = toDateTimeIso(input.date, input.startTime ?? "09:00");
  const end = toDateTimeIso(input.date, input.endTime ?? "12:00");

  const targetCalendarId = existing?.googleCalendarId || settings.calendarId;

  if (existing) {
    await updateGoogleCalendarEventForSync({
      calendarId: targetCalendarId,
      eventId: existing.googleEventId,
      title: input.title,
      start,
      end,
      location: input.location,
    });
    return { eventId: existing.googleEventId, mode: getGoogleCalendarOAuthStatus().mode };
  }

  const created = await createGoogleCalendarEventForSync({
    calendarId: targetCalendarId,
    title: input.title,
    start,
    end,
    location: input.location,
    description: `TiSLY ${ref.source}: ${ref.projectId}`,
  });
  upsertGoogleCalendarEventLink({
    googleEventId: created.eventId,
    googleCalendarId: targetCalendarId,
    projectSource: ref.source,
    projectId: ref.projectId,
    linkKind: "to_google",
  });
  return { eventId: created.eventId, mode: created.mode };
}
