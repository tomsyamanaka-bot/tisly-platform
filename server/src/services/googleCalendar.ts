/**
 * Google Calendar 連携 — OAuth 対応（mock / real 切替）
 * 取得: 予定名・開始/終了日時・終日・場所・説明 + カテゴリ自動判定
 */

import type { ScheduleCategory, ScheduleEvent, ScheduleEventSource } from "../schedule/schedule-types.js";
import { getCalendarSyncMeta, type CalendarSyncMeta } from "../schedule/schedule-calendar-store.js";
import { getGoogleCalendarSettingsV1 } from "../schedule/google-calendar-sync-store.js";
import {
  buildGoogleEventLocalId,
  calendarMetaMap,
  resolveTargetCalendarIds,
} from "../schedule/google-calendar-target-calendars.js";
import {
  formatScheduleCalendarDuplicateErrorForUi,
  isScheduleCalendarDuplicateError,
} from "../schedule/schedule-calendar-store.js";
import {
  assertGoogleCalendarSyncAllowed,
  getGoogleCalendarAuthUrl,
  getGoogleCalendarGrantedScopes,
  getGoogleCalendarOAuthEnvDebug,
  type GoogleCalendarOAuthEnvDebug,
  getGoogleCalendarOAuthStatus,
  getGoogleCalendarTokenExpiry,
  getGoogleCalendarTokenScope,
  googleApiErrorMessage,
  handleGoogleCalendarOAuthCallback,
  hasGoogleCalendarAccessToken,
  hasGoogleCalendarRefreshToken,
  hasGoogleCalendarWriteScope,
  listGoogleCalendarsDetailed,
  type GoogleCalendarListItem,
  logGoogleCalendarApiError,
  refreshGoogleAccessToken,
  type GoogleApiErrorBody,
} from "./googleOAuthService.js";
import {
  extractGoogleApiSafeLog,
  formatTokenScopeShort,
  getGoogleCalendarSafeLog,
  saveGoogleCalendarSafeLog,
  type GoogleCalendarSafeLog,
} from "../schedule/google-calendar-safe-log.js";

export type GoogleCalendarDisplayStatus =
  | "mock"
  | "not_configured"
  | "not_logged_in"
  | "logged_in"
  | "sync_success"
  | "sync_failed";

export interface GoogleCalendarPublicStatus {
  enabled: boolean;
  configured: boolean;
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
  redirectUri: string | null;
  mode: "mock" | "live";
  missingEnv: string[];
  connected: boolean;
  displayStatus: GoogleCalendarDisplayStatus;
  displayLabel: string;
  sync: {
    lastSyncedAt: string | null;
    eventCount: number;
    lastSyncStatus: "success" | "failed" | null;
    lastSyncError: string | null;
    lastSyncSafeLog: GoogleCalendarSafeLog | null;
  };
  buttonLabel: string;
  buttonDisabled: boolean;
  scope: {
    granted: string[];
    hasWriteAccess: boolean;
    needsReLogin: boolean;
    label: string;
  };
  oauthDebug: GoogleCalendarOAuthEnvDebug;
}

export interface GoogleCalendarConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  calendarId: string;
}

export const GOOGLE_CALENDAR_CONFIG_PLACEHOLDER: GoogleCalendarConfig = {
  clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID ?? "",
  clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "",
  redirectUri:
    process.env.GOOGLE_REDIRECT_URI ??
    process.env.GOOGLE_CALENDAR_REDIRECT_URI ??
    "https://tisly.jp/auth/google/callback",
  calendarId: process.env.GOOGLE_CALENDAR_ID ?? "primary",
};

export interface CalendarProvider {
  listEvents(startDate: string, endDate: string): Promise<ScheduleEvent[]>;
  mode: "mock" | "real";
}

const CONSTRUCTION_KW = [
  "工事", "設置", "現調", "施工", "配線", "カメラ", "lan", "防犯", "交換", "取付", "配管", "電気",
];
const OFFICE_KW = ["見積", "請求", "入金", "経理", "事務", "会議", "打合", "ミーティング", "税理", "書類", "メール"];
const FAMILY_KW = ["家族", "学校", "習い", "子供", "旅行", "休み", "誕生日", "病院", "通院"];
const URGENT_KW = ["緊急", "重要", "至急", "トラブル", "故障", "アラーム", "警報"];

