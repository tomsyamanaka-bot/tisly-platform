/** Google Calendar 双方向同期 — 設定・案件リンク */

import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import type { ProjectRefV1 } from "../field-ops/field-ops-types.js";

export type GoogleCalendarSyncDirection = "bidirectional" | "pull_only" | "push_only";

export interface GoogleCalendarSettingsV1 {
  calendarId: string;
  calendarSummary: string | null;
  autoCreateProjects: boolean;
  syncDirection: GoogleCalendarSyncDirection;
  lastFullSyncAt: string | null;
  updatedAt: string;
}

export interface GoogleCalendarEventLinkV1 {
  id: string;
  googleEventId: string;
  googleCalendarId: string;
  projectSource: ProjectRefV1["source"];
  projectId: string;
  scheduleEventId: string | null;
  linkKind: "linked" | "from_google" | "to_google";
  createdAt: string;
  updatedAt: string;
}

const SETTINGS_KEY = "google_calendar_sync_settings_v1";

const DEFAULT_SETTINGS: GoogleCalendarSettingsV1 = {
  calendarId: "primary",
  calendarSummary: "メインカレンダー",
  autoCreateProjects: true,
  syncDirection: "bidirectional",
  lastFullSyncAt: null,
  updatedAt: new Date().toISOString(),
};

