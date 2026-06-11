/** Google Calendar API エラーの safe log（トークン・シークレット非含有） */

import { getDatabase } from "../db/database.js";
import type { GoogleApiErrorBody } from "../services/googleOAuthService.js";

const SAFE_LOG_KEY = "google_calendar_last_safe_log";

export interface GoogleCalendarSafeLog {
  at: string;
  operation: string;
  httpStatus: number;
  googleErrorCode: string | number | null;
  googleErrorMessage: string | null;
  googleErrorStatus: string | null;
}

export function extractGoogleApiSafeLog(
  operation: string,
  httpStatus: number,
  body: GoogleApiErrorBody
): GoogleCalendarSafeLog {
  const err = body.error;
  return {
    at: new Date().toISOString(),
    operation,
    httpStatus,
    googleErrorCode: err?.code ?? err?.status ?? null,
    googleErrorMessage: err?.message ?? null,
    googleErrorStatus: err?.status ?? null,
  };
}

export function saveGoogleCalendarSafeLog(log: GoogleCalendarSafeLog): void {
  getDatabase()
    .prepare(
      `INSERT OR REPLACE INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(SAFE_LOG_KEY, JSON.stringify(log));
}

export function getGoogleCalendarSafeLog(): GoogleCalendarSafeLog | null {
  const row = getDatabase()
    .prepare(`SELECT value_json FROM platform_settings WHERE key = ?`)
    .get(SAFE_LOG_KEY) as { value_json: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value_json) as GoogleCalendarSafeLog;
  } catch {
    return null;
  }
}

/** 表示用: calendar / calendar.readonly */
export function formatTokenScopeShort(scope: string): string {
  const scopes = String(scope ?? "")
    .split(/\s+/)
    .filter(Boolean);
  if (scopes.length === 0) return "—";
  const hasWrite = scopes.some(
    (s) => s.endsWith("/auth/calendar") && !s.includes("readonly")
  );
  const hasReadonly = scopes.some((s) => s.includes("calendar.readonly"));
  if (hasWrite) return "calendar";
  if (hasReadonly) return "calendar.readonly";
  return scopes.map((s) => s.split("/").pop() ?? s).join(", ");
}

export function formatGoogleApiErrorHint(log: GoogleCalendarSafeLog | null): string | null {
  if (!log) return null;
  if (log.httpStatus === 403) {
    return "権限不足 — Google連携画面から再ログインしてください";
  }
  if (log.httpStatus === 401) {
    return "再ログイン必要 — Googleログインの有効期限が切れています";
  }
  if (log.httpStatus === 400) {
    const detail = log.googleErrorMessage ? `validationエラー: ${log.googleErrorMessage}` : "validationエラー";
    return detail;
  }
  if (log.googleErrorMessage) return log.googleErrorMessage;
  return `Google API error (${log.httpStatus})`;
}
