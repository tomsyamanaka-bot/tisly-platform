import { Router } from "express";
import { requireAuth } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import { createUnavailableDay, deleteUnavailableDay, getScheduleMonthView, getScheduleSummary, getScheduleThreeWeekView, getScheduleWeekView, getScheduleDayDetail, updateUnavailableDay, } from "../../schedule/schedule-store.js";
import { fetchDayWeather } from "../../schedule/weather-service.js";
import { UNAVAILABLE_REASON_PRESETS } from "../../schedule/schedule-types.js";
import { getCalendarAuthUrl, getCalendarOAuthStatus, getWeekStartWithOffset, handleCalendarOAuthCallback, syncGoogleCalendarEvents, } from "../../services/googleCalendar.js";
import { getCalendarSyncMeta, replaceCachedCalendarEvents, } from "../../schedule/schedule-calendar-store.js";
export const scheduleRouter = Router();
const scheduleAuth = [requireAuth("surveyor")];
function assertScheduleRole(req, res) {
    const role = req.admin?.role ?? "viewer";
    if (!roleMeetsRequirement(role, "surveyor") && role !== "super_admin") {
        res.status(403).json({ error: "Surveyor or admin role required" });
        return false;
    }
    return true;
}
scheduleRouter.get("/week", ...scheduleAuth, async (req, res) => {
    if (!assertScheduleRole(req, res))
        return;
    try {
        const view = await getScheduleWeekView(req.query.offset);
        res.json(view);
    }
    catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "week view failed" });
    }
});
scheduleRouter.get("/three-weeks", ...scheduleAuth, async (req, res) => {
    if (!assertScheduleRole(req, res))
        return;
    try {
        const view = await getScheduleThreeWeekView(req.query.offset);
        res.json(view);
    }
    catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "three-week view failed" });
    }
});
scheduleRouter.get("/month", ...scheduleAuth, async (req, res) => {
    if (!assertScheduleRole(req, res))
        return;
    try {
        const view = await getScheduleMonthView(req.query.year, req.query.month);
        res.json(view);
    }
    catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "month view failed" });
    }
});
scheduleRouter.get("/summary", ...scheduleAuth, async (req, res) => {
    if (!assertScheduleRole(req, res))
        return;
    const range = String(req.query.range ?? "week");
    try {
        const summary = await getScheduleSummary(range, req.query.offset);
        res.json({ range, summary });
    }
    catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "summary failed" });
    }
});
scheduleRouter.get("/presets", ...scheduleAuth, (req, res) => {
    if (!assertScheduleRole(req, res))
        return;
    res.json({ reasonPresets: UNAVAILABLE_REASON_PRESETS });
});
scheduleRouter.get("/day", ...scheduleAuth, async (req, res) => {
    if (!assertScheduleRole(req, res))
        return;
    try {
        const detail = await getScheduleDayDetail(req.query.date, {
            location: req.query.location,
        });
        if (!detail) {
            res.status(400).json({ error: "valid date required (YYYY-MM-DD)" });
            return;
        }
        res.json(detail);
    }
    catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "day detail failed" });
    }
});
scheduleRouter.get("/weather", ...scheduleAuth, async (req, res) => {
    if (!assertScheduleRole(req, res))
        return;
    const date = String(req.query.date ?? new Date().toISOString().slice(0, 10));
    try {
        const weather = await fetchDayWeather(date, {
            location: req.query.location,
        });
        res.json(weather);
    }
    catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "weather failed" });
    }
});
scheduleRouter.post("/unavailable", ...scheduleAuth, (req, res) => {
    if (!assertScheduleRole(req, res))
        return;
    const body = req.body;
    try {
        const day = createUnavailableDay({ date: body.date ?? "", reason: body.reason ?? "" });
        res.status(201).json(day);
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : "create failed";
        res.status(msg.includes("already exists") ? 409 : 400).json({ error: msg });
    }
});
scheduleRouter.patch("/unavailable/:id", ...scheduleAuth, (req, res) => {
    if (!assertScheduleRole(req, res))
        return;
    const body = req.body;
    const updated = updateUnavailableDay(String(req.params.id), body);
    if (!updated) {
        res.status(404).json({ error: "Not found" });
        return;
    }
    res.json(updated);
});
scheduleRouter.delete("/unavailable/:id", ...scheduleAuth, (req, res) => {
    if (!assertScheduleRole(req, res))
        return;
    const ok = deleteUnavailableDay(String(req.params.id));
    if (!ok) {
        res.status(404).json({ error: "Not found" });
        return;
    }
    res.status(204).send();
});
scheduleRouter.get("/oauth/status", ...scheduleAuth, (req, res) => {
    if (!assertScheduleRole(req, res))
        return;
    res.json({ oauth: getCalendarOAuthStatus(), sync: getCalendarSyncMeta() });
});
scheduleRouter.get("/oauth/auth-url", ...scheduleAuth, (req, res) => {
    if (!assertScheduleRole(req, res))
        return;
    res.json(getCalendarAuthUrl());
});
scheduleRouter.get("/oauth/callback", async (req, res) => {
    const result = await handleCalendarOAuthCallback({
        code: req.query.code,
        error: req.query.error,
    });
    if (result.ok) {
        res.redirect("/schedule-v1?oauth=ok");
        return;
    }
    res.status(400).send(result.message);
});
scheduleRouter.post("/sync", ...scheduleAuth, async (req, res) => {
    if (!assertScheduleRole(req, res))
        return;
    try {
        const body = req.body;
        const weeks = Math.max(1, Math.min(12, Number(body.weeks) || 8));
        const startDate = body.startDate ?? getWeekStartWithOffset(-2);
        const end = new Date(`${startDate}T12:00:00`);
        end.setDate(end.getDate() + weeks * 7);
        const endDate = body.endDate ?? end.toISOString().slice(0, 10);
        const synced = await syncGoogleCalendarEvents(startDate, endDate);
        const saved = replaceCachedCalendarEvents(startDate, endDate, synced.events);
        res.json({
            ok: true,
            mode: synced.mode,
            count: saved,
            startDate,
            endDate,
            sync: getCalendarSyncMeta(),
        });
    }
    catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "sync failed" });
    }
});
