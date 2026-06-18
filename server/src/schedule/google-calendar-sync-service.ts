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
  deleteGoogleCalendarEventForSync,
  getGoogleCalendarOAuthStatus,
  hasGoogleCalendarWriteScope,
  listGoogleCalendarsDetailed,
  markGoogleCalendarEventComplete,
  updateGoogleCalendarEventForSync,
  type GoogleCalendarDeleteEventResult,
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
  formatTargetCalendarNames,
  resolvePullTargetCalendarIds,
  resolvePushTargetCalendarIds,
  filterWritableCalendars,
} from "./google-calendar-target-calendars.js";
import { upsertCachedCalendarEvents, type CalendarUpsertStats, recordCalendarSyncSuccessMeta } from "./schedule-calendar-store.js";
import type { ScheduleEvent } from "./schedule-types.js";
import {
  findLinkByGoogleEventId,
  findLinkByProject,
  getGoogleCalendarSettingsV1,
  listDeletedSurveyProjectLinks,
  listSurveyLinksOutsidePushCalendars,
  listSurveyProjectsForPush,
  listSurveyProjectsForPushUpdate,
  saveGoogleCalendarSettingsV1,
  touchGoogleCalendarLastSync,
  upsertGoogleCalendarEventLink,
  deleteGoogleCalendarEventLink,
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
  pushCreated: number;
  pushUpdated: number;
  projectsCreated: number;
  linksUpdated: number;
  startDate: string;
  endDate: string;
  /** 取得件数 */
  fetched: number;
  /** 新規作成件数（pull cache + push） */
  created: number;
  /** 更新件数（pull cache + push） */
  updated: number;
  /** Google 側削除件数 */
  deleted: number;
  /** スキップ件数 */
  skipped: number;
  /** 保存失敗件数 */
  failed: number;
  lastSyncedAt: string;
}

