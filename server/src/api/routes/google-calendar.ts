import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import {
  getCalendarAuthUrl,
  getGoogleCalendarPublicStatus,
  handleCalendarOAuthCallback,
  formatGoogleCalendarErrorJa,
} from "../../services/googleCalendar.js";
import {
  assertGoogleCalendarSyncAllowed,
  clearGoogleCalendarTokens,
  GOOGLE_CALENDAR_NOT_CONFIGURED_MSG,
} from "../../services/googleOAuthService.js";
import { resetCalendarProvider } from "../../services/googleCalendar.js";
import {
  fetchGoogleCalendarListV1,
  runFullGoogleCalendarSyncV1,
  updateGoogleCalendarSettingsV1,
} from "../../schedule/google-calendar-sync-service.js";
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

googleCalendarRouter.get("/status", ...calendarAuth, (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const settings = getGoogleCalendarSettingsV1();
  res.json({
    ...getGoogleCalendarPublicStatus(),
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
    const calendars = await fetchGoogleCalendarListV1();
    res.json({ calendars });
  } catch (e) {
    const msg = formatGoogleCalendarErrorJa(e instanceof Error ? e.message : "calendar list failed");
    res.status(500).json({ error: msg });
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
    res.status(guard.status).json({ error: guard.error, configured: false, mode: "mock" });
    return;
  }
  try {
    const result = await runFullGoogleCalendarSyncV1(
      req.body as { startDate?: string; endDate?: string; weeks?: number }
    );
    res.json({
      ...result,
      modeLabel: result.mode === "real" ? "Google" : "mock",
    });
  } catch (e) {
    const msg = formatGoogleCalendarErrorJa(e instanceof Error ? e.message : "sync failed");
    recordCalendarSyncFailure(msg);
    res.status(500).json({ error: msg });
  }
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
  });
  if (result.ok) {
    res.redirect("/google-calendar-settings-v1?oauth=ok");
    return;
  }
  res.status(400).send(result.message);
});
