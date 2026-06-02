import { Router } from "express";
import {
  generateAiSummary,
  generateNaturalLanguageReport,
  getAnalyticsOverview,
} from "../../analytics/analytics-engine.js";
import { analyzeTrends } from "../../analytics/trend-analyzer.js";

export const analyticsRouter = Router();

analyticsRouter.get("/overview", (_req, res) => {
  res.json({ phase: "81-100", ...getAnalyticsOverview() });
});

analyticsRouter.get("/risk", (_req, res) => {
  const overview = getAnalyticsOverview();
  res.json(overview.risk);
});

analyticsRouter.get("/trends/:period", (req, res) => {
  const period = req.params.period as "today" | "week" | "month";
  if (!["today", "week", "month"].includes(period)) {
    res.status(400).json({ error: "period must be today|week|month" });
    return;
  }
  res.json(analyzeTrends(period));
});

analyticsRouter.get("/summary/:period", (req, res) => {
  const period = req.params.period as "today" | "week" | "month";
  if (!["today", "week", "month"].includes(period)) {
    res.status(400).json({ error: "invalid period" });
    return;
  }
  res.json(generateAiSummary(period));
});

analyticsRouter.get("/report/:period", (req, res) => {
  const period = req.params.period as "today" | "week" | "month";
  if (!["today", "week", "month"].includes(period)) {
    res.status(400).json({ error: "invalid period" });
    return;
  }
  res.json(generateNaturalLanguageReport(period));
});

analyticsRouter.get("/trends-all", (_req, res) => {
  res.json({
    today: analyzeTrends("today"),
    week: analyzeTrends("week"),
    month: analyzeTrends("month"),
  });
});