/** 予定名・説明・場所からカテゴリを自動判定 */
export function classifyEventCategory(
  title: string,
  description?: string | null,
  location?: string | null
): ScheduleCategory {
  const text = `${title} ${description ?? ""} ${location ?? ""}`.toLowerCase();
  if (URGENT_KW.some((k) => text.includes(k))) return "urgent";
  if (FAMILY_KW.some((k) => text.includes(k))) return "family";
  if (CONSTRUCTION_KW.some((k) => text.includes(k.toLowerCase()))) return "construction";
  if (OFFICE_KW.some((k) => text.includes(k))) return "office";
  return "office";
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekdayOffset(base: Date): string {
  const day = base.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(base);
  monday.setDate(base.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

function parseGoogleDateTime(
  start: { date?: string; dateTime?: string },
  end: { date?: string; dateTime?: string }
): {
  date: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
} {
  if (start.date) {
    return {
      date: start.date,
      startTime: null,
      endTime: null,
      allDay: true,
    };
  }
  const startDt = start.dateTime ?? "";
  const endDt = end.dateTime ?? "";
  const date = startDt.slice(0, 10);
  const startTime = startDt.length >= 16 ? startDt.slice(11, 16) : null;
  const endTime = endDt.length >= 16 ? endDt.slice(11, 16) : null;
  return { date, startTime, endTime, allDay: false };
}

function googleItemToEvent(
  item: {
    id?: string;
    summary?: string;
    description?: string;
    location?: string;
    start?: { date?: string; dateTime?: string };
    end?: { date?: string; dateTime?: string };
  },
  meta?: { calendarId?: string; calendarColor?: string | null; calendarSummary?: string | null }
): ScheduleEvent | null {
  if (!item.id || !item.summary || !item.start) return null;
  const { date, startTime, endTime, allDay } = parseGoogleDateTime(
    item.start,
    item.end ?? item.start
  );
  const title = item.summary.trim();
  const calendarId = meta?.calendarId ?? null;
  const localId = calendarId
    ? buildGoogleEventLocalId(calendarId, item.id)
    : buildGoogleEventLocalId("primary", item.id);
  return {
    id: localId,
    date,
    title,
    category: classifyEventCategory(title, item.description, item.location),
    source: "google" as ScheduleEventSource,
    externalId: item.id,
    startTime,
    endTime,
    allDay,
    location: item.location?.trim() || null,
    description: item.description?.trim() || null,
    calendarId,
    calendarColor: meta?.calendarColor ?? null,
    calendarSummary: meta?.calendarSummary ?? null,
  };
}

/** デモ用モック予定 */
export function mockCalendarEvents(startDate: string, endDate: string): ScheduleEvent[] {
  const events: ScheduleEvent[] = [];
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  const seed = startDate.replace(/-/g, "").length;

  const templates: Array<{
    title: string;
    category: ScheduleCategory;
    wd: number;
    startTime: string;
    endTime: string;
    location?: string;
    description?: string;
  }> = [
    {
      title: "防犯カメラ設置",
      category: "construction",
      wd: 1,
      startTime: "08:30",
      endTime: "12:00",
      location: "守谷市",
      description: "既設カメラ撤去、LAN引き直し。駐車場2台分確保。",
    },
    {
      title: "インターホン交換",
      category: "construction",
      wd: 2,
      startTime: "10:00",
      endTime: "14:00",
      location: "つくばみらい市",
      description: "玄関子機2台・親機1台。配線ルート要確認。",
    },
    { title: "見積書まとめ", category: "office", wd: 2, startTime: "15:00", endTime: "17:00", description: "先週現調分の見積をまとめる" },
    { title: "請求・入金確認", category: "office", wd: 3, startTime: "09:00", endTime: "10:30" },
    { title: "家族の予定", category: "family", wd: 5, startTime: "18:00", endTime: "20:00" },
    {
      title: "緊急対応",
      category: "urgent",
      wd: 4,
      startTime: "13:00",
      endTime: "15:00",
      location: "取手市",
      description: "録画異常。HDD交換の可能性あり。",
    },
    {
      title: "LAN配線工事",
      category: "construction",
      wd: 3,
      startTime: "13:00",
      endTime: "17:00",
      location: "取手市",
      description: "2階書斎までCAT6引き込み。",
    },
    {
      title: "現調（大阪）",
      category: "construction",
      wd: 1,
      startTime: "14:00",
      endTime: "16:00",
      location: "大阪市",
      description: "新規防犯カメラ8台。配線経路・電源確認。",
    },
  ];

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const wd = d.getDay();
    templates.forEach((tpl, i) => {
      if (tpl.wd !== wd) return;
      if ((seed + i + d.getDate()) % 3 === 0) return;
      events.push({
        id: `mock-${iso}-${i}`,
        date: iso,
        title: tpl.title,
        category: tpl.category,
        source: "mock",
        externalId: `mock-ext-${iso}-${i}`,
        startTime: tpl.startTime,
        endTime: tpl.endTime,
        allDay: false,
        location: tpl.location ?? null,
        description: tpl.description ?? null,
      });
    });
  }
  return events;
}

export class MockGoogleCalendarProvider implements CalendarProvider {
  mode: "mock" | "real" = "mock";

  async listEvents(startDate: string, endDate: string): Promise<ScheduleEvent[]> {
    return mockCalendarEvents(startDate, endDate);
  }
}

export async function listGoogleCalendarEventsForId(
  calendarId: string,
  startDate: string,
  endDate: string,
  meta?: { calendarColor?: string | null; calendarSummary?: string | null }
): Promise<ScheduleEvent[]> {
  const token = await refreshGoogleAccessToken("calendar");
  const timeMin = `${startDate}T00:00:00+09:00`;
  const timeMax = `${addDays(endDate, 1)}T00:00:00+09:00`;
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as GoogleApiErrorBody;
    logGoogleCalendarApiError("events.list", res.status, err);
    saveGoogleCalendarSafeLog(extractGoogleApiSafeLog("events.list", res.status, err));
    throw new Error(googleApiErrorMessage(err, res.status));
  }
  const json = (await res.json()) as { items?: Array<Record<string, unknown>> };
  const events: ScheduleEvent[] = [];
  for (const item of json.items ?? []) {
    const ev = googleItemToEvent(
      item as {
        id?: string;
        summary?: string;
        description?: string;
        location?: string;
        start?: { date?: string; dateTime?: string };
        end?: { date?: string; dateTime?: string };
      },
      {
        calendarId,
        calendarColor: meta?.calendarColor ?? null,
        calendarSummary: meta?.calendarSummary ?? null,
      }
    );
    if (ev && ev.date >= startDate && ev.date <= endDate) events.push(ev);
  }
  return events;
}

export class RealGoogleCalendarProvider implements CalendarProvider {
  mode: "mock" | "real" = "real";
  private calendarId: string;

  constructor(calendarId = GOOGLE_CALENDAR_CONFIG_PLACEHOLDER.calendarId) {
    this.calendarId = calendarId;
  }

  async listEvents(startDate: string, endDate: string): Promise<ScheduleEvent[]> {
    return listGoogleCalendarEventsForId(this.calendarId, startDate, endDate);
  }
}

function resolveCalendarId(): string {
  return getGoogleCalendarSettingsV1().calendarId || GOOGLE_CALENDAR_CONFIG_PLACEHOLDER.calendarId;
}

function resolveProvider(): CalendarProvider {
  const status = getGoogleCalendarOAuthStatus();
  if (status.mode === "real" && status.connected) {
    return new RealGoogleCalendarProvider(resolveCalendarId());
  }
  return new MockGoogleCalendarProvider();
}

let provider: CalendarProvider | null = null;

export function setCalendarProvider(p: CalendarProvider): void {
  provider = p;
}

export function resetCalendarProvider(): void {
  provider = resolveProvider();
}

export function getCalendarProvider(): CalendarProvider {
  if (!provider) provider = resolveProvider();
  return provider;
}

export async function fetchCalendarEvents(startDate: string, endDate: string): Promise<ScheduleEvent[]> {
  return fetchCalendarEventsFromTargets(startDate, endDate);
}

/** 同期モードに応じた複数カレンダーから予定を取得 */
export async function fetchCalendarEventsFromTargets(
  startDate: string,
  endDate: string,
  targetIds?: string[]
): Promise<ScheduleEvent[]> {
  const oauth = getGoogleCalendarOAuthStatus();
  const settings = getGoogleCalendarSettingsV1();

  if (oauth.mode === "real" && oauth.connected) {
    const list = await listGoogleCalendarsDetailed();
    const calendars = list.usedFallback ? [list.fallback] : list.calendars;
    const ids = targetIds?.length
      ? targetIds
      : resolveTargetCalendarIds(settings, calendars);
    const meta = calendarMetaMap(calendars);
    const merged: ScheduleEvent[] = [];
    for (const calId of ids) {
      const cal = meta.get(calId);
      const batch = await listGoogleCalendarEventsForId(calId, startDate, endDate, {
        calendarColor: cal?.backgroundColor ?? null,
        calendarSummary: cal?.summary ?? null,
      });
      merged.push(...batch);
    }
    merged.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.startTime ?? "").localeCompare(b.startTime ?? "");
    });
    return merged;
  }

  return mockMultiCalendarEvents(startDate, endDate, targetIds);
}

