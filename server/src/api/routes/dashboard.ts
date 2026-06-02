import { Router } from "express";
import { getDatabase } from "../../db/database.js";

export const dashboardRouter = Router();

dashboardRouter.get("/", (_req, res) => {
  const db = getDatabase();
  const deviceCount = (
    db.prepare("SELECT COUNT(*) as c FROM devices").get() as { c: number }
  ).c;
  const eventCount24h = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM events WHERE created_at >= datetime('now', '-1 day')`
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
  const recentAlarms = db
    .prepare(
      `SELECT * FROM events WHERE severity IN ('alarm', 'critical')
       ORDER BY created_at DESC LIMIT 10`
    )
    .all();
  const recentEvents = db
    .prepare(`SELECT * FROM events ORDER BY created_at DESC LIMIT 20`)
    .all();

  res.json({
    summary: {
      deviceCount,
      eventCount24h,
      unreadNotifications,
      alarmDevices,
      systemStatus: alarmDevices > 0 ? "alarm" : "normal",
    },
    recentAlarms,
    recentEvents,
    timestamp: new Date().toISOString(),
  });
});
