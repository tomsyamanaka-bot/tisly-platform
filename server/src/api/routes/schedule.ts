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
  fetchBaseOriginDayWeather,
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
  formatGoogleCalendarErrorJa,
  getCalendarAuthUrl,
  getCalendarOAuthStatus,
  getGoogleCalendarPublicStatus,
  handleCalendarOAuthCallback,
  syncGoogleCalendarEvents,
} from "../../services/googleCalendar.js";
import {
  assertGoogleCalendarSyncAllowed,
  buildGoogleCalendarOAuthSettingsRedirectQuery,
} from "../../services/googleOAuthService.js";
import {
  assertGoogleCalendarSyncRequest,
  GoogleCalendarSyncError,
  sendGoogleCalendarSyncError,
} from "../../schedule/google-calendar-sync-service.js";
import { touchGoogleCalendarLastSync } from "../../schedule/google-calendar-sync-store.js";
import {
  getCalendarSyncMeta,
  hasCachedCalendarEvents,
  listCachedCalendarEvents,
  recordCalendarSyncFailure,
  upsertCachedCalendarEvents,
} from "../../schedule/schedule-calendar-store.js";
import {
  buildDepartureNotificationPayload,
  ensureDayDeparture,
  getDepartureById,
  updateDayDeparture,
} from "../../schedule/schedule-day-departures-store.js";
import {
  buildDailySummaryResponse,
  buildDayScheduleIntelligence,
  buildScheduleIntelligenceDebug,
} from "../../schedule/schedule-intelligence-service.js";
import {
  getSchedulePlannerSettingsV1,
  maskAddressForDisplay,
  updateSchedulePlannerSettingsV1,
} from "../../schedule/schedule-settings-store.js";
import { upsertEventAddressOverride } from "../../schedule/schedule-event-address-overrides-store.js";
import { fetchCalendarEvents } from "../../services/googleCalendar.js";

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

scheduleRouter.get("/departures", ...scheduleAuth, async (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const date = String(req.query.date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "valid date required (YYYY-MM-DD)" });
    return;
  }
  try {
    const departure = await ensureDayDeparture(date);
    res.json({ date, departure });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "departures failed" });
  }
});

scheduleRouter.patch("/departures/:id", ...scheduleAuth, (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const body = req.body as {
    departureTime?: string;
    reminderMinutesBefore?: number;
    reminderEnabled?: boolean;
    reminderSentAt?: string | null;
  };
  try {
    const updated = updateDayDeparture(String(req.params.id), body);
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "update failed" });
  }
});

scheduleRouter.post("/departures/:id/test-notify", ...scheduleAuth, (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const departure = getDepartureById(String(req.params.id));
  if (!departure) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const payload = buildDepartureNotificationPayload(departure);
  res.json({ ok: true, notification: payload, departure });
});

async function loadEventsForDate(date: string) {
  if (hasCachedCalendarEvents()) {
    return listCachedCalendarEvents(date, date);
  }
  return fetchCalendarEvents(date, date);
}

scheduleRouter.get("/settings", ...scheduleAuth, (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const settings = getSchedulePlannerSettingsV1();
  res.json({
    defaultOrigin: settings.defaultOrigin,
    defaultOriginDisplay: settings.defaultOrigin
      ? maskAddressForDisplay(settings.defaultOrigin)
      : "",
    updatedAt: settings.updatedAt,
  });
});

scheduleRouter.patch("/settings", ...scheduleAuth, (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const body = req.body as { defaultOrigin?: string };
  try {
    const saved = updateSchedulePlannerSettingsV1({
      defaultOrigin: body.defaultOrigin,
    });
    res.json({
      defaultOrigin: saved.defaultOrigin,
      defaultOriginDisplay: saved.defaultOrigin
        ? maskAddressForDisplay(saved.defaultOrigin)
        : "",
      updatedAt: saved.updatedAt,
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "save failed" });
  }
});

scheduleRouter.patch("/events/:eventId/address", ...scheduleAuth, (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const eventId = String(req.params.eventId ?? "").trim();
  const body = req.body as { address?: string };
  try {
    const saved = upsertEventAddressOverride(eventId, body.address ?? "");
    res.json({
      ok: true,
      scheduleEventId: saved.scheduleEventId,
      address: saved.address,
      addressDisplay: maskAddressForDisplay(saved.address),
      updatedAt: saved.updatedAt,
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "save failed" });
  }
});