function mockMultiCalendarEvents(
  startDate: string,
  endDate: string,
  targetIds?: string[]
): ScheduleEvent[] {
  const settings = getGoogleCalendarSettingsV1();
  const mockCals: GoogleCalendarListItem[] = [
    {
      id: "primary",
      summary: "メインカレンダー（モック）",
      primary: true,
      accessRole: "owner",
      writable: true,
      backgroundColor: "#9a6324",
    },
    {
      id: "mock-work",
      summary: "★TOMS★（モック）",
      primary: false,
      accessRole: "writer",
      writable: true,
      backgroundColor: "#4986e7",
    },
  ];
  const ids = targetIds?.length
    ? targetIds
    : resolveTargetCalendarIds(settings, mockCals);
  const meta = calendarMetaMap(mockCals);
  const base = mockCalendarEvents(startDate, endDate);
  const events: ScheduleEvent[] = [];
  for (const calId of ids) {
    const cal = meta.get(calId);
    for (const ev of base) {
      if ((ev.date.charCodeAt(ev.date.length - 1) + calId.length) % (ids.length + 1) !== 0) continue;
      events.push({
        ...ev,
        id: buildGoogleEventLocalId(calId, `mock-ext-${calId}-${ev.externalId}`),
        externalId: `mock-ext-${calId}-${ev.externalId}`,
        calendarId: calId,
        calendarColor: cal?.backgroundColor ?? null,
        calendarSummary: cal?.summary ?? null,
      });
    }
  }
  if (!events.length && ids.length === 1) {
    const calId = ids[0];
    const cal = meta.get(calId);
    return base.map((ev) => ({
      ...ev,
      id: ev.externalId
        ? buildGoogleEventLocalId(calId, ev.externalId)
        : buildGoogleEventLocalId(calId, ev.id.replace(/^mock-/, "")),
      calendarId: calId,
      calendarColor: cal?.backgroundColor ?? null,
      calendarSummary: cal?.summary ?? null,
    }));
  }
  return events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.startTime ?? "").localeCompare(b.startTime ?? "");
  });
}

