import { getDatabase } from "../db/database.js";
import { logBusinessIntegration } from "../business/business-integration-log.js";
import {
  extractGoogleApiSafeLog,
  saveGoogleCalendarSafeLog,
  type GoogleCalendarSafeLog,
} from "../schedule/google-calendar-safe-log.js";

const REFRESH_TOKEN_KEY = "google_oauth_refresh_token";
const ACCESS_TOKEN_KEY = "google_oauth_access_token";
const SCOPES_KEY = "google_oauth_scopes";

const CALENDAR_WRITE_SCOPE = "https://www.googleapis.com/auth/calendar";
const CALENDAR_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

export const GOOGLE_CALENDAR_OAUTH_SCOPE = CALENDAR_WRITE_SCOPE;

export function maskGoogleClientId(clientId: string): string {
  const id = clientId.trim();
  if (!id) return "—";
  if (id.length <= 12) return `${id.slice(0, 3)}…${id.slice(-3)}`;
  return `${id.slice(0, 6)}…${id.slice(-6)}`;
}

export interface GoogleCalendarOAuthEnvDebug {
  redirectUri: string;
  clientIdMasked: string;
  scopes: string;
  calendarEnabled: boolean;
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
  redirectUriMatchesExpected: boolean;
  expectedRedirectUri: string;
}

export function getGoogleCalendarOAuthEnvDebug(): GoogleCalendarOAuthEnvDebug {
  const redirectUri = readGoogleRedirectUri();
  const expectedRedirectUri = DEFAULT_GOOGLE_CALENDAR_REDIRECT_URI;
  return {
    redirectUri,
    clientIdMasked: maskGoogleClientId(readGoogleClientId()),
    scopes: GOOGLE_CALENDAR_OAUTH_SCOPE,
    calendarEnabled: process.env.GOOGLE_CALENDAR_ENABLED === "true",
    clientIdConfigured: Boolean(readGoogleClientId().trim()),
    clientSecretConfigured: Boolean(readGoogleClientSecret().trim()),
    redirectUriMatchesExpected: redirectUri === expectedRedirectUri,
    expectedRedirectUri,
  };
}

export interface GoogleOAuthCallbackDebug extends GoogleCalendarOAuthEnvDebug {
  callbackReached: boolean;
  error: string | null;
  errorDescription: string | null;
  accessTokenSaved: boolean;
  refreshTokenSaved: boolean;
}

export function buildGoogleOAuthCallbackDebug(input: {
  callbackReached?: boolean;
  error?: string | null;
  errorDescription?: string | null;
  accessTokenSaved?: boolean;
  refreshTokenSaved?: boolean;
}): GoogleOAuthCallbackDebug {
  return {
    ...getGoogleCalendarOAuthEnvDebug(),
    callbackReached: input.callbackReached ?? true,
    error: input.error ?? null,
    errorDescription: input.errorDescription ?? null,
    accessTokenSaved: Boolean(input.accessTokenSaved),
    refreshTokenSaved: Boolean(input.refreshTokenSaved),
  };
}

export function buildGoogleCalendarOAuthSettingsRedirectQuery(result: {
  ok: boolean;
  message: string;
  oauthDebug: GoogleOAuthCallbackDebug;
}): string {
  const params = new URLSearchParams();
  if (result.ok) {
    params.set("oauth", "ok");
  } else {
    params.set("error", result.message);
    if (result.oauthDebug.error) params.set("oauth_error", result.oauthDebug.error);
    if (result.oauthDebug.errorDescription) {
      params.set("oauth_error_description", result.oauthDebug.errorDescription);
    }
  }
  params.set("oauth_callback", result.oauthDebug.callbackReached ? "reached" : "not_reached");
  params.set("oauth_redirect_uri", result.oauthDebug.redirectUri);
  params.set("oauth_client_id", result.oauthDebug.clientIdMasked);
  params.set("oauth_access_token_saved", String(result.oauthDebug.accessTokenSaved));
  params.set("oauth_refresh_token_saved", String(result.oauthDebug.refreshTokenSaved));
  return params.toString();
}

export function formatGoogleOAuthErrorHint(error: string | null, errorDescription: string | null): string {
  const code = (error ?? "").toLowerCase();
  const desc = (errorDescription ?? "").toLowerCase();
  if (code === "org_internal" || desc.includes("org_internal")) {
    return "OAuth User Type が Internal のため、組織外アカウントはログインできません。Google Cloud Console で External に変更するか、Test users に追加してください。";
  }
  if (code === "access_denied") {
    return "Googleログインがキャンセルまたは拒否されました。";
  }
  if (errorDescription) return errorDescription;
  if (error) return error;
  return "OAuthエラーが発生しました。";
}