scheduleRouter.get("/daily-summary", ...scheduleAuth, async (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const date = String(req.query.date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "valid date required (YYYY-MM-DD)" });
    return;
  }
  try {
    const events = await loadEventsForDate(date);
    const intelligence = await buildDayScheduleIntelligence(date, events, {
      includeReturnToOrigin: true,
    });
    res.json(buildDailySummaryResponse(intelligence));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "daily summary failed" });
  }
});

scheduleRouter.get("/intelligence/debug", ...scheduleAuth, async (req: AuthedRequest, res) => {
  if (!assertScheduleRole(req, res)) return;
  const date = String(req.query.date ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "valid date required (YYYY-MM-DD)" });
    return;
  }
  try {
    const events = await loadEventsForDate(date);
    const debug = await buildScheduleIntelligenceDebug(date, events);
    res.json({ date, ...debug });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "debug failed" });
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
    const location = req.query.location as string | undefined;
    const weather = location
      ? await fetchDayWeather(date, { location })
      : await fetchBaseOriginDayWeather(date);
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
  const calendarStatus = getGoogleCalendarPublicStatus();
  res.json({
    oauth: getCalendarOAuthStatus(),
    calendarIntegration: getCalendarIntegrationStatus(),
    mapsIntegration: getMapsIntegrationStatus(),
    sync: getCalendarSyncMeta(),
    calendarStatus,
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
    error_description: req.query.error_description as string | undefined,
  });
  const query = buildGoogleCalendarOAuthSettingsRedirectQuery(result);
  res.redirect(`/google-calendar-settings-v1?${query}`);
});

async function runGoogleCalendarSync(
  body: Parameters<typeof assertGoogleCalendarSyncRequest>[0],
  auth?: AuthedRequest["admin"]
): Promise<{
  ok: true;
  mode: "mock" | "real";
  count: number;
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  startDate: string;
  endDate: string;
  lastSyncedAt: string | null;
  sync: ReturnType<typeof getCalendarSyncMeta>;
}> {
  const params = assertGoogleCalendarSyncRequest(body, auth);
  const synced = await syncGoogleCalendarEvents(params.startDate, params.endDate);
  const upsert = upsertCachedCalendarEvents(params.startDate, params.endDate, synced.events);
  touchGoogleCalendarLastSync();
  const syncMeta = getCalendarSyncMeta();
  return {
    ok: true,
    mode: synced.mode,
    count: upsert.created + upsert.updated,
    fetched: upsert.fetched,
    created: upsert.created,
    updated: upsert.updated,
    skipped: upsert.skipped,
    failed: upsert.failed,
    startDate: params.startDate,
    endDate: params.endDate,
    lastSyncedAt: syncMeta.lastSyncedAt,
    sync: syncMeta,
  };
}

function handleGoogleCalendarSyncError(
  e: unknown,
  res: Response
): boolean {
  if (e instanceof GoogleCalendarSyncError) {
    if (e.status >= 500) {
      recordCalendarSyncFailure(e.message);
    }
    sendGoogleCalendarSyncError(res, e.status, e.code, e.message, e.details);
    return true;
  }
  return false;
}

scheduleRouter.post("/sync", ...scheduleAuth, async (req: AuthedRequest, res) => {
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
    const result = await runGoogleCalendarSync(req.body, req.admin);
    res.json({
      ...result,
      modeLabel: result.mode === "real" ? "Google" : "mock",
    });
  } catch (e) {
    if (handleGoogleCalendarSyncError(e, res)) return;
    const msg = formatGoogleCalendarErrorJa(e instanceof Error ? e.message : "sync failed");
    recordCalendarSyncFailure(msg);
    sendGoogleCalendarSyncError(res, 500, "sync_failed", msg);
  }
});

scheduleRouter.post("/sync/google", ...scheduleAuth, async (req: AuthedRequest, res) => {
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
    const result = await runGoogleCalendarSync(req.body, req.admin);
    res.json({
      ...result,
      modeLabel: result.mode === "real" ? "Google" : "mock",
    });
  } catch (e) {
    if (handleGoogleCalendarSyncError(e, res)) return;
    const msg = formatGoogleCalendarErrorJa(e instanceof Error ? e.message : "sync failed");
    recordCalendarSyncFailure(msg);
    sendGoogleCalendarSyncError(res, 500, "sync_failed", msg);
  }
});
