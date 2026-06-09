import { getDatabase } from "../db/database.js";
import { logBusinessIntegration } from "../business/business-integration-log.js";
const REFRESH_TOKEN_KEY = "google_oauth_refresh_token";
const ACCESS_TOKEN_KEY = "google_oauth_access_token";
function envMode() {
    const enabled = process.env.GOOGLE_OAUTH_ENABLED === "true";
    const hasCreds = Boolean(process.env.GOOGLE_CLIENT_ID) &&
        Boolean(process.env.GOOGLE_CLIENT_SECRET) &&
        Boolean(process.env.GOOGLE_REDIRECT_URI);
    if (enabled && hasCreds)
        return "real";
    return "mock";
}
function readStoredToken(key) {
    const row = getDatabase()
        .prepare(`SELECT value_json FROM platform_settings WHERE key = ?`)
        .get(key);
    if (!row)
        return null;
    try {
        const parsed = JSON.parse(row.value_json);
        return parsed.token ?? null;
    }
    catch {
        return null;
    }
}
function writeStoredToken(key, token, extra) {
    getDatabase()
        .prepare(`INSERT OR REPLACE INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`)
        .run(key, JSON.stringify({ token, at: new Date().toISOString(), ...extra }));
}
export function getGoogleOAuthConfig() {
    return {
        enabled: process.env.GOOGLE_OAUTH_ENABLED === "true",
        mode: envMode(),
        clientId: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirectUri: process.env.GOOGLE_REDIRECT_URI ?? "",
        refreshToken: readStoredToken(REFRESH_TOKEN_KEY) ?? process.env.GOOGLE_REFRESH_TOKEN ?? null,
    };
}
export function saveGoogleRefreshToken(token) {
    writeStoredToken(REFRESH_TOKEN_KEY, token);
}
function saveAccessToken(token, expiresIn) {
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
export function getGoogleAuthUrl(state = "business") {
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
async function exchangeToken(body) {
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
    const json = (await res.json());
    if (!res.ok || !json.access_token) {
        throw new Error(json.error_description ?? json.error ?? `token exchange failed (${res.status})`);
    }
    return {
        access_token: json.access_token,
        refresh_token: json.refresh_token,
        expires_in: json.expires_in,
    };
}
export async function refreshGoogleAccessToken() {
    const cfg = getGoogleOAuthConfig();
    if (cfg.mode === "mock")
        return "mock-access-token";
    if (!cfg.refreshToken)
        throw new Error("no refresh token");
    const tokens = await exchangeToken({
        grant_type: "refresh_token",
        refresh_token: cfg.refreshToken,
    });
    saveAccessToken(tokens.access_token, tokens.expires_in);
    if (tokens.refresh_token)
        saveGoogleRefreshToken(tokens.refresh_token);
    return tokens.access_token;
}
async function getAccessToken() {
    const cfg = getGoogleOAuthConfig();
    if (cfg.mode === "mock")
        return "mock-access-token";
    const cached = readStoredToken(ACCESS_TOKEN_KEY);
    if (cached)
        return cached;
    return refreshGoogleAccessToken();
}
export async function handleGoogleOAuthCallback(input) {
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
        if (tokens.refresh_token)
            saveGoogleRefreshToken(tokens.refresh_token);
        saveAccessToken(tokens.access_token, tokens.expires_in);
        return {
            ok: true,
            mode: "real",
            message: "OAuth tokens stored",
            refreshTokenSaved: Boolean(tokens.refresh_token),
        };
    }
    catch (e) {
        return { ok: false, mode: "real", message: e.message };
    }
}
export async function testGoogleOAuthConnection() {
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
        const calRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1", { headers: { Authorization: `Bearer ${token}` } });
        const gmailRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
            headers: { Authorization: `Bearer ${token}` },
        });
        return {
            ok: calRes.ok && gmailRes.ok,
            mode: "real",
            calendar: calRes.ok ? "Calendar API OK" : `Calendar API ${calRes.status}`,
            gmail: gmailRes.ok ? "Gmail API OK" : `Gmail API ${gmailRes.status}`,
        };
    }
    catch (e) {
        return {
            ok: false,
            mode: "real",
            calendar: e.message,
            gmail: e.message,
        };
    }
}
export async function createGoogleCalendarEvent(input) {
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
    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
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
    });
    const json = (await res.json());
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
function buildRawEmail(to, subject, body) {
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
export async function createGmailDraft(input) {
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
    const json = (await res.json());
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
export async function sendGmailPlaceholder(input) {
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
