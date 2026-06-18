import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import {
  getGoogleCalendarDiagnosticStatus,
  getGoogleCalendarPublicStatus,
  getGoogleCalendarSafeLog,
  handleCalendarOAuthCallback,
  formatGoogleCalendarErrorJa,
  formatGoogleCalendarListErrorJa,
} from "../../services/googleCalendar.js";
import {
  formatGoogleApiErrorHint,
  formatTokenScopeShort,
} from "../../schedule/google-calendar-safe-log.js";
import {
  assertGoogleCalendarSyncAllowed,
  buildGoogleCalendarOAuthSettingsRedirectQuery,
  clearGoogleCalendarTokens,
  getGoogleCalendarAuthUrl,
  getGoogleCalendarOAuthConfig,
  GOOGLE_CALENDAR_NOT_CONFIGURED_MSG,
  listGoogleCalendarsDetailed,
  parseGoogleOAuthReturnTarget,
  resolveGoogleOAuthReturnPath,
} from "../../services/googleOAuthService.js";
import { resetCalendarProvider } from "../../services/googleCalendar.js";
import {
  fetchGoogleCalendarListV1,
  GoogleCalendarSyncError,
  PRIMARY_CALENDAR_FALLBACK,
  runFullGoogleCalendarSyncV1,
  sendGoogleCalendarSyncError,
  updateGoogleCalendarSettingsV1,
} from "../../schedule/google-calendar-sync-service.js";
import {
  fetchGoogleCalendarEventsDebug,
  fetchGoogleCalendarListDebug,
  findDenGenAmiEvents,
} from "../../schedule/google-calendar-debug-export.js";
import {
  refreshGoogleCalendarGrantedScopes,
  testGoogleCalendarEventWrite,
} from "../../services/googleOAuthService.js";
import {
  findLinkByProject,
  getGoogleCalendarSettingsV1,
} from "../../schedule/google-calendar-sync-store.js";
import { recordCalendarSyncFailure } from "../../schedule/schedule-calendar-store.js";

export const googleCalendarRouter = Router();

const calendarAuth = [requireAuth("surveyor")] as const;

function assertScheduleRole(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (!roleMeetsRequirement(role, "surveyor") && role !== "super_admin") {
    res.status(403).json({ error: "Surveyor or admin role required" });
    return false;
  }
  return true;
}

googleCalendarRouter.get("/status", ...calendarAuth, async (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const settings = getGoogleCalendarSettingsV1();
  const publicStatus = getGoogleCalendarPublicStatus();
  if (publicStatus.connected && publicStatus.mode === "live") {
    await refreshGoogleCalendarGrantedScopes().catch(() => undefined);
  }
  const syncMeta = publicStatus.sync;
  const diagnostics = publicStatus.connected
    ? await getGoogleCalendarDiagnosticStatus().catch(() => ({
        hasAccessToken: false,
        hasRefreshToken: false,
        tokenScope: "",
        tokenScopeShort: "—",
        tokenExpiry: null,
        needsRelogin: publicStatus.scope.needsReLogin,
        calendarListOk: false,
        writableCalendarId: null,
        selectedCalendarId: settings.calendarId || "primary",
        lastSyncSafeLog: syncMeta.lastSyncSafeLog ?? getGoogleCalendarSafeLog(),
      }))
    : {
        hasAccessToken: false,
        hasRefreshToken: false,
        tokenScope: "",
        tokenScopeShort: "—",
        tokenExpiry: null,
        needsRelogin: false,
        calendarListOk: false,
        writableCalendarId: null,
        selectedCalendarId: settings.calendarId || "primary",
        lastSyncSafeLog: syncMeta.lastSyncSafeLog ?? getGoogleCalendarSafeLog(),
      };
  res.json({
    ...publicStatus,
    ...diagnostics,
    lastSyncError: syncMeta.lastSyncError,
    settings,
  });
});

googleCalendarRouter.get("/settings", ...calendarAuth, (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  res.json({ settings: getGoogleCalendarSettingsV1() });
});

googleCalendarRouter.patch("/settings", ...calendarAuth, (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const body = req.body as {
    calendarId?: string;
    calendarSummary?: string;
    calendarIds?: string[];
    syncMode?: "primary_only" | "selected_only" | "multiple" | "all_writable" | "google_selected";
    autoCreateProjects?: boolean;
    syncDirection?: "bidirectional" | "pull_only" | "push_only";
  };
  try {
    const settings = updateGoogleCalendarSettingsV1(body);
    resetCalendarProvider();
    res.json({ settings });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "settings update failed" });
  }
});

