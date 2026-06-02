import { Router } from "express";
import { getDatabase } from "../../db/database.js";
import { resendNotificationLog } from "../../notification/channels/email.js";
import { savePushSubscription } from "../../notification/channels/web-push.js";
import { getNotificationService } from "../../notification/notification-service.js";
import type { NotificationChannel } from "../../notification/types.js";
import { config } from "../../config.js";

export const notificationsRouter = Router();

notificationsRouter.get("/", (req, res) => {
  const db = getDatabase();
  const unreadOnly = req.query.unread === "true";
  const eventType = req.query.eventType as string | undefined;
  const limit = Math.min(Number(req.query.limit ?? 100), 500);

  let sql = "SELECT * FROM notification_logs WHERE 1=1";
  const params: unknown[] = [];
  if (unreadOnly) {
    sql += " AND read_at IS NULL";
  }
  if (eventType) {
    sql += " AND event_type = ?";
    params.push(eventType);
  }
  sql += " ORDER BY created_at DESC LIMIT ?";
  params.push(limit);

  res.json({ notifications: db.prepare(sql).all(...params) });
});

notificationsRouter.patch("/:id/read", (req, res) => {
  const db = getDatabase();
  const r = db
    .prepare(
      `UPDATE notification_logs SET read_at = datetime('now') WHERE id = ?`
    )
    .run(req.params.id);
  if (r.changes === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

notificationsRouter.post("/subscribe", (req, res) => {
  const { subscription, userId, deviceId } = req.body;
  if (!subscription?.endpoint || !subscription?.keys) {
    res.status(400).json({ error: "Web Push subscription required" });
    return;
  }
  const uid = userId ?? "admin-default";
  const tokenId = savePushSubscription(uid, subscription, deviceId);
  res.status(201).json({ tokenId });
});

notificationsRouter.get("/vapid-public-key", (_req, res) => {
  res.json({ publicKey: config.vapid.publicKey });
});

notificationsRouter.post("/test/:channel", async (req, res) => {
  const channel = req.params.channel as NotificationChannel;
  const result = await getNotificationService().sendTest(channel);
  res.json(result);
});

notificationsRouter.post("/:id/resend", async (req, res) => {
  const result = await resendNotificationLog(req.params.id);
  res.json(result);
});
