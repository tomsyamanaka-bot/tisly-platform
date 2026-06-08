import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import {
  createUnavailableDay,
  deleteUnavailableDay,
  getScheduleMonthView,
  getScheduleSummary,
  getScheduleThreeWeekView,
  getScheduleWeekView,
  updateUnavailableDay,
} from "../../schedule/schedule-store.js";
import { UNAVAILABLE_REASON_PRESETS } from "../../schedule/schedule-types.js";

export const scheduleRouter = Router();

const scheduleAuth = [requireAuth("surveyor")] as const;

function assertScheduleRole(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (!roleMeetsRequirement(role, "surveyor") && role !== "super_admin") {
    res.status(403).json({ error: "Surveyor or admin role required" });
    return false;
  }
  return true;
}

scheduleRouter.get("/week", ...scheduleAuth, async (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  try {
    const view = await getScheduleWeekView(req.query.offset);
    res.json(view);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "week view failed" });
  }
});

scheduleRouter.get("/three-weeks", ...scheduleAuth, async (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  try {
    const view = await getScheduleThreeWeekView(req.query.offset);
    res.json(view);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "three-week view failed" });
  }
});

scheduleRouter.get("/month", ...scheduleAuth, async (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  try {
    const view = await getScheduleMonthView(req.query.year, req.query.month);
    res.json(view);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "month view failed" });
  }
});

scheduleRouter.get("/summary", ...scheduleAuth, async (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const range = String(req.query.range ?? "week");
  try {
    const summary = await getScheduleSummary(range, req.query.offset);
    res.json({ range, summary });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "summary failed" });
  }
});

scheduleRouter.get("/presets", ...scheduleAuth, (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  res.json({ reasonPresets: UNAVAILABLE_REASON_PRESETS });
});

scheduleRouter.post("/unavailable", ...scheduleAuth, (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const body = req.body as { date?: string; reason?: string };
  try {
    const day = createUnavailableDay({ date: body.date ?? "", reason: body.reason ?? "" });
    res.status(201).json(day);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "create failed";
    res.status(msg.includes("already exists") ? 409 : 400).json({ error: msg });
  }
});

scheduleRouter.patch("/unavailable/:id", ...scheduleAuth, (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const body = req.body as { reason?: string };
  const updated = updateUnavailableDay(String(req.params.id), body);
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(updated);
});

scheduleRouter.delete("/unavailable/:id", ...scheduleAuth, (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const ok = deleteUnavailableDay(String(req.params.id));
  if (!ok) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).send();
});