async function resolveSyncTargetCalendarIds(
  settings: GoogleCalendarSettingsV1
): Promise<{
  pullIds: string[];
  pushIds: string[];
  meta: Map<string, GoogleCalendarListItem>;
}> {
  const list = await listGoogleCalendarsDetailed();
  const calendars = list.usedFallback ? [list.fallback] : list.calendars;
  const pullIds = resolvePullTargetCalendarIds(settings, calendars);
  const pushIds = resolvePushTargetCalendarIds(settings, calendars);
  const meta = calendarMetaMap(calendars);
  const pullNames = formatTargetCalendarNames(pullIds, meta);
  console.log("[google-calendar-sync] 取得対象カレンダー:", pullNames.join(" / "));
  console.log("[google-calendar-sync] 書込対象カレンダー:", formatTargetCalendarNames(pushIds, meta).join(" / "));
  return { pullIds, pushIds, meta };
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
       WHERE survey_date = ? AND deleted_at IS NULL
         AND (site_name = ? OR customer_name = ? OR site_name LIKE ?)
       ORDER BY updated_at DESC LIMIT 1`
    )
    .get(date, title, title, `%${title.slice(0, 20)}%`) as { project_id?: string } | undefined;
  return row?.project_id ?? null;
}

function buildSurveyGoogleDescription(projectId: string, notes?: string | null): string {
  const base = `TiSLY案件: ${projectId}`;
  const memo = notes?.trim();
  return memo ? `${base}\n${memo}` : base;
}

function upsertLocalGoogleEventCache(
  mode: "mock" | "real",
  input: {
    calendarId: string;
    googleEventId: string;
    surveyDate: string;
    title: string;
    address: string | null;
    startTime: string;
    endTime: string;
    projectId: string;
    cal?: GoogleCalendarListItem;
  }
): void {
  if (mode !== "real") return;
  getDatabase()
    .prepare(
      `INSERT OR REPLACE INTO schedule_calendar_events
       (id, external_id, event_date, title, category, source, start_time, end_time, all_day, location, description, calendar_id, calendar_color, calendar_summary, synced_at)
       VALUES (?, ?, ?, ?, ?, 'google', ?, ?, 0, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .run(
      buildGoogleEventLocalId(input.calendarId, input.googleEventId),
      input.googleEventId,
      input.surveyDate,
      input.title,
      classifyEventCategory(input.title),
      input.startTime,
      input.endTime,
      input.address,
      `TiSLY案件: ${input.projectId}`,
      input.calendarId,
      input.cal?.backgroundColor ?? null,
      input.cal?.summary ?? null
    );
}

function removeLocalGoogleEventCache(googleEventId: string, calendarId: string): void {
  getDatabase()
    .prepare(`DELETE FROM schedule_calendar_events WHERE external_id = ? AND calendar_id = ?`)
    .run(googleEventId, calendarId);
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
): Promise<{
  events: ScheduleEvent[];
  projectsCreated: number;
  linksUpdated: number;
  importFailed: number;
  upsert: CalendarUpsertStats;
}> {
  const synced = await syncGoogleCalendarEvents(startDate, endDate, targetIds);
  const upsert = upsertCachedCalendarEvents(startDate, endDate, synced.events);

  let projectsCreated = 0;
  let linksUpdated = 0;
  let importFailed = 0;
  for (const ev of synced.events) {
    try {
      const result = await importEventAsProject(ev, settings);
      if (result?.created) projectsCreated += 1;
      if (result) linksUpdated += 1;
    } catch (e) {
      importFailed += 1;
      console.error("[google-calendar-sync] importEventAsProject failed", {
        eventId: ev.externalId,
        calendarId: ev.calendarId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return {
    events: synced.events,
    projectsCreated,
    linksUpdated,
    importFailed,
    upsert,
  };
}

async function pushToGoogle(
  startDate: string,
  endDate: string,
  settings: GoogleCalendarSettingsV1,
  mode: "mock" | "real",
  targetIds: string[],
  meta: Map<string, GoogleCalendarListItem>
): Promise<{ pushCreated: number; pushUpdated: number; linksUpdated: number }> {
  let pushCreated = 0;
  let pushUpdated = 0;
  let linksUpdated = 0;

  for (const calId of targetIds) {
    const cal = meta.get(calId);

    const linked = listSurveyProjectsForPushUpdate(startDate, endDate, calId);
    for (const p of linked) {
      const start = toDateTimeIso(p.surveyDate, p.startTime ?? "09:00");
      const end = toDateTimeIso(p.surveyDate, p.endTime ?? "12:00");
      const eventId = p.googleEventId;
      await updateGoogleCalendarEventForSync({
        calendarId: calId,
        eventId,
        title: p.title,
        start,
        end,
        location: p.address ?? undefined,
        description: buildSurveyGoogleDescription(p.projectId, p.notes),
      });
      upsertGoogleCalendarEventLink({
        googleEventId: eventId,
        googleCalendarId: calId,
        projectSource: "survey",
        projectId: p.projectId,
        linkKind: "to_google",
      });
      pushUpdated += 1;
      linksUpdated += 1;
      upsertLocalGoogleEventCache(mode, {
        calendarId: calId,
        googleEventId: eventId,
        surveyDate: p.surveyDate,
        title: p.title,
        address: p.address,
        startTime: p.startTime ?? "09:00",
        endTime: p.endTime ?? "12:00",
        projectId: p.projectId,
        cal,
      });
    }

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
        description: buildSurveyGoogleDescription(p.projectId),
      });
      upsertGoogleCalendarEventLink({
        googleEventId: created.eventId,
        googleCalendarId: calId,
        projectSource: "survey",
        projectId: p.projectId,
        linkKind: "to_google",
      });
      pushCreated += 1;
      linksUpdated += 1;
      upsertLocalGoogleEventCache(mode, {
        calendarId: calId,
        googleEventId: created.eventId,
        surveyDate: p.surveyDate,
        title: p.title,
        address: p.address,
        startTime: p.startTime ?? "09:00",
        endTime: p.endTime ?? "12:00",
        projectId: p.projectId,
        cal,
      });
    }
  }
  return { pushCreated, pushUpdated, linksUpdated };
}

export type GoogleCalendarProjectDeleteOutcome = {
  attempted: boolean;
  status: GoogleCalendarDeleteEventResult["status"];
  eventId?: string;
  reason?: string;
};

export async function removeProjectGoogleCalendarEvent(
  ref: ProjectRefV1,
  reason: string
): Promise<GoogleCalendarProjectDeleteOutcome> {
  const link = findLinkByProject(ref);
  if (!link) {
    console.log("[google-calendar-sync] delete skipped", { ref, reason: "no link" });
    return { attempted: false, status: "skipped", reason: "no link" };
  }
  const settings = getGoogleCalendarSettingsV1();
  const calendarId = link.googleCalendarId || settings.calendarId;
  if (!hasGoogleCalendarWriteScope() && getGoogleCalendarOAuthStatus().mode === "real") {
    console.log("[google-calendar-sync] delete skipped", {
      ref,
      reason: "no write scope",
      eventId: link.googleEventId,
    });
    deleteGoogleCalendarEventLink(link.id);
    removeLocalGoogleEventCache(link.googleEventId, calendarId);
    return {
      attempted: false,
      status: "skipped",
      eventId: link.googleEventId,
      reason: "no write scope",
    };
  }
  try {
    const result = await deleteGoogleCalendarEventForSync({
      calendarId,
      eventId: link.googleEventId,
      reason,
    });
    deleteGoogleCalendarEventLink(link.id);
    if (result.status === "deleted" || result.status === "not_found") {
      removeLocalGoogleEventCache(link.googleEventId, calendarId);
    }
    return {
      attempted: true,
      status: result.status,
      eventId: link.googleEventId,
      reason: result.reason ?? reason,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[google-calendar-sync] delete failed", { ref, reason, error: msg });
    return {
      attempted: true,
      status: "skipped",
      eventId: link.googleEventId,
      reason: msg,
    };
  }
}

async function cleanupOrphanGoogleEvents(
  pushIds: string[],
  reason: string
): Promise<number> {
  const links = [
    ...listDeletedSurveyProjectLinks(),
    ...listSurveyLinksOutsidePushCalendars(pushIds),
  ];
  const seen = new Set<string>();
  let deleted = 0;
  for (const link of links) {
    if (seen.has(link.id)) continue;
    seen.add(link.id);
    const outcome = await removeProjectGoogleCalendarEvent(
      { source: link.projectSource, projectId: link.projectId },
      reason
    );
    if (outcome.status === "deleted" || outcome.status === "not_found") {
      deleted += 1;
    }
  }
  return deleted;
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
  let pushCreated = 0;
  let pushUpdated = 0;
  let deleted = 0;
  let projectsCreated = 0;
  let linksUpdated = 0;
  let fetched = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  const direction = validated.syncDirection;
  const mode = oauth.mode;
  const { pullIds, pushIds, meta } = await resolveSyncTargetCalendarIds(settings);

  if (direction === "bidirectional" || direction === "pull_only") {
    const pull = await pullFromGoogle(startDate, endDate, settings, pullIds);
    pulled = pull.events.length;
    projectsCreated = pull.projectsCreated;
    linksUpdated += pull.linksUpdated;
    fetched = pull.upsert.fetched;
    created = pull.upsert.created;
    updated = pull.upsert.updated;
    skipped = pull.upsert.skipped;
    failed = pull.upsert.failed + pull.importFailed;
  } else {
    const events = await fetchCalendarEvents(startDate, endDate);
    const upsert = upsertCachedCalendarEvents(startDate, endDate, events);
    pulled = events.length;
    fetched = upsert.fetched;
    created = upsert.created;
    updated = upsert.updated;
    skipped = upsert.skipped;
    failed = upsert.failed;
  }

  const canPush =
    (direction === "bidirectional" || direction === "push_only") && hasGoogleCalendarWriteScope();
  if (canPush) {
    const push = await pushToGoogle(startDate, endDate, settings, mode, pushIds, meta);
    pushCreated = push.pushCreated;
    pushUpdated = push.pushUpdated;
    pushed = pushCreated + pushUpdated;
    linksUpdated += push.linksUpdated;
    created += pushCreated;
    updated += pushUpdated;
    deleted += await cleanupOrphanGoogleEvents(pushIds, "full_sync_orphan_cleanup");
  }

  touchGoogleCalendarLastSync();

  recordCalendarSyncSuccessMeta(startDate, endDate, {
    fetched,
    created,
    updated,
    skipped,
    failed,
  });

  return {
    mode,
    calendarId: settings.calendarId,
    calendarIds: pullIds,
    syncMode: settings.syncMode,
    pulled,
    pushed,
    pushCreated,
    pushUpdated,
    projectsCreated,
    linksUpdated,
    startDate,
    endDate,
    fetched,
    created,
    updated,
    deleted,
    skipped,
    failed,
    lastSyncedAt: new Date().toISOString(),
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
  input: {
    date: string;
    title: string;
    startTime?: string;
    endTime?: string;
    location?: string;
    description?: string;
  }
): Promise<{ eventId: string; mode: "mock" | "real"; updated: boolean }> {
  const settings = getGoogleCalendarSettingsV1();
  const existing = findLinkByProject(ref);
  const start = toDateTimeIso(input.date, input.startTime ?? "09:00");
  const end = toDateTimeIso(input.date, input.endTime ?? "12:00");
  const description =
    input.description ?? `TiSLY ${ref.source}: ${ref.projectId}`;

  const targetCalendarId = existing?.googleCalendarId || settings.calendarId;

  if (existing) {
    await updateGoogleCalendarEventForSync({
      calendarId: targetCalendarId,
      eventId: existing.googleEventId,
      title: input.title,
      start,
      end,
      location: input.location,
      description,
    });
    upsertLocalGoogleEventCache(getGoogleCalendarOAuthStatus().mode, {
      calendarId: targetCalendarId,
      googleEventId: existing.googleEventId,
      surveyDate: input.date,
      title: input.title,
      address: input.location ?? null,
      startTime: input.startTime ?? "09:00",
      endTime: input.endTime ?? "12:00",
      projectId: ref.projectId,
    });
    return {
      eventId: existing.googleEventId,
      mode: getGoogleCalendarOAuthStatus().mode,
      updated: true,
    };
  }

  const created = await createGoogleCalendarEventForSync({
    calendarId: targetCalendarId,
    title: input.title,
    start,
    end,
    location: input.location,
    description,
  });
  upsertGoogleCalendarEventLink({
    googleEventId: created.eventId,
    googleCalendarId: targetCalendarId,
    projectSource: ref.source,
    projectId: ref.projectId,
    linkKind: "to_google",
  });
  upsertLocalGoogleEventCache(created.mode, {
    calendarId: targetCalendarId,
    googleEventId: created.eventId,
    surveyDate: input.date,
    title: input.title,
    address: input.location ?? null,
    startTime: input.startTime ?? "09:00",
    endTime: input.endTime ?? "12:00",
    projectId: ref.projectId,
  });
  return { eventId: created.eventId, mode: created.mode, updated: false };
}

const SURVEY_SCHEDULE_PATCH_FIELDS = new Set([
  "surveyDate",
  "siteName",
  "customerName",
  "address",
  "notes",
]);

export function surveyPatchTouchesSchedule(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).some((k) => SURVEY_SCHEDULE_PATCH_FIELDS.has(k));
}

export async function syncSurveyProjectScheduleToGoogleIfLinked(project: {
  projectId: string;
  surveyDate: string;
  siteName: string;
  customerName: string;
  address?: string | null;
  notes?: string | null;
}): Promise<{ synced: boolean; eventId?: string; mode?: string; updated?: boolean; error?: string }> {
  const oauth = getGoogleCalendarOAuthStatus();
  if (oauth.mode === "real") {
    if (!hasGoogleCalendarWriteScope()) {
      return { synced: false, error: "no write scope" };
    }
    const guard = assertGoogleCalendarSyncAllowed();
    if (!guard.ok) {
      return { synced: false, error: guard.error };
    }
  }
  try {
    const result = await syncProjectScheduleToGoogle(
      { source: "survey", projectId: project.projectId },
      {
        date: project.surveyDate,
        title: project.siteName || project.customerName,
        location: project.address ?? undefined,
        description: buildSurveyGoogleDescription(project.projectId, project.notes),
      }
    );
    return {
      synced: true,
      eventId: result.eventId,
      mode: result.mode,
      updated: result.updated,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[google-calendar-sync] syncSurveyProjectScheduleToGoogleIfLinked failed", {
      projectId: project.projectId,
      error,
    });
    return { synced: false, error };
  }
}
