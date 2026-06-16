import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import {
  getDashboardAlertsV1,
  getDashboardCityStatsV1,
  getDashboardRecentV1,
  getDashboardSalesV1,
  getDashboardSummaryV1,
  getDashboardTodayV1,
  searchDashboardProjectsV1,
} from "../../projects/dashboard-v1-store.js";

export const dashboardV1Router = Router();

const auth = [requireAuth("surveyor")] as const;

function assertRole(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (!roleMeetsRequirement(role, "surveyor") && role !== "super_admin") {
    res.status(403).json({ error: "Surveyor or admin role required" });
    return false;
  }
  return true;
}

dashboardV1Router.get("/summary", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const q = String(req.query.q ?? "").trim();
  res.json({
    summary: getDashboardSummaryV1(),
    searchResults: q ? searchDashboardProjectsV1(q) : undefined,
  });
});

dashboardV1Router.get("/today", ...auth, async (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  try {
    const date = req.query.date ? String(req.query.date) : undefined;
    res.json(await getDashboardTodayV1(date));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "today failed" });
  }
});

dashboardV1Router.get("/alerts", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json({ alerts: getDashboardAlertsV1() });
});

dashboardV1Router.get("/recent", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 10) || 10));
  res.json({ projects: getDashboardRecentV1(limit) });
});

dashboardV1Router.get("/city-stats", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json({ cities: getDashboardCityStatsV1() });
});

dashboardV1Router.get("/sales", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json({ sales: getDashboardSalesV1() });
});
