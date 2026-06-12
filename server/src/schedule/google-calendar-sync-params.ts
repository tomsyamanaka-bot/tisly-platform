/** Google Calendar 同期リクエストの正規化・検証 */

import type { AuthedRequest } from "../auth/auth-middleware.js";
import { getScheduleWindowStartWithOffset } from "../services/googleCalendar.js";
import {
  getGoogleCalendarOAuthStatus,
  hasGoogleCalendarWriteScope,
} from "../services/googleOAuthService.js";
import {
  getGoogleCalendarSettingsV1,
  saveGoogleCalendarSettingsV1,
  type GoogleCalendarSettingsV1,
  type GoogleCalendarSyncDirection,
  type GoogleCalendarSyncMode,
} from "./google-calendar-sync-store.js";

export const PRIMARY_CALENDAR_ID = "primary";
export const PRIMARY_CALENDAR_SUMMARY = "メインカレンダー";
export const DEFAULT_SYNC_TIMEZONE = "Asia/Tokyo";

export const PRIMARY_CALENDAR_FALLBACK = {
  id: PRIMARY_CALENDAR_ID,
  summary: PRIMARY_CALENDAR_SUMMARY,
  primary: true,
  accessRole: "owner" as const,
  writable: true,
};

export interface GoogleCalendarSyncRequestBody {
  startDate?: string;
  endDate?: string;
  dateFrom?: string;
  dateTo?: string;
  weeks?: number;
  weekOffset?: number;
  selectedCalendarId?: string;
  calendarId?: string;
  syncDirection?: string;
  syncMode?: GoogleCalendarSyncMode;
  calendarIds?: string[];
  timezone?: string;
}

export interface ResolvedGoogleCalendarSyncParams {
  startDate: string;
  endDate: string;
  calendarId: string;
  syncDirection: GoogleCalendarSyncDirection;
  timezone: string;
  settings: GoogleCalendarSettingsV1;
}

export interface GoogleCalendarSyncErrorPayload {
  ok: false;
  code: string;
  message: string;
  details: Record<string, string | number | boolean | null>;
  /** @deprecated 互換用 — message と同じ */
  error: string;
}

export type GoogleCalendarSyncValidation =
  | { ok: true; params: ResolvedGoogleCalendarSyncParams }
  | { ok: false; status: number; code: string; message: string; details: Record<string, string | number | boolean | null> };

export class GoogleCalendarSyncError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, string | number | boolean | null>;

  constructor(
    status: number,
    message: string,
    code = "sync_validation_failed",
    details: Record<string, string | number | boolean | null> = {}
  ) {
    super(message);
    this.name = "GoogleCalendarSyncError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function toGoogleCalendarSyncErrorPayload(
  status: number,
  code: string,
  message: string,
  details: Record<string, string | number | boolean | null> = {}
): GoogleCalendarSyncErrorPayload {
  return { ok: false, code, message, details, error: message };
}

export function sendGoogleCalendarSyncError(
  res: { status: (n: number) => { json: (body: unknown) => void } },
  status: number,
  code: string,
  message: string,
  details: Record<string, string | number | boolean | null> = {}
): void {
  res.status(status).json(toGoogleCalendarSyncErrorPayload(status, code, message, details));
}

export function assertGoogleCalendarSyncRequest(
  body: GoogleCalendarSyncRequestBody,
  auth?: AuthedRequest["admin"]
): ResolvedGoogleCalendarSyncParams {
  const result = validateGoogleCalendarSyncRequest(body, auth);
  if (!result.ok) {
    throw new GoogleCalendarSyncError(result.status, result.message, result.code, result.details);
  }
  return result.params;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function normalizeSyncDirection(raw?: string): GoogleCalendarSyncDirection {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v || v === "two_way" || v === "bidirectional" || v === "both") return "bidirectional";
  if (v === "pull_only" || v === "pull" || v === "google_to_tisly") return "pull_only";
  if (v === "push_only" || v === "push" || v === "tisly_to_google") return "push_only";
  return "bidirectional";
}

function isInvalidSelectedCalendarId(raw?: string): boolean {
  const id = String(raw ?? "").trim();
  if (!id) return false;
  if (id === "読み込み中…" || id.includes("読込失敗")) return true;
  return false;
}

function resolveCalendarId(raw?: string): string {
  const id = String(raw ?? "").trim();
  if (!id || id === "読み込み中…") return PRIMARY_CALENDAR_ID;
  return id;
}

function resolveTimezone(body: GoogleCalendarSyncRequestBody): string {
  const tz = String(body.timezone ?? DEFAULT_SYNC_TIMEZONE).trim();
  return tz || DEFAULT_SYNC_TIMEZONE;
}

function normalizeBodyDates(body: GoogleCalendarSyncRequestBody): GoogleCalendarSyncRequestBody {
  return {
    ...body,
    startDate: body.startDate?.trim() || body.dateFrom?.trim() || undefined,
    endDate: body.endDate?.trim() || body.dateTo?.trim() || undefined,
  };
}

