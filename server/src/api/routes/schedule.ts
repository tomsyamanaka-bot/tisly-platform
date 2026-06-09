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
  getCalendarIntegrationStatus,
  getScheduleDayDetail,
  getScheduleDayDetailMemo,
  getScheduleDayNote,
  updateUnavailableDay,
  upsertScheduleDayDetailMemo,
  upsertScheduleDayNote,
} from "../../schedule/schedule-store.js";
import { getMapsIntegrationStatus } from "../../schedule/google-maps-service.js";
import { fetchDayWeather } from "../../schedule/weather-service.js";
import { UNAVAILABLE_REASON_PRESETS } from "../../schedule/schedule-types.js";
import {
  getCalendarAuthUrl,
  getCalendarOAuthStatus,
  getWeekStartWithOffset,
  handleCalendarOAuthCallback,
  syncGoogleCalendarEvents,
} from "../../services/googleCalendar.js";
import {
  getCalendarSyncMeta,
  replaceCachedCalendarEvents,
} from "../../schedule/schedule-calendar-store.js";

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

scheduleRouter.get("/day-note", ...scheduleAuth, (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const date = String(req.query.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "valid date required (YYYY-MM-DD)" });
    return;
  }
  try {
    res.json(getScheduleDayDetailMemo(date));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "load failed";
    res.status(400).json({ error: msg });
  }
});

scheduleRouter.patch("/day-note", ...scheduleAuth, (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const body = req.body as {
    date?: string;
    note?: string;
    eventRemark?: string;
    unavailableReason?: string;
    detailMemo?: string;
  };
  try {
    if (
      body.eventRemark !== undefined ||
      body.unavailableReason !== undefined ||
      body.detailMemo !== undefined
    ) {
      const saved = upsertScheduleDayDetailMemo({
        date: body.date ?? "",
        note: body.note,
        eventRemark: body.eventRemark,
        unavailableReason: body.unavailableReason,
        detailMemo: body.detailMemo,
      });
      res.json(saved);
      return;
    }
    const saved = upsertScheduleDayNote(body.date ?? "", body.note ?? "");
    res.json({
      date: saved.date,
      note: saved.note,
      eventRemark: saved.eventRemark,
      unavailableReason: "",
      detailMemo: "",
      unavailableId: null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "save failed";
    res.status(400).json({ error: msg });
  }
});

scheduleRouter.get("/day", ...scheduleAuth, async (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  try {
    const detail = await getScheduleDayDetail(req.query.date, {
      location: req.query.location as string | undefined,
    });
    if (!detail) {
      res.status(400).json({ error: "valid date required (YYYY-MM-DD)" });
      return;
    }
    res.json(detail);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "day detail failed" });
  }
});

scheduleRouter.get("/weather", ...scheduleAuth, async (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const date = String(req.query.date ?? new Date().toISOString().slice(0, 10));
  try {
    const weather = await fetchDayWeather(date, {
      location: req.query.location as string | undefined,
    });
    res.json(weather);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "weather failed" });
  }
});

scheduleRouter.post("/unavailable", ...scheduleAuth, (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const body = req.body as { date?: string; reason?: string; detailMemo?: string };
  try {
    const day = createUnavailableDay({
      date: body.date ?? "",
      reason: body.reason ?? "",
      detailMemo: body.detailMemo,
    });
    res.status(201).json(day);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "create failed";
    res.status(msg.includes("already exists") ? 409 : 400).json({ error: msg });
  }
});

scheduleRouter.patch("/unavailable/:id", ...scheduleAuth, (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const body = req.body as { reason?: string; detailMemo?: string };
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

scheduleRouter.get("/oauth/status", ...scheduleAuth, (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  res.json({
    oauth: getCalendarOAuthStatus(),
    calendarIntegration: getCalendarIntegrationStatus(),
    mapsIntegration: getMapsIntegrationStatus(),
    sync: getCalendarSyncMeta(),
  });
});

scheduleRouter.get("/oauth/auth-url", ...scheduleAuth, (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  res.json(getCalendarAuthUrl());
});

scheduleRouter.get("/oauth/callback", async (req, res) => {
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

async function runGoogleCalendarSync(
  body: { startDate?: string; endDate?: string; weeks?: number }
): Promise<{
  ok: true;
  mode: "mock" | "real";
  count: number;
  startDate: string;
  endDate: string;
  sync: ReturnType<typeof getCalendarSyncMeta>;
}> {
  const weeks = Math.max(1, Math.min(12, Number(body.weeks) || 8));
  const startDate = body.startDate ?? getWeekStartWithOffset(-2);
  const end = new Date(`${startDate}T12:00:00`);
  end.setDate(end.getDate() + weeks * 7);
  const endDate = body.endDate ?? end.toISOString().slice(0, 10);
  const synced = await syncGoogleCalendarEvents(startDate, endDate);
  const saved = replaceCachedCalendarEvents(startDate, endDate, synced.events);
  return {
    ok: true,
    mode: synced.mode,
    count: saved,
    startDate,
    endDate,
    sync: getCalendarSyncMeta(),
  };
}

scheduleRouter.post("/sync", ...scheduleAuth, async (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  try {
    res.json(await runGoogleCalendarSync(req.body as { startDate?: string; endDate?: string; weeks?: number }));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "sync failed" });
  }
});

scheduleRouter.post("/sync/google", ...scheduleAuth, async (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const oauth = getCalendarOAuthStatus();
  if (oauth.mode === "real" && !oauth.configured) {
    res.status(503).json({ error: "Google連携は未設定です", configured: false });
    return;
  }
  try {
    res.json(await runGoogleCalendarSync(req.body as { startDate?: string; endDate?: string; weeks?: number }));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "sync failed" });
  }
});