export interface GoogleApiErrorBody {
  error?: {
    message?: string;
    code?: number;
    status?: string;
    errors?: Array<{ message?: string; reason?: string }>;
  };
}

/** Google API エラーをログ出力（トークン・シークレットは含めない） */
export function logGoogleCalendarApiError(
  operation: string,
  httpStatus: number,
  body: GoogleApiErrorBody
): void {
  const err = body.error;
  console.error(`[google-calendar] ${operation} failed`, {
    httpStatus,
    message: err?.message ?? "(no message)",
    code: err?.code,
    status: err?.status,
    reasons: err?.errors?.map((e) => e.reason).filter(Boolean),
  });
}

export function googleApiErrorMessage(body: GoogleApiErrorBody, httpStatus: number): string {
  return body.error?.message ?? `Google API error (${httpStatus})`;
}

export type GoogleOAuthMode = "mock" | "real";

export interface GoogleOAuthConfig {
  enabled: boolean;
  mode: GoogleOAuthMode;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken: string | null;
}

const DEFAULT_GOOGLE_CALENDAR_REDIRECT_URI = "https://tisly.jp/auth/google/callback";

export const GOOGLE_CALENDAR_NOT_CONFIGURED_MSG =
  "Googleカレンダー未設定：設定画面でログインしてください";

export function inspectGoogleCalendarEnv(): {
  missingEnv: string[];
  configured: boolean;
} {
  const missingEnv: string[] = [];
  if (process.env.GOOGLE_CALENDAR_ENABLED !== "true") {
    missingEnv.push("GOOGLE_CALENDAR_ENABLED");
  }
  if (!readGoogleClientId().trim()) {
    missingEnv.push("GOOGLE_CLIENT_ID");
  }
  if (!readGoogleClientSecret().trim()) {
    missingEnv.push("GOOGLE_CLIENT_SECRET");
  }
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI?.trim() ||
    process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim() ||
    "";
  if (!redirectUri) {
    missingEnv.push("GOOGLE_REDIRECT_URI");
  }
  return {
    missingEnv,
    configured: missingEnv.length === 0,
  };
}

export function assertGoogleCalendarSyncAllowed():
  | { ok: true }
  | { ok: false; status: number; error: string } {
  const env = inspectGoogleCalendarEnv();
  if (!env.configured) {
    return { ok: false, status: 503, error: GOOGLE_CALENDAR_NOT_CONFIGURED_MSG };
  }
  const cfg = getGoogleCalendarOAuthConfig();
  if (!cfg.refreshToken) {
    return {
      ok: false,
      status: 503,
      error: GOOGLE_CALENDAR_NOT_CONFIGURED_MSG,
    };
  }
  return { ok: true };
}

function readGoogleClientId(): string {
  return process.env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "";
}

function readGoogleClientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? "";
}

function readGoogleRedirectUri(): string {
  return (
    process.env.GOOGLE_REDIRECT_URI ??
    process.env.GOOGLE_CALENDAR_REDIRECT_URI ??
    DEFAULT_GOOGLE_CALENDAR_REDIRECT_URI
  );
}

function envMode(): GoogleOAuthMode {
  const enabled = process.env.GOOGLE_OAUTH_ENABLED === "true";
  const hasCreds =
    Boolean(readGoogleClientId()) &&
    Boolean(readGoogleClientSecret()) &&
    Boolean(process.env.GOOGLE_REDIRECT_URI);
  if (enabled && hasCreds) return "real";
  return "mock";
}

function calendarEnvMode(): GoogleOAuthMode {
  return inspectGoogleCalendarEnv().configured ? "real" : "mock";
}

function readStoredTokenRow(key: string): { token?: string; expiresAt?: number } | null {
  const row = getDatabase()
    .prepare(`SELECT value_json FROM platform_settings WHERE key = ?`)
    .get(key) as { value_json: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value_json) as { token?: string; expiresAt?: number };
  } catch {
    return null;
  }
}

function readStoredToken(key: string): string | null {
  return readStoredTokenRow(key)?.token ?? null;
}