export async function syncGoogleCalendarEvents(
  startDate: string,
  endDate: string,
  targetIds?: string[]
): Promise<{ events: ScheduleEvent[]; mode: "mock" | "real"; count: number; calendarIds: string[] }> {
  const guard = assertGoogleCalendarSyncAllowed();
  if (!guard.ok) {
    throw new Error(guard.error);
  }
  const oauth = getGoogleCalendarOAuthStatus();
  const settings = getGoogleCalendarSettingsV1();
  let calendarIds = targetIds ?? [];
  if (!calendarIds.length) {
    const list = await listGoogleCalendarsDetailed();
    const calendars = list.usedFallback ? [list.fallback] : list.calendars;
    calendarIds = resolveTargetCalendarIds(settings, calendars);
  }
  const events = await fetchCalendarEventsFromTargets(startDate, endDate, calendarIds);
  return { events, mode: oauth.mode, count: events.length, calendarIds };
}

export function getCalendarOAuthStatus() {
  return getGoogleCalendarOAuthStatus();
}

const GOOGLE_ERROR_JA: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /invalid_grant/i, message: "Googleログインの有効期限が切れました。再度ログインしてください。" },
  { pattern: /access_denied/i, message: "Googleカレンダーへのアクセスが拒否されました。" },
  { pattern: /unauthorized|401/i, message: "Google認証が無効です。再度ログインしてください。" },
  {
    pattern: /forbidden|403|permission_denied/i,
    message:
      "Googleカレンダーの権限が不足しています。Google連携画面から再ログインしてください。",
  },
  { pattern: /insufficient.*permission|insufficient.*scope/i, message: "Google Calendar APIの権限が不足しています。" },
  { pattern: /calendar.*readonly|readonly.*calendar/i, message: "Google Calendar APIの権限が不足しています（読み取り専用）。設定画面から再ログインしてください。" },
  { pattern: /quota|rate limit/i, message: "Google APIの利用上限に達しました。しばらく待ってから再試行してください。" },
  { pattern: /not found|404/i, message: "指定したカレンダーが見つかりません。" },
];

