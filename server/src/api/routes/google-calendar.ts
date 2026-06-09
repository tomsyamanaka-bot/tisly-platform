import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import {
  getCalendarAuthUrl,
  handleCalendarOAuthCallback,
} from "../../services/googleCalendar.js";

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

googleCalendarRouter.get("/auth/start", ...calendarAuth, (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const auth = getCalendarAuthUrl();
  if (!auth.configured) {
    res.status(503).json({
      error: "Google連携は未設定です",
      configured: false,
      mode: auth.mode,
    });
    return;
  }
  if (!auth.url) {
    res.status(503).json({ error: "Google連携は未設定です", configured: false });
    return;
  }
  res.json({ url: auth.url, mode: auth.mode, configured: auth.configured });
});

googleCalendarRouter.get("/oauth/callback", async (req, res) => {
  const result = await handleCalendarOAuthCallback({
    code: req.query.code as string | undefined,
    error: req.query.error as string | undefined,
  });
  if (result.ok) {
    res.redirect("/schedule-v1?oauth=ok");
    return;
  }
  res.status(400).send(result.message);
});