export function hasGoogleCalendarAccessToken(): boolean {
  return Boolean(readStoredToken(ACCESS_TOKEN_KEY));
}

export function hasGoogleCalendarRefreshToken(): boolean {
  const cfg = getGoogleCalendarOAuthConfig();
  return Boolean(cfg.refreshToken);
}

export function getGoogleCalendarTokenExpiry(): string | null {
  const row = readStoredTokenRow(ACCESS_TOKEN_KEY);
  if (!row?.expiresAt) return null;
  return new Date(row.expiresAt).toISOString();
}

export function getGoogleCalendarTokenScope(): string {
  const scopes = readStoredScopes();
  return scopes.length ? scopes.join(" ") : "";
}

function writeStoredToken(key: string, token: string, extra?: Record<string, unknown>): void {
  getDatabase()
    .prepare(
      `INSERT OR REPLACE INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(key, JSON.stringify({ token, at: new Date().toISOString(), ...extra }));
}

function readStoredScopes(): string[] {
  const row = getDatabase()
    .prepare(`SELECT value_json FROM platform_settings WHERE key = ?`)
    .get(SCOPES_KEY) as { value_json: string } | undefined;
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value_json) as { scopes?: string[]; scope?: string };
    if (Array.isArray(parsed.scopes)) return parsed.scopes;
    if (typeof parsed.scope === "string") {
      return parsed.scope.split(/\s+/).filter(Boolean);
    }
    return [];
  } catch {
    return [];
  }
}

function saveGrantedScopes(scope: string): void {
  const scopes = scope.split(/\s+/).filter(Boolean);
  getDatabase()
    .prepare(
      `INSERT OR REPLACE INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(SCOPES_KEY, JSON.stringify({ scopes, scope, at: new Date().toISOString() }));
}

export function getGoogleCalendarGrantedScopes(): string[] {
  return readStoredScopes();
}

export function hasGoogleCalendarWriteScope(): boolean {
  const scopes = readStoredScopes();
  if (scopes.length === 0) return true;
  if (scopes.includes(CALENDAR_WRITE_SCOPE)) return true;
  if (scopes.some((s) => s.endsWith("/auth/calendar") && !s.includes("readonly"))) return true;
  if (scopes.includes(CALENDAR_READONLY_SCOPE)) return false;
  return true;
}

export async function refreshGoogleCalendarGrantedScopes(): Promise<string[]> {
  const cfg = getGoogleCalendarOAuthConfig();
  if (cfg.mode === "mock" || !cfg.refreshToken) return readStoredScopes();
  try {
    const token = await refreshGoogleAccessToken("calendar");
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(token)}`
    );
    const json = (await res.json()) as { scope?: string; error?: string };
    if (res.ok && json.scope) {
      saveGrantedScopes(json.scope);
      return json.scope.split(/\s+/).filter(Boolean);
    }
  } catch {
    /* keep cached scopes */
  }
  return readStoredScopes();
}

export function getGoogleOAuthConfig(): GoogleOAuthConfig {
  return {
    enabled: process.env.GOOGLE_OAUTH_ENABLED === "true",
    mode: envMode(),
    clientId: readGoogleClientId(),
    clientSecret: readGoogleClientSecret(),
    redirectUri: process.env.GOOGLE_REDIRECT_URI ?? "",
    refreshToken:
      readStoredToken(REFRESH_TOKEN_KEY) ?? process.env.GOOGLE_REFRESH_TOKEN ?? null,
  };
}

export function getGoogleCalendarOAuthConfig(): GoogleOAuthConfig {
  return {
    enabled: process.env.GOOGLE_CALENDAR_ENABLED === "true",
    mode: calendarEnvMode(),
    clientId: readGoogleClientId(),
    clientSecret: readGoogleClientSecret(),
    redirectUri: readGoogleRedirectUri(),
    refreshToken:
      readStoredToken(REFRESH_TOKEN_KEY) ?? process.env.GOOGLE_REFRESH_TOKEN ?? null,
  };
}

export function getGoogleCalendarOAuthStatus() {
  const cfg = getGoogleCalendarOAuthConfig();
  const env = inspectGoogleCalendarEnv();
  return {
    enabled: cfg.enabled,
    configured: env.configured,
    mode: cfg.mode,
    connected: env.configured ? Boolean(cfg.refreshToken) : false,
    clientIdConfigured: Boolean(cfg.clientId),
    redirectUri: env.configured ? cfg.redirectUri || null : null,
    missingEnv: env.missingEnv,
  };
}

export function saveGoogleRefreshToken(token: string): void {
  writeStoredToken(REFRESH_TOKEN_KEY, token);
}

function saveAccessToken(token: string, expiresIn?: number): void {
  writeStoredToken(ACCESS_TOKEN_KEY, token, {
    expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
  });
}

export function getGoogleOAuthStatus() {
  const cfg = getGoogleOAuthConfig();
  return {
    enabled: cfg.enabled,
    mode: cfg.mode,
    connected: cfg.mode === "mock" ? true : Boolean(cfg.refreshToken),
    calendar: { provider: cfg.mode, ready: cfg.mode === "mock" || Boolean(cfg.refreshToken) },
    gmail: { provider: cfg.mode, ready: cfg.mode === "mock" || Boolean(cfg.refreshToken) },
    clientIdConfigured: Boolean(cfg.clientId),
    redirectUri: cfg.redirectUri || null,
  };
}

export function getGoogleCalendarAuthUrl(): {
  url: string;
  mode: GoogleOAuthMode;
  configured: boolean;
} {
  const cfg = getGoogleCalendarOAuthConfig();
  const env = inspectGoogleCalendarEnv();
  if (!env.configured) {
    return { mode: "mock", url: "", configured: false };
  }
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_OAUTH_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: "schedule",
  });
  return {
    mode: "real",
    configured: true,
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  };
}

export async function handleGoogleCalendarOAuthCallback(input: {
  code?: string;
  error?: string;
  error_description?: string;
}): Promise<{
  ok: boolean;
  mode: GoogleOAuthMode;
  message: string;
  refreshTokenSaved?: boolean;
  accessTokenSaved?: boolean;
  oauthDebug: GoogleOAuthCallbackDebug;
}> {
  const cfg = getGoogleCalendarOAuthConfig();
  if (input.error) {
    const oauthDebug = buildGoogleOAuthCallbackDebug({
      error: input.error,
      errorDescription: input.error_description ?? null,
    });
    return {
      ok: false,
      mode: cfg.mode,
      message: formatGoogleOAuthErrorHint(input.error, input.error_description ?? null),
      oauthDebug,
    };
  }
  if (!inspectGoogleCalendarEnv().configured) {
    if (input.code === "mock") {
      saveGoogleRefreshToken(`mock-calendar-refresh-${Date.now()}`);
      return {
        ok: true,
        mode: "mock",
        message: "Mock Calendar OAuth: refresh token stored",
        refreshTokenSaved: true,
        accessTokenSaved: false,
        oauthDebug: buildGoogleOAuthCallbackDebug({ refreshTokenSaved: true }),
      };
    }
    return {
      ok: false,
      mode: "mock",
      message: GOOGLE_CALENDAR_NOT_CONFIGURED_MSG,
      oauthDebug: buildGoogleOAuthCallbackDebug({ error: GOOGLE_CALENDAR_NOT_CONFIGURED_MSG }),
    };
  }
  if (!input.code) {
    return {
      ok: false,
      mode: "real",
      message: "authorization code required",
      oauthDebug: buildGoogleOAuthCallbackDebug({ error: "authorization code required" }),
    };
  }
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: cfg.redirectUri,
      }),
    });
    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !json.access_token) {
      throw new Error(json.error_description ?? json.error ?? `token exchange failed (${res.status})`);
    }
    if (json.refresh_token) saveGoogleRefreshToken(json.refresh_token);
    saveAccessToken(json.access_token, json.expires_in);
    if (typeof (json as { scope?: string }).scope === "string") {
      saveGrantedScopes((json as { scope: string }).scope);
    }
    const refreshTokenSaved = Boolean(json.refresh_token);
    return {
      ok: true,
      mode: "real",
      message: "Calendar OAuth tokens stored",
      refreshTokenSaved,
      accessTokenSaved: true,
      oauthDebug: buildGoogleOAuthCallbackDebug({
        accessTokenSaved: true,
        refreshTokenSaved,
      }),
    };
  } catch (e) {
    const err = e as Error;
    return {
      ok: false,
      mode: "real",
      message: err.message,
      oauthDebug: buildGoogleOAuthCallbackDebug({ error: err.message }),
    };
  }
}

export function getGoogleAuthUrl(state = "business"): { url: string; mode: GoogleOAuthMode } {
  const cfg = getGoogleOAuthConfig();
  if (cfg.mode === "mock") {
    return {
      mode: "mock",
      url: `/api/business/google/callback?code=mock&state=${encodeURIComponent(state)}`,
    };
  }
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/gmail.compose",
      "https://www.googleapis.com/auth/gmail.send",
    ].join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return {
    mode: "real",
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  };
}

async function exchangeToken(body: Record<string, string>): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}> {
  const cfg = getGoogleOAuthConfig();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      ...body,
    }),
  });
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description ?? json.error ?? `token exchange failed (${res.status})`);
  }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_in: json.expires_in,
  };
}

export async function refreshGoogleAccessToken(scope: "business" | "calendar" = "business"): Promise<string> {
  const cfg = scope === "calendar" ? getGoogleCalendarOAuthConfig() : getGoogleOAuthConfig();
  if (cfg.mode === "mock") return "mock-access-token";
  if (!cfg.refreshToken) throw new Error("no refresh token");
  const tokens = await exchangeToken({
    grant_type: "refresh_token",
    refresh_token: cfg.refreshToken,
  });
  saveAccessToken(tokens.access_token, tokens.expires_in);
  if (tokens.refresh_token) saveGoogleRefreshToken(tokens.refresh_token);
  return tokens.access_token;
}

async function getAccessToken(): Promise<string> {
  const cfg = getGoogleOAuthConfig();
  if (cfg.mode === "mock") return "mock-access-token";
  const cached = readStoredToken(ACCESS_TOKEN_KEY);
  if (cached) return cached;
  return refreshGoogleAccessToken();
}

export async function handleGoogleOAuthCallback(input: {
  code?: string;
  error?: string;
}): Promise<{ ok: boolean; mode: GoogleOAuthMode; message: string; refreshTokenSaved?: boolean }> {
  const cfg = getGoogleOAuthConfig();
  if (input.error) {
    return { ok: false, mode: cfg.mode, message: input.error };
  }
  if (cfg.mode === "mock") {
    saveGoogleRefreshToken(`mock-refresh-${Date.now()}`);
    return {
      ok: true,
      mode: "mock",
      message: "Mock OAuth: refresh token stored",
      refreshTokenSaved: true,
    };
  }
  if (!input.code) {
    return { ok: false, mode: "real", message: "authorization code required" };
  }
  try {
    const tokens = await exchangeToken({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: cfg.redirectUri,
    });
    if (tokens.refresh_token) saveGoogleRefreshToken(tokens.refresh_token);
    saveAccessToken(tokens.access_token, tokens.expires_in);
    return {
      ok: true,
      mode: "real",
      message: "OAuth tokens stored",
      refreshTokenSaved: Boolean(tokens.refresh_token),
    };
  } catch (e) {
    return { ok: false, mode: "real", message: (e as Error).message };
  }
}

export async function testGoogleOAuthConnection(): Promise<{
  ok: boolean;
  mode: GoogleOAuthMode;
  calendar: string;
  gmail: string;
}> {
  const cfg = getGoogleOAuthConfig();
  if (cfg.mode === "mock") {
    return {
      ok: true,
      mode: "mock",
      calendar: "mock calendar API reachable",
      gmail: "mock gmail API reachable",
    };
  }
  if (!cfg.refreshToken) {
    return {
      ok: false,
      mode: "real",
      calendar: "no refresh token",
      gmail: "no refresh token",
    };
  }
  try {
    const token = await getAccessToken();
    const calRes = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const gmailRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return {
      ok: calRes.ok && gmailRes.ok,
      mode: "real",
      calendar: calRes.ok ? "Calendar API OK" : `Calendar API ${calRes.status}`,
      gmail: gmailRes.ok ? "Gmail API OK" : `Gmail API ${gmailRes.status}`,
    };
  } catch (e) {
    return {
      ok: false,
      mode: "real",
      calendar: (e as Error).message,
      gmail: (e as Error).message,
    };
  }
}

export interface GoogleCalendarCreateInput {
  projectId?: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
}

export interface GoogleCalendarListItem {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string;
  writable?: boolean;
  backgroundColor?: string | null;
}

export async function listGoogleCalendars(): Promise<GoogleCalendarListItem[]> {
  const result = await listGoogleCalendarsDetailed();
  if (result.calendars.length > 0) return result.calendars;
  if (result.usedFallback) return [result.fallback];
  return [];
}

export interface GoogleCalendarListResult {
  calendars: GoogleCalendarListItem[];
  usedFallback: boolean;
  fallback: GoogleCalendarListItem;
  apiError?: string;
  httpStatus?: number;
}

const PRIMARY_LIST_FALLBACK: GoogleCalendarListItem = {
  id: "primary",
  summary: "メインカレンダー",
  primary: true,
  accessRole: "owner",
  writable: true,
  backgroundColor: "#9a6324",
};

export async function listGoogleCalendarsDetailed(): Promise<GoogleCalendarListResult> {
  const cfg = getGoogleCalendarOAuthConfig();
  if (cfg.mode === "mock") {
    return {
      calendars: [
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
        {
          id: "mock-readonly",
          summary: "社員共有（読取のみ・モック）",
          primary: false,
          accessRole: "reader",
          writable: false,
          backgroundColor: "#ac725e",
        },
      ],
      usedFallback: false,
      fallback: PRIMARY_LIST_FALLBACK,
    };
  }
  const token = await refreshGoogleAccessToken("calendar");
  const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as GoogleApiErrorBody & {
    items?: Array<{
      id?: string;
      summary?: string;
      primary?: boolean;
      accessRole?: string;
      backgroundColor?: string;
    }>;
  };
  if (!res.ok) {
    logGoogleCalendarApiError("calendarList", res.status, json);
    saveGoogleCalendarSafeLog(extractGoogleApiSafeLog("calendarList", res.status, json));
    const msg = googleApiErrorMessage(json, res.status);
    return {
      calendars: [],
      usedFallback: true,
      fallback: PRIMARY_LIST_FALLBACK,
      apiError: msg,
      httpStatus: res.status,
    };
  }
  const calendars = (json.items ?? [])
    .filter((i) => i.id && i.summary)
    .map((i) => {
      const accessRole = i.accessRole ?? "reader";
      return {
        id: i.id!,
        summary: i.summary!,
        primary: Boolean(i.primary),
        accessRole,
        writable: accessRole === "owner" || accessRole === "writer",
        backgroundColor: i.backgroundColor ?? null,
      };
    })
    .sort((a, b) => {
      if (a.primary !== b.primary) return a.primary ? -1 : 1;
      return a.summary.localeCompare(b.summary, "ja");
    });
  if (calendars.length === 0) {
    return {
      calendars: [],
      usedFallback: true,
      fallback: PRIMARY_LIST_FALLBACK,
      apiError: "writable calendar not found",
    };
  }
  return { calendars, usedFallback: false, fallback: PRIMARY_LIST_FALLBACK };
}

export function clearGoogleCalendarTokens(): void {
  getDatabase()
    .prepare(`DELETE FROM platform_settings WHERE key IN (?, ?, ?)`)
    .run(REFRESH_TOKEN_KEY, ACCESS_TOKEN_KEY, SCOPES_KEY);
}

export interface GoogleCalendarSyncEventInput {
  calendarId: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
}

export async function createGoogleCalendarEventForSync(
  input: GoogleCalendarSyncEventInput
): Promise<{ mode: GoogleOAuthMode; eventId: string; htmlLink?: string }> {
  const cfg = getGoogleCalendarOAuthConfig();
  if (cfg.mode === "mock") {
    const eventId = `mock-event-${Date.now()}`;
    return { mode: "mock", eventId };
  }
  const token = await refreshGoogleAccessToken("calendar");
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: input.title,
        location: input.location,
        description: input.description,
        start: { dateTime: input.start, timeZone: "Asia/Tokyo" },
        end: { dateTime: input.end, timeZone: "Asia/Tokyo" },
      }),
    }
  );
  const json = (await res.json()) as GoogleApiErrorBody & {
    id?: string;
    htmlLink?: string;
  };
  if (!res.ok || !json.id) {
    logGoogleCalendarApiError("events.insert", res.status, json);
    saveGoogleCalendarSafeLog(extractGoogleApiSafeLog("events.insert", res.status, json));
    throw new Error(googleApiErrorMessage(json, res.status));
  }
  return { mode: "real", eventId: json.id, htmlLink: json.htmlLink };
}

function addHoursIsoTokyo(hours: number): string {
  const now = new Date();
  now.setTime(now.getTime() + hours * 60 * 60 * 1000);
  return now.toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" }).replace(" ", "T");
}

export interface GoogleCalendarTestEventResult {
  ok: boolean;
  mode: GoogleOAuthMode;
  calendarId: string;
  eventId?: string;
  deleted?: boolean;
  safeLog?: GoogleCalendarSafeLog | null;
  googleErrorCode?: string | number | null;
  googleErrorMessage?: string | null;
  httpStatus?: number | null;
  error?: string;
}

/** OAuth 書き込み診断: テストイベント作成 → 成功時即削除 */
export async function testGoogleCalendarEventWrite(
  calendarId = "primary"
): Promise<GoogleCalendarTestEventResult> {
  const cfg = getGoogleCalendarOAuthConfig();
  const calId = calendarId.trim() || "primary";
  if (cfg.mode === "mock") {
    return { ok: true, mode: "mock", calendarId: calId, eventId: "mock-test", deleted: true };
  }
  const token = await refreshGoogleAccessToken("calendar");
  const start = addHoursIsoTokyo(1);
  const end = addHoursIsoTokyo(2);
  const createRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: "TISLY OAuth Test",
        start: { dateTime: `${start}+09:00`, timeZone: "Asia/Tokyo" },
        end: { dateTime: `${end}+09:00`, timeZone: "Asia/Tokyo" },
      }),
    }
  );
  const createJson = (await createRes.json()) as GoogleApiErrorBody & { id?: string };
  if (!createRes.ok || !createJson.id) {
    logGoogleCalendarApiError("events.insert.test", createRes.status, createJson);
    const safeLog = extractGoogleApiSafeLog("events.insert.test", createRes.status, createJson);
    saveGoogleCalendarSafeLog(safeLog);
    return {
      ok: false,
      mode: "real",
      calendarId: calId,
      safeLog,
      googleErrorCode: safeLog.googleErrorCode,
      googleErrorMessage: safeLog.googleErrorMessage,
      httpStatus: createRes.status,
      error: googleApiErrorMessage(createJson, createRes.status),
    };
  }
  const eventId = createJson.id;
  const delRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
  );
  if (!delRes.ok && delRes.status !== 204 && delRes.status !== 410) {
    const delJson = (await delRes.json().catch(() => ({}))) as GoogleApiErrorBody;
    logGoogleCalendarApiError("events.delete.test", delRes.status, delJson);
  }
  return { ok: true, mode: "real", calendarId: calId, eventId, deleted: true };
}

export async function updateGoogleCalendarEventForSync(
  input: GoogleCalendarSyncEventInput & { eventId: string }
): Promise<{ mode: GoogleOAuthMode; eventId: string }> {
  const cfg = getGoogleCalendarOAuthConfig();
  if (cfg.mode === "mock") {
    return { mode: "mock", eventId: input.eventId };
  }
  const token = await refreshGoogleAccessToken("calendar");
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: input.title,
        location: input.location,
        description: input.description,
        start: { dateTime: input.start, timeZone: "Asia/Tokyo" },
        end: { dateTime: input.end, timeZone: "Asia/Tokyo" },
      }),
    }
  );
  const json = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !json.id) {
    throw new Error(json.error?.message ?? `Calendar update failed (${res.status})`);
  }
  return { mode: "real", eventId: json.id };
}

export async function markGoogleCalendarEventComplete(input: {
  calendarId: string;
  eventId: string;
  completionNote: string;
}): Promise<{ mode: GoogleOAuthMode; eventId: string }> {
  const cfg = getGoogleCalendarOAuthConfig();
  if (cfg.mode === "mock") {
    return { mode: "mock", eventId: input.eventId };
  }
  const token = await refreshGoogleAccessToken("calendar");
  const getRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const current = (await getRes.json()) as {
    summary?: string;
    description?: string;
    error?: { message?: string };
  };
  if (!getRes.ok) {
    throw new Error(current.error?.message ?? `Calendar get failed (${getRes.status})`);
  }
  const summary = current.summary?.includes("✅") ? current.summary : `✅ ${current.summary ?? "工事"}`;
  const description = [current.description ?? "", input.completionNote].filter(Boolean).join("\n\n");
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary,
        description,
        colorId: "10",
      }),
    }
  );
  const json = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !json.id) {
    throw new Error(json.error?.message ?? `Calendar complete mark failed (${res.status})`);
  }
  return { mode: "real", eventId: json.id };
}

export async function createGoogleCalendarEvent(
  input: GoogleCalendarCreateInput
): Promise<{ mode: GoogleOAuthMode; eventId: string; htmlLink?: string }> {
  const cfg = getGoogleOAuthConfig();
  if (cfg.mode === "mock") {
    const eventId = `mock-event-${Date.now()}`;
    logBusinessIntegration({
      projectId: input.projectId,
      type: "calendar",
      provider: "mock",
      status: "success",
      request: input,
      response: { eventId },
    });
    return { mode: "mock", eventId };
  }
  const token = await getAccessToken();
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: input.title,
        location: input.location,
        description: input.description,
        start: { dateTime: input.start, timeZone: "Asia/Tokyo" },
        end: { dateTime: input.end, timeZone: "Asia/Tokyo" },
      }),
    }
  );
  const json = (await res.json()) as { id?: string; htmlLink?: string; error?: { message?: string } };
  if (!res.ok || !json.id) {
    const msg = json.error?.message ?? `Calendar create failed (${res.status})`;
    logBusinessIntegration({
      projectId: input.projectId,
      type: "calendar",
      provider: "google",
      status: "error",
      request: input,
      errorMessage: msg,
    });
    throw new Error(msg);
  }
  logBusinessIntegration({
    projectId: input.projectId,
    type: "calendar",
    provider: "google",
    status: "success",
    request: input,
    response: { eventId: json.id, htmlLink: json.htmlLink },
  });
  return { mode: "real", eventId: json.id, htmlLink: json.htmlLink };
}

function buildRawEmail(to: string, subject: string, body: string): string {
  const lines = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(body).toString("base64"),
  ];
  return lines.join("\r\n");
}

export interface GmailDraftInput {
  projectId?: string;
  to: string;
  subject: string;
  body: string;
}

export async function createGmailDraft(
  input: GmailDraftInput
): Promise<{ mode: GoogleOAuthMode; draftId: string; messageId?: string }> {
  const cfg = getGoogleOAuthConfig();
  if (cfg.mode === "mock") {
    const draftId = `mock-draft-${Date.now()}`;
    logBusinessIntegration({
      projectId: input.projectId,
      type: "gmail",
      provider: "mock",
      status: "success",
      request: { op: "draft", ...input },
      response: { draftId },
    });
    return { mode: "mock", draftId };
  }
  const token = await getAccessToken();
  const raw = Buffer.from(buildRawEmail(input.to, input.subject, input.body))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: { raw } }),
  });
  const json = (await res.json()) as {
    id?: string;
    message?: { id?: string };
    error?: { message?: string };
  };
  if (!res.ok || !json.id) {
    const msg = json.error?.message ?? `Gmail draft failed (${res.status})`;
    logBusinessIntegration({
      projectId: input.projectId,
      type: "gmail",
      provider: "google",
      status: "error",
      request: input,
      errorMessage: msg,
    });
    throw new Error(msg);
  }
  logBusinessIntegration({
    projectId: input.projectId,
    type: "gmail",
    provider: "google",
    status: "success",
    request: { op: "draft", ...input },
    response: { draftId: json.id, messageId: json.message?.id },
  });
  return { mode: "real", draftId: json.id, messageId: json.message?.id };
}

export async function sendGmailPlaceholder(
  input: GmailDraftInput & { confirmed?: boolean }
): Promise<{ mode: GoogleOAuthMode; status: "skipped" | "sent" | "dry_run"; message: string }> {
  const cfg = getGoogleOAuthConfig();
  if (cfg.mode === "mock") {
    logBusinessIntegration({
      projectId: input.projectId,
      type: "gmail",
      provider: "mock",
      status: "skipped",
      request: { op: "send_placeholder", ...input },
      response: { note: "mock send — no real delivery" },
    });
    return { mode: "mock", status: "skipped", message: "Mock Gmail send (placeholder)" };
  }
  if (!input.confirmed) {
    logBusinessIntegration({
      projectId: input.projectId,
      type: "gmail",
      provider: "google",
      status: "skipped",
      request: input,
      response: { reason: "confirmation required" },
    });
    return {
      mode: "real",
      status: "dry_run",
      message: "Real Gmail send requires confirmed=true and real_send guard",
    };
  }
  logBusinessIntegration({
    projectId: input.projectId,
    type: "gmail",
    provider: "google",
    status: "skipped",
    request: { op: "send_placeholder", ...input },
    response: { note: "Phase581-600: use Gmail API users.messages.send in production" },
  });
  return {
    mode: "real",
    status: "skipped",
    message: "Gmail send placeholder logged — wire users.messages.send for production",
  };
}