function rowToLink(r: Record<string, unknown>): GoogleCalendarEventLinkV1 {
  return {
    id: String(r.id),
    googleEventId: String(r.google_event_id),
    googleCalendarId: String(r.google_calendar_id),
    projectSource: String(r.project_source) as ProjectRefV1["source"],
    projectId: String(r.project_id),
    scheduleEventId: r.schedule_event_id != null ? String(r.schedule_event_id) : null,
    linkKind:
      r.link_kind === "from_google" || r.link_kind === "to_google" ? r.link_kind : "linked",
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function normalizeCalendarSummary(summary: string | null | undefined): string | null {
  if (!summary) return summary ?? null;
  if (
    summary === "primary（読込失敗）" ||
    summary === "読込失敗" ||
    summary === "primary（メインカレンダー）"
  ) {
    return DEFAULT_SETTINGS.calendarSummary;
  }
  return summary;
}

export function getGoogleCalendarSettingsV1(): GoogleCalendarSettingsV1 {
  const row = getDatabase()
    .prepare(`SELECT value_json FROM platform_settings WHERE key = ?`)
    .get(SETTINGS_KEY) as { value_json: string } | undefined;
  if (!row) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(row.value_json) as Partial<GoogleCalendarSettingsV1>;
    return {
      calendarId: parsed.calendarId?.trim() || DEFAULT_SETTINGS.calendarId,
      calendarSummary: normalizeCalendarSummary(parsed.calendarSummary) ?? DEFAULT_SETTINGS.calendarSummary,
      autoCreateProjects: parsed.autoCreateProjects ?? DEFAULT_SETTINGS.autoCreateProjects,
      syncDirection: parsed.syncDirection ?? DEFAULT_SETTINGS.syncDirection,
      lastFullSyncAt: parsed.lastFullSyncAt ?? null,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveGoogleCalendarSettingsV1(
  patch: Partial<
    Pick<
      GoogleCalendarSettingsV1,
      "calendarId" | "calendarSummary" | "autoCreateProjects" | "syncDirection"
    >
  >
): GoogleCalendarSettingsV1 {
  const current = getGoogleCalendarSettingsV1();
  const calendarId =
    typeof patch.calendarId === "string" && patch.calendarId.trim()
      ? patch.calendarId.trim()
      : current.calendarId?.trim() || DEFAULT_SETTINGS.calendarId;
  const calendarSummary =
    patch.calendarSummary === "primary（読込失敗）" || patch.calendarSummary === "読込失敗"
      ? DEFAULT_SETTINGS.calendarSummary
      : (patch.calendarSummary ?? current.calendarSummary);
  const next: GoogleCalendarSettingsV1 = {
    ...current,
    ...patch,
    calendarId,
    calendarSummary,
    updatedAt: new Date().toISOString(),
  };
  getDatabase()
    .prepare(
      `INSERT OR REPLACE INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export function touchGoogleCalendarLastSync(): GoogleCalendarSettingsV1 {
  const current = getGoogleCalendarSettingsV1();
  const next = { ...current, lastFullSyncAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  getDatabase()
    .prepare(
      `INSERT OR REPLACE INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export function findLinkByGoogleEventId(googleEventId: string): GoogleCalendarEventLinkV1 | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM google_calendar_event_links WHERE google_event_id = ?`)
    .get(googleEventId) as Record<string, unknown> | undefined;
  return row ? rowToLink(row) : null;
}

export function findLinkByProject(ref: ProjectRefV1): GoogleCalendarEventLinkV1 | null {
  const row = getDatabase()
    .prepare(
      `SELECT * FROM google_calendar_event_links WHERE project_source = ? AND project_id = ? ORDER BY updated_at DESC LIMIT 1`
    )
    .get(ref.source, ref.projectId) as Record<string, unknown> | undefined;
  return row ? rowToLink(row) : null;
}

export function listLinksInRange(startDate: string, endDate: string): GoogleCalendarEventLinkV1[] {
  const rows = getDatabase()
    .prepare(
      `SELECT l.* FROM google_calendar_event_links l
       INNER JOIN schedule_calendar_events e ON e.external_id = l.google_event_id
       WHERE e.event_date >= ? AND e.event_date <= ?`
    )
    .all(startDate, endDate) as Record<string, unknown>[];
  return rows.map(rowToLink);
}

export function upsertGoogleCalendarEventLink(input: {
  googleEventId: string;
  googleCalendarId: string;
  projectSource: ProjectRefV1["source"];
  projectId: string;
  scheduleEventId?: string | null;
  linkKind?: GoogleCalendarEventLinkV1["linkKind"];
}): GoogleCalendarEventLinkV1 {
  const existing = findLinkByGoogleEventId(input.googleEventId);
  const now = new Date().toISOString();
  if (existing) {
    getDatabase()
      .prepare(
        `UPDATE google_calendar_event_links SET
          google_calendar_id = ?, project_source = ?, project_id = ?,
          schedule_event_id = COALESCE(?, schedule_event_id),
          link_kind = COALESCE(?, link_kind), updated_at = ?
         WHERE id = ?`
      )
      .run(
        input.googleCalendarId,
        input.projectSource,
        input.projectId,
        input.scheduleEventId ?? null,
        input.linkKind ?? null,
        now,
        existing.id
      );
    return findLinkByGoogleEventId(input.googleEventId)!;
  }
  const id = uuid();
  getDatabase()
    .prepare(
      `INSERT INTO google_calendar_event_links
       (id, google_event_id, google_calendar_id, project_source, project_id, schedule_event_id, link_kind, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.googleEventId,
      input.googleCalendarId,
      input.projectSource,
      input.projectId,
      input.scheduleEventId ?? null,
      input.linkKind ?? "linked",
      now,
      now
    );
  return findLinkByGoogleEventId(input.googleEventId)!;
}

export function listSurveyProjectsForPush(startDate: string, endDate: string): Array<{
  projectId: string;
  title: string;
  surveyDate: string;
  address: string | null;
  startTime: string | null;
  endTime: string | null;
}> {
  const rows = getDatabase()
    .prepare(
      `SELECT sp.project_id, sp.site_name, sp.customer_name, sp.survey_date, sp.address
       FROM survey_projects sp
       LEFT JOIN google_calendar_event_links l
         ON l.project_source = 'survey' AND l.project_id = sp.project_id
       WHERE sp.survey_date >= ? AND sp.survey_date <= ?
         AND sp.status != 'deleted'
         AND l.id IS NULL`
    )
    .all(startDate, endDate) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    projectId: String(r.project_id),
    title: String(r.site_name || r.customer_name),
    surveyDate: String(r.survey_date),
    address: r.address != null ? String(r.address) : null,
    startTime: "09:00",
    endTime: "12:00",
  }));
}