googleCalendarRouter.get("/debug/calendar-list", ...calendarAuth, async (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  try {
    const data = await fetchGoogleCalendarListDebug();
    res.json({ ok: true, ...data });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e instanceof Error ? e.message : "calendar list debug failed",
    });
  }
});

googleCalendarRouter.get("/debug/events-with-calendar", ...calendarAuth, async (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const startDate = String(req.query.startDate ?? req.query.start ?? "2026-06-20").slice(0, 10);
  const endDate = String(req.query.endDate ?? req.query.end ?? "2026-06-30").slice(0, 10);
  const allReadable = req.query.allReadable === "1" || req.query.allReadable === "true";
  try {
    const data = await fetchGoogleCalendarEventsDebug(startDate, endDate, { allReadable });
    const denGen = findDenGenAmiEvents(data.events);
    res.json({ ok: true, startDate, endDate, allReadable, ...data, denGenAmi: denGen });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e instanceof Error ? e.message : "events debug failed",
    });
  }
});

googleCalendarRouter.get("/calendars", ...calendarAuth, async (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  try {
    const result = await fetchGoogleCalendarListV1();
    const listError = result.usedFallback
      ? formatGoogleCalendarListErrorJa(result.httpStatus, result.warning)
      : null;
    res.json({
      calendars: result.calendars,
      allCalendars: result.allCalendars ?? result.calendars,
      usedFallback: result.usedFallback,
      warning: listError?.message,
      code: listError?.code,
      needsRelogin: listError?.needsRelogin ?? false,
      httpStatus: result.httpStatus ?? null,
    });
  } catch (e) {
    const listError = formatGoogleCalendarListErrorJa(
      undefined,
      e instanceof Error ? e.message : "calendar list failed"
    );
    const fallback = { ...PRIMARY_CALENDAR_FALLBACK };
    res.json({
      calendars: [fallback],
      allCalendars: [fallback],
      usedFallback: true,
      warning: listError.message,
      code: listError.code,
      needsRelogin: listError.needsRelogin,
    });
  }
});

googleCalendarRouter.get("/auth/start", ...calendarAuth, (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const returnTo = parseGoogleOAuthReturnTarget(
    String((req.query.returnTo as string | undefined) ?? (req.query.return as string | undefined) ?? "")
  );
  const auth = getGoogleCalendarAuthUrl(returnTo);
  if (!auth.configured) {
    res.status(503).json({
      error: GOOGLE_CALENDAR_NOT_CONFIGURED_MSG,
      configured: false,
      mode: "mock",
    });
    return;
  }
  if (!auth.url) {
    res.status(503).json({ error: "Google連携は未設定です", configured: false });
    return;
  }
  res.json({ url: auth.url, mode: auth.mode, configured: auth.configured, returnPath: auth.returnPath });
});

googleCalendarRouter.post("/auth/relogin", ...calendarAuth, (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const body = (req.body ?? {}) as { returnTo?: string; return?: string };
  const returnTo = parseGoogleOAuthReturnTarget(body.returnTo ?? body.return ?? "v2");
  clearGoogleCalendarTokens();
  resetCalendarProvider();
  const auth = getGoogleCalendarAuthUrl(returnTo);
  if (!auth.configured || !auth.url) {
    res.status(503).json({
      ok: false,
      error: GOOGLE_CALENDAR_NOT_CONFIGURED_MSG,
      configured: false,
    });
    return;
  }
  const returnQuery = returnTo === "v2" ? "v2" : "v1";
  res.json({
    ok: true,
    url: `/auth/google?return=${returnQuery}`,
    authUrl: auth.url,
    returnPath: auth.returnPath,
  });
});

googleCalendarRouter.post("/diagnostics/connection-test", ...calendarAuth, async (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const cfg = getGoogleCalendarOAuthConfig();
  if (cfg.mode !== "mock") {
    const guard = assertGoogleCalendarSyncAllowed();
    if (!guard.ok) {
      res.status(guard.status).json({
        ok: false,
        error: guard.error,
        calendarNames: [],
        calendars: [],
      });
      return;
    }
  }
  try {
    const result = await listGoogleCalendarsDetailed();
    if (result.apiError) {
      res.json({
        ok: false,
        error: result.apiError,
        httpStatus: result.httpStatus ?? null,
        calendarNames: [],
        calendars: result.calendars,
        usedFallback: result.usedFallback,
      });
      return;
    }
    const calendars = result.calendars.length ? result.calendars : [result.fallback];
    res.json({
      ok: true,
      calendarNames: calendars.map((c) => c.summary),
      calendars: calendars.map((c) => ({
        id: c.id,
        summary: c.summary,
        primary: c.primary,
        writable: c.writable,
      })),
      count: calendars.length,
      usedFallback: result.usedFallback,
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e instanceof Error ? e.message : "connection test failed",
      calendarNames: [],
      calendars: [],
    });
  }
});