function resolveDateRange(
  body: GoogleCalendarSyncRequestBody,
  timezone: string
): { startDate: string; endDate: string } | null {
  const normalized = normalizeBodyDates(body);
  const startRaw = normalized.startDate;
  const endRaw = normalized.endDate;

  if (startRaw && !ISO_DATE.test(startRaw)) return null;
  if (endRaw && !ISO_DATE.test(endRaw)) return null;

  if (startRaw && endRaw) {
    if (startRaw > endRaw) return null;
    return { startDate: startRaw, endDate: endRaw };
  }

  if (startRaw) {
    const weeks = Math.max(1, Math.min(12, Number(body.weeks) || 1));
    return { startDate: startRaw, endDate: addDays(startRaw, weeks * 7 - 1) };
  }

  const weekOffset = Number.isFinite(Number(body.weekOffset)) ? Number(body.weekOffset) : 0;
  const startDate = getScheduleWindowStartWithOffset(weekOffset, timezone);
  const weeks = Math.max(1, Math.min(12, Number(body.weeks) || 1));
  return { startDate, endDate: addDays(startDate, weeks * 7 - 1) };
}

function patchSettingsFromBody(body: GoogleCalendarSyncRequestBody): GoogleCalendarSettingsV1 {
  const current = getGoogleCalendarSettingsV1();
  const calendarId = resolveCalendarId(
    body.selectedCalendarId ?? body.calendarId ?? current.calendarId
  );
  const syncDirection = normalizeSyncDirection(body.syncDirection ?? current.syncDirection);
  const syncMode = body.syncMode ?? current.syncMode;
  const calendarIds = body.calendarIds ?? current.calendarIds;
  const needsPatch =
    !current.calendarId?.trim() ||
    current.calendarId !== calendarId ||
    current.syncDirection !== syncDirection ||
    current.syncMode !== syncMode ||
    JSON.stringify(current.calendarIds) !== JSON.stringify(calendarIds);
  if (!needsPatch) return current;
  return saveGoogleCalendarSettingsV1({
    calendarId,
    calendarSummary:
      calendarId === PRIMARY_CALENDAR_ID ? PRIMARY_CALENDAR_SUMMARY : current.calendarSummary,
    syncDirection,
    syncMode,
    calendarIds,
  });
}

function safeSyncDetails(
  body: GoogleCalendarSyncRequestBody,
  extra: Record<string, string | number | boolean | null> = {}
): Record<string, string | number | boolean | null> {
  const normalized = normalizeBodyDates(body);
  return {
    selectedCalendarId: body.selectedCalendarId ?? null,
    calendarId: body.calendarId ?? null,
    syncDirection: body.syncDirection ?? null,
    weekOffset: Number.isFinite(Number(body.weekOffset)) ? Number(body.weekOffset) : null,
    dateFrom: body.dateFrom ?? normalized.startDate ?? null,
    dateTo: body.dateTo ?? normalized.endDate ?? null,
    weeks: Number.isFinite(Number(body.weeks)) ? Number(body.weeks) : null,
    timezone: body.timezone ?? null,
    ...extra,
  };
}

/** 同期前に calendarId / 方向 / 日付範囲を補完し、クライアントエラーは日本語で返す */
export function validateGoogleCalendarSyncRequest(
  body: GoogleCalendarSyncRequestBody,
  auth?: AuthedRequest["admin"]
): GoogleCalendarSyncValidation {
  const oauth = getGoogleCalendarOAuthStatus();
  const details = safeSyncDetails(body);

  if (!oauth.configured) {
    return {
      ok: false,
      status: 503,
      code: "google_calendar_not_configured",
      message: "Googleカレンダー未設定：設定画面でログインしてください",
      details,
    };
  }
  if (!oauth.connected) {
    return {
      ok: false,
      status: 400,
      code: "google_not_logged_in",
      message: "Googleログインが切れています。設定画面から再ログインしてください。",
      details,
    };
  }

  if (!hasGoogleCalendarWriteScope()) {
    return {
      ok: false,
      status: 400,
      code: "needs_relogin",
      message: "権限が不足しています。Google連携画面から再ログインしてください。",
      details: { ...details, needsRelogin: true },
    };
  }

  if (isInvalidSelectedCalendarId(body.selectedCalendarId ?? body.calendarId)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_calendar_id",
      message: "selectedCalendarIdが不正です。設定画面でカレンダーを選び直してください。",
      details,
    };
  }

  const timezone = resolveTimezone(body);
  const settings = patchSettingsFromBody(body);
  const calendarId = resolveCalendarId(
    body.selectedCalendarId ?? body.calendarId ?? settings.calendarId
  );

  if (!calendarId?.trim()) {
    return {
      ok: false,
      status: 400,
      code: "calendar_id_missing",
      message: "calendarId未設定です。設定画面でカレンダーを選択してください。",
      details: { ...details, timezone },
    };
  }

  const syncDirection = normalizeSyncDirection(body.syncDirection ?? settings.syncDirection);
  const range = resolveDateRange(body, timezone);
  if (!range) {
    return {
      ok: false,
      status: 400,
      code: "invalid_date_range",
      message: "予定の取得範囲が不正です。日付は YYYY-MM-DD 形式で指定してください。",
      details: { ...details, timezone },
    };
  }

  if (calendarId !== settings.calendarId || !settings.calendarId?.trim()) {
    saveGoogleCalendarSettingsV1({
      calendarId,
      calendarSummary:
        calendarId === PRIMARY_CALENDAR_ID ? PRIMARY_CALENDAR_SUMMARY : settings.calendarSummary,
    });
  }

  void auth?.customerCode;

  return {
    ok: true,
    params: {
      startDate: range.startDate,
      endDate: range.endDate,
      calendarId,
      syncDirection,
      timezone,
      settings: getGoogleCalendarSettingsV1(),
    },
  };
}