export function formatGoogleCalendarErrorJa(message: string): string {
  const text = message.trim();
  if (!text) return "同期に失敗しました。しばらく待ってから再試行してください。";
  if (isScheduleCalendarDuplicateError(text)) {
    return formatScheduleCalendarDuplicateErrorForUi(text);
  }
  for (const rule of GOOGLE_ERROR_JA) {
    if (rule.pattern.test(text)) return rule.message;
  }
  if (/[\u3040-\u30ff\u4e00-\u9faf]/.test(text)) return text;
  return `同期に失敗しました: ${text}`;
}

export function formatGoogleCalendarListErrorJa(
  httpStatus?: number,
  rawMessage?: string
): { message: string; code: string; needsRelogin: boolean } {
  if (httpStatus === 403) {
    return {
      message: "Googleカレンダー権限不足です。Google連携画面から再ログインしてください",
      code: "google_calendar_permission_denied",
      needsRelogin: true,
    };
  }
  if (httpStatus === 401) {
    return {
      message: "Googleログイン期限切れです。再ログインしてください",
      code: "google_token_expired",
      needsRelogin: true,
    };
  }
  const formatted = formatGoogleCalendarErrorJa(rawMessage ?? "");
  const needsRelogin = /再ログイン|期限切れ|権限が不足|権限不足|readonly/i.test(formatted);
  return {
    message: formatted,
    code: needsRelogin ? "google_calendar_needs_relogin" : "google_calendar_list_failed",
    needsRelogin,
  };
}

export interface GoogleCalendarDiagnosticStatus {
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  tokenScope: string;
  tokenScopeShort: string;
  tokenExpiry: string | null;
  needsRelogin: boolean;
  calendarListOk: boolean;
  writableCalendarId: string | null;
  selectedCalendarId: string;
  lastSyncSafeLog: GoogleCalendarSafeLog | null;
}

export { formatTokenScopeShort, getGoogleCalendarSafeLog };

export async function getGoogleCalendarDiagnosticStatus(): Promise<GoogleCalendarDiagnosticStatus> {
  const settings = getGoogleCalendarSettingsV1();
  const oauth = getGoogleCalendarOAuthStatus();
  const hasWriteAccess = hasGoogleCalendarWriteScope();
  const scopeNeedsRelogin = oauth.connected && oauth.configured && !hasWriteAccess;

  let calendarListOk = false;
  let writableCalendarId: string | null = null;
  let listNeedsRelogin = false;

  if (oauth.connected && oauth.mode === "real") {
    const list = await listGoogleCalendarsDetailed();
    calendarListOk = !list.usedFallback && list.calendars.length > 0;
    if (calendarListOk) {
      const writable = list.calendars.find((c) => c.writable !== false);
      writableCalendarId = writable?.id ?? list.calendars[0]?.id ?? null;
    } else if (list.httpStatus === 401 || list.httpStatus === 403) {
      listNeedsRelogin = true;
    }
  } else if (oauth.mode === "mock") {
    calendarListOk = true;
    writableCalendarId = settings.calendarId || "primary";
  }

  const tokenScope = getGoogleCalendarTokenScope();
  return {
    hasAccessToken: hasGoogleCalendarAccessToken(),
    hasRefreshToken: hasGoogleCalendarRefreshToken(),
    tokenScope,
    tokenScopeShort: formatTokenScopeShort(tokenScope),
    tokenExpiry: getGoogleCalendarTokenExpiry(),
    needsRelogin: scopeNeedsRelogin || listNeedsRelogin,
    calendarListOk,
    writableCalendarId,
    selectedCalendarId: settings.calendarId || "primary",
    lastSyncSafeLog: getGoogleCalendarSafeLog(),
  };
}

function resolveDisplayStatus(
  oauth: ReturnType<typeof getGoogleCalendarOAuthStatus>,
  sync: CalendarSyncMeta
): { displayStatus: GoogleCalendarDisplayStatus; displayLabel: string } {
  if (!oauth.configured) {
    return { displayStatus: "not_configured", displayLabel: "未設定（mock）" };
  }
  if (!oauth.connected) {
    return { displayStatus: "not_logged_in", displayLabel: "設定済み・未ログイン" };
  }
  if (sync.lastSyncStatus === "failed") {
    return { displayStatus: "sync_failed", displayLabel: "同期失敗" };
  }
  if (sync.lastSyncedAt && sync.lastSyncStatus === "success") {
    return { displayStatus: "sync_success", displayLabel: "同期成功" };
  }
  return { displayStatus: "logged_in", displayLabel: "Googleログイン済み" };
}

