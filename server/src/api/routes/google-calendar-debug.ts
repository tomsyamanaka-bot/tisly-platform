import { Router, type Response } from "express";
import { requireAdminAuth, requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import {
  assertGoogleCalendarSyncAllowed,
  getGoogleCalendarOAuthEnvDebug,
  testGoogleCalendarEventWrite,
} from "../../services/googleOAuthService.js";
import { getGoogleCalendarSettingsV1 } from "../../schedule/google-calendar-sync-store.js";
import { formatGoogleApiErrorHint } from "../../schedule/google-calendar-safe-log.js";

export const googleCalendarDebugRouter = Router();

const isProduction = process.env.NODE_ENV === "production";

function assertDebugAccess(req: AuthedRequest, res: Response): boolean {
  if (!isProduction) {
    const role = req.admin?.role ?? "viewer";
    if (!roleMeetsRequirement(role, "surveyor") && role !== "super_admin") {
      res.status(403).json({ error: "Surveyor or admin role required" });
      return false;
    }
    return true;
  }
  const role = req.admin?.role ?? "";
  if (!roleMeetsRequirement(role, "admin") && role !== "super_admin") {
    res.status(403).json({ error: "Admin role required in production" });
    return false;
  }
  return true;
}

const debugAuth = isProduction ? [requireAdminAuth] : [requireAuth("surveyor")];

googleCalendarDebugRouter.get("/env", ...debugAuth, (req: AuthedRequest, res) => {
  if (!assertDebugAccess(req, res)) return;
  res.json({ ok: true, env: getGoogleCalendarOAuthEnvDebug() });
});

googleCalendarDebugRouter.post("/create-test-event", ...debugAuth, async (req: AuthedRequest, res) => {
  if (!assertDebugAccess(req, res)) return;
  const guard = assertGoogleCalendarSyncAllowed();
  if (!guard.ok) {
    res.status(guard.status).json({
      ok: false,
      error: guard.error,
      env: getGoogleCalendarOAuthEnvDebug(),
    });
    return;
  }
  const settings = getGoogleCalendarSettingsV1();
  const calendarId =
    String((req.body as { calendarId?: string })?.calendarId ?? "").trim() ||
    settings.calendarId ||
    "primary";
  const testEvent = await testGoogleCalendarEventWrite(calendarId);
  const safeLog = testEvent.safeLog;
  res.status(testEvent.ok ? 200 : 502).json({
    ok: testEvent.ok,
    calendarId: testEvent.calendarId,
    eventId: testEvent.eventId ?? null,
    deleted: testEvent.deleted ?? false,
    mode: testEvent.mode,
    env: getGoogleCalendarOAuthEnvDebug(),
    googleApiError: safeLog
      ? {
          googleErrorCode: safeLog.googleErrorCode,
          googleErrorMessage: safeLog.googleErrorMessage,
          httpStatus: safeLog.httpStatus,
          errorHint: formatGoogleApiErrorHint(safeLog),
        }
      : null,
    error: testEvent.error ?? null,
  });
});
