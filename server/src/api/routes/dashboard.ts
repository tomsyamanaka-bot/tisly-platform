import { Router } from "express";
import { getDatabase } from "../../db/database.js";
import { DEMO_SITES } from "../../demo/demo-sites.js";
import { isDemoRunnerActive } from "../../demo/demo-runner.js";
import { getInfrastructureStatuses } from "../../infrastructure/status.js";

export const dashboardRouter = Router();

dashboardRouter.get("/", async (_req, res) => {
  const db = getDatabase();
  const deviceCount = (
    db.prepare("SELECT COUNT(*) as c FROM devices").get() as { c: number }
  ).c;
  const siteCount = (
    db
      .prepare(`SELECT COUNT(DISTINCT site_id) as c FROM events WHERE site_id IS NOT NULL`)
      .get() as { c: number }
  ).c;
  const effectiveSiteCount = Math.max(siteCount, DEMO_SITES.length);
  const eventCount24h = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM events WHERE created_at >= datetime('now', '-1 day')`
      )
      .get() as { c: number }
  ).c;
  const eventCountToday = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM events WHERE date(created_at) = date('now')`
      )
      .get() as { c: number }
  ).c;
  const eventCountMonth = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM events WHERE created_at >= datetime('now', 'start of month')`
      )
      .get() as { c: number }
  ).c;
  const unreadNotifications = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM notification_logs WHERE read_at IS NULL`
      )
      .get() as { c: number }
  ).c;
  const alarmDevices = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM devices WHERE heartbeat_status IN ('warning', 'alarm')`
      )
      .get() as { c: number }
  ).c;
  const anomalyCount = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM events WHERE severity IN ('alarm', 'critical', 'warning')
         AND created_at >= datetime('now', '-1 day')`
      )
      .get() as { c: number }
  ).c;
  const recentAlarms = db
    .prepare(
      `SELECT * FROM events WHERE severity IN ('alarm', 'critical')
       ORDER BY created_at DESC LIMIT 10`
    )
    .all();
  const recentEvents = db
    .prepare(`SELECT * FROM events ORDER BY created_at DESC LIMIT 20`)
    .all();

  const avgRisk = (
    db
      .prepare(
        `SELECT AVG(risk_score) as avg FROM analytics_snapshots
         WHERE created_at >= datetime('now', '-1 day')`
      )
      .get() as { avg: number | null }
  ).avg;
  const criticalCount = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM analytics_snapshots
         WHERE priority = 'critical' AND created_at >= datetime('now', '-1 day')`
      )
      .get() as { c: number }
  ).c;

  const infrastructure = await getInfrastructureStatuses();
  const infrastructureHealth = ["DB", "Redis", "MQTT", "TV", "QNAP"].map((name) => {
    const c = infrastructure.find((x) => x.name === name);
    return {
      name,
      status: c?.status ?? "YELLOW",
      detail: c?.detail ?? "unknown",
    };
  });

  res.json({
    infrastructureHealth,
    summary: {
      siteCount: effectiveSiteCount,
      deviceCount,
      connectedDeviceCount: deviceCount,
      anomalyCount,
      eventCount24h,
      eventCountToday,
      eventCountMonth,
      unreadNotifications,
      alarmDevices,
      systemStatus: alarmDevices > 0 ? "alarm" : "normal",
      demoRunnerActive: isDemoRunnerActive(),
      riskScoreAvg24h: Math.round(avgRisk ?? 0),
      criticalCount24h: criticalCount,
    },
    recentAlarms,
    recentEvents,
    timestamp: new Date().toISOString(),
  });
});