function resolveButtonState(displayStatus: GoogleCalendarDisplayStatus): {
  buttonLabel: string;
  buttonDisabled: boolean;
} {
  switch (displayStatus) {
    case "not_configured":
      return { buttonLabel: "Google連携は未設定です", buttonDisabled: true };
    case "not_logged_in":
      return { buttonLabel: "Googleログイン", buttonDisabled: false };
    case "logged_in":
    case "sync_success":
    case "sync_failed":
      return { buttonLabel: "Google予定を同期", buttonDisabled: false };
    case "mock":
      return { buttonLabel: "Google予定を同期", buttonDisabled: true };
    default:
      return { buttonLabel: "Google予定を同期", buttonDisabled: false };
  }
}

export function getGoogleCalendarPublicStatus(): GoogleCalendarPublicStatus {
  const oauth = getGoogleCalendarOAuthStatus();
  const syncMeta = getCalendarSyncMeta();
  const { displayStatus, displayLabel } = resolveDisplayStatus(oauth, syncMeta);
  const { buttonLabel, buttonDisabled } = resolveButtonState(displayStatus);
  const clientSecretConfigured = Boolean(
    process.env.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_CALENDAR_CLIENT_SECRET
  );
  const grantedScopes = getGoogleCalendarGrantedScopes();
  const hasWriteAccess = hasGoogleCalendarWriteScope();
  const needsReLogin = oauth.connected && oauth.configured && !hasWriteAccess;
  const scopeLabel = !oauth.connected
    ? "未ログイン"
    : needsReLogin
      ? "読み取り専用 — 再ログインが必要"
      : hasWriteAccess
        ? "カレンダー読み書き"
        : "不明";
  return {
    enabled: oauth.enabled,
    configured: oauth.configured,
    clientIdConfigured: oauth.clientIdConfigured,
    clientSecretConfigured,
    redirectUri: oauth.redirectUri,
    mode: oauth.configured ? "live" : "mock",
    missingEnv: oauth.missingEnv ?? [],
    connected: oauth.connected,
    displayStatus,
    displayLabel,
    sync: {
      lastSyncedAt: syncMeta.lastSyncedAt,
      eventCount: syncMeta.eventCount,
      lastSyncStatus: syncMeta.lastSyncStatus ?? null,
      lastSyncError: syncMeta.lastSyncError
        ? formatGoogleCalendarErrorJa(syncMeta.lastSyncError)
        : null,
      lastSyncSafeLog: syncMeta.lastSyncSafeLog ?? getGoogleCalendarSafeLog(),
    },
    buttonLabel,
    buttonDisabled: buttonDisabled || needsReLogin,
    scope: {
      granted: grantedScopes,
      hasWriteAccess,
      needsReLogin,
      label: scopeLabel,
    },
    oauthDebug: getGoogleCalendarOAuthEnvDebug(),
  };
}

export function getCalendarAuthUrl() {
  return getGoogleCalendarAuthUrl();
}

export async function handleCalendarOAuthCallback(input: {
  code?: string;
  error?: string;
  error_description?: string;
}) {
  return handleGoogleCalendarOAuthCallback(input);
}


export function getWeekStartWithOffset(offsetWeeks = 0, timeZone = "Asia/Tokyo"): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone });
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).formatToParts(
    new Date(`${today}T12:00:00+09:00`)
  );
  const wd =
    weekday.find((p) => p.type === "weekday")?.value ??
    new Date(`${today}T12:00:00+09:00`).toLocaleDateString("en-US", { weekday: "short", timeZone });
  const dayIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? 1;
  const mondayOffset = dayIndex === 0 ? -6 : 1 - dayIndex;
  return addDays(today, mondayOffset + offsetWeeks * 7);
}

/** 日程調整 PWA — 今日（JST）を基準にした7日間ウィンドウの開始日 */
export function todayInTimeZone(timeZone = "Asia/Tokyo"): string {
  return new Date().toLocaleDateString("en-CA", { timeZone });
}

export function getScheduleWindowStartWithOffset(offsetWeeks = 0, timeZone = "Asia/Tokyo"): string {
  const today = todayInTimeZone(timeZone);
  const offset = Math.max(0, Math.trunc(offsetWeeks));
  return addDays(today, offset * 7);
}
