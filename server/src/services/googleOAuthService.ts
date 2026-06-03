import { getDatabase } from "../db/database.js";

const REFRESH_TOKEN_KEY = "google_oauth_refresh_token";

export type GoogleOAuthMode = "mock" | "real";

export interface GoogleOAuthConfig {
  enabled: boolean;
  mode: GoogleOAuthMode;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken: string | null;
}

function envMode(): GoogleOAuthMode {
  const enabled = process.env.GOOGLE_OAUTH_ENABLED === "true";
  const hasCreds =
    Boolean(process.env.GOOGLE_CLIENT_ID) &&
    Boolean(process.env.GOOGLE_CLIENT_SECRET) &&
    Boolean(process.env.GOOGLE_REDIRECT_URI);
  if (enabled && hasCreds) return "real";
  return "mock";
}

export function getGoogleOAuthConfig(): GoogleOAuthConfig {
  const row = getDatabase()
    .prepare(`SELECT value_json FROM platform_settings WHERE key = ?`)
    .get(REFRESH_TOKEN_KEY) as { value_json: string } | undefined;
  const stored = row ? (JSON.parse(row.value_json) as { token?: string }).token : null;
  return {
    enabled: process.env.GOOGLE_OAUTH_ENABLED === "true",
    mode: envMode(),
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirectUri: process.env.GOOGLE_REDIRECT_URI ?? "",
    refreshToken:
      stored ?? process.env.GOOGLE_REFRESH_TOKEN ?? null,
  };
}

export function saveGoogleRefreshToken(token: string): void {
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT OR REPLACE INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(REFRESH_TOKEN_KEY, JSON.stringify({ token, at: now }));
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
  // TODO Phase581+: exchange code for tokens via Google token endpoint
  return {
    ok: false,
    mode: "real",
    message: "Real OAuth token exchange not implemented — set GOOGLE_REFRESH_TOKEN manually",
  };
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
  return {
    ok: false,
    mode: "real",
    calendar: "TODO: verify Calendar API",
    gmail: "TODO: verify Gmail API",
  };
}