googleCalendarRouter.post("/sync/full", ...calendarAuth, async (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const guard = assertGoogleCalendarSyncAllowed();
  if (!guard.ok) {
    sendGoogleCalendarSyncError(res, guard.status, "google_calendar_not_configured", guard.error, {
      configured: false,
      mode: "mock",
    });
    return;
  }
  try {
    const result = await runFullGoogleCalendarSyncV1(req.body);
    res.json({
      ok: true,
      ...result,
      count: result.created + result.updated,
      modeLabel: result.mode === "real" ? "Google" : "mock",
    });
  } catch (e) {
    const safeLog = getGoogleCalendarSafeLog();
    const hint = formatGoogleApiErrorHint(safeLog);
    const safeDetails = safeLog
      ? {
          googleErrorCode: safeLog.googleErrorCode,
          googleErrorMessage: safeLog.googleErrorMessage,
          httpStatus: safeLog.httpStatus,
          operation: safeLog.operation,
          errorHint: hint,
        }
      : undefined;
    const rawMsg = e instanceof Error ? e.message : "sync failed";
    const msg = formatGoogleCalendarErrorJa(hint ?? rawMsg);
    console.error("[google-calendar/sync/full]", rawMsg, safeDetails ?? {});
    if (e instanceof GoogleCalendarSyncError) {
      sendGoogleCalendarSyncError(res, e.status, e.code, e.message, {
        ...e.details,
        ...(safeDetails ?? {}),
        detailLog: rawMsg,
      });
      return;
    }
    recordCalendarSyncFailure(msg, safeLog);
    sendGoogleCalendarSyncError(res, 500, "sync_failed", msg, {
      ...(safeDetails ?? {}),
      detailLog: rawMsg,
    });
  }
});

googleCalendarRouter.post("/diagnostics/test-event", ...calendarAuth, async (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const guard = assertGoogleCalendarSyncAllowed();
  if (!guard.ok) {
    res.status(guard.status).json({
      ok: false,
      error: guard.error,
      tokenScope: "",
      tokenScopeShort: "—",
      needsRelogin: false,
      testEvent: { ok: false, error: guard.error },
    });
    return;
  }
  await refreshGoogleCalendarGrantedScopes().catch(() => undefined);
  const settings = getGoogleCalendarSettingsV1();
  const diagnostics = await getGoogleCalendarDiagnosticStatus().catch(() => null);
  const calendarId =
    String((req.body as { calendarId?: string })?.calendarId ?? "").trim() ||
    diagnostics?.selectedCalendarId ||
    settings.calendarId ||
    "primary";
  const tokenScope = diagnostics?.tokenScope ?? "";
  const needsRelogin = diagnostics?.needsRelogin ?? false;
  const testEvent = await testGoogleCalendarEventWrite(calendarId);
  const safeLog = testEvent.ok ? null : testEvent.safeLog ?? getGoogleCalendarSafeLog();
  res.json({
    ok: testEvent.ok,
    tokenScope,
    tokenScopeShort: formatTokenScopeShort(tokenScope),
    needsRelogin,
    googleApiError: safeLog
      ? {
          googleErrorCode: safeLog.googleErrorCode,
          googleErrorMessage: safeLog.googleErrorMessage,
          httpStatus: safeLog.httpStatus,
          errorHint: formatGoogleApiErrorHint(safeLog),
        }
      : null,
    testEvent,
  });
});

googleCalendarRouter.get("/links/project", ...calendarAuth, (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const projectId = String(req.query.projectId ?? "");
  const source = String(req.query.source ?? "");
  if (!projectId || (source !== "survey" && source !== "business")) {
    res.status(400).json({ error: "projectId and source (survey|business) required" });
    return;
  }
  const link = findLinkByProject({ projectId, source });
  res.json({ link });
});

googleCalendarRouter.post("/disconnect", ...calendarAuth, (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  clearGoogleCalendarTokens();
  resetCalendarProvider();
  res.json({ ok: true, message: "Google連携を解除しました" });
});

/** レガシー OAuth コールバック（/api/google-calendar/oauth/callback） */
googleCalendarRouter.get("/oauth/callback", async (req, res) => {
  const result = await handleCalendarOAuthCallback({
    code: req.query.code as string | undefined,
    error: req.query.error as string | undefined,
    error_description: req.query.error_description as string | undefined,
  });
  const query = buildGoogleCalendarOAuthSettingsRedirectQuery(result);
  const returnPath = resolveGoogleOAuthReturnPath(String(req.query.state ?? ""));
  res.redirect(`${returnPath}?${query}`);
});
