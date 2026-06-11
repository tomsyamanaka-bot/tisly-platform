import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import {
  getCalendarAuthUrl,
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
  GOOGLE_CALENDAR_NOT_CONFIGURED_MSG,
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

googleCalendarRouter.get("/calendars", ...calendarAuth, async (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  try {
    const result = await fetchGoogleCalendarListV1();
    const listError = result.usedFallback
      ? formatGoogleCalendarListErrorJa(result.httpStatus, result.warning)
      : null;
    res.json({
      calendars: result.calendars,
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
    res.json({
      calendars: [{ ...PRIMARY_CALENDAR_FALLBACK }],
      usedFallback: true,
      warning: listError.message,
      code: listError.code,
      needsRelogin: listError.needsRelogin,
    });
  }
});

googleCalendarRouter.get("/auth/start", ...calendarAuth, (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const auth = getCalendarAuthUrl();
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
  res.json({ url: auth.url, mode: auth.mode, configured: auth.configured });
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
    if (e instanceof GoogleCalendarSyncError) {
      sendGoogleCalendarSyncError(res, e.status, e.code, e.message, {
        ...e.details,
        ...(safeDetails ?? {}),
      });
      return;
    }
    const msg = formatGoogleCalendarErrorJa(
      hint ?? (e instanceof Error ? e.message : "sync failed")
    );
    recordCalendarSyncFailure(msg, safeLog);
    sendGoogleCalendarSyncError(res, 500, "sync_failed", msg, safeDetails ?? undefined);
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
  res.redirect(`/google-calendar-settings-v1?${query}`);
});
