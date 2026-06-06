import { Router } from "express";
import { getDatabase } from "../../db/database.js";
import { resendNotificationLog } from "../../notification/channels/email.js";
import { savePushSubscription } from "../../notification/channels/web-push.js";
import { getNotificationService } from "../../notification/notification-service.js";
import { getEmailProviderMode } from "../../notification/email-provider.js";
import { getLastGmailSendStatus } from "../../notification/gmail-send-log.js";
import {
  getGmailSmtpStatus,
  sendGmailTestEmail,
} from "../../notification/smtp-gmail.js";
import type { NotificationChannel } from "../../notification/types.js";
import { config } from "../../config.js";
import { requireAdminAuth } from "../../auth/auth-middleware.js";

export const notificationsRouter = Router();

/** Phase 2301–2350 — 送信成功率 + Gmail SMTP 状態 */
notificationsRouter.get("/stats", (_req, res) => {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
       FROM notification_logs`
    )
    .get() as { total: number; sent: number; failed: number };
  const attempted = row.sent + row.failed;
  const successRatePercent = attempted > 0 ? Math.round((row.sent / attempted) * 100) : 100;
  const gmail = getGmailSmtpStatus();
  res.json({
    phase: "2301-2350",
    total: row.total,
    sent: row.sent,
    failed: row.failed,
    successRatePercent,
    emailMode: getEmailProviderMode(),
    gmailMode: gmail.gmailMode,
    smtpConfigured: gmail.smtpConfigured,
    lastSendStatus: getLastGmailSendStatus(),
    maskedCredentials: gmail.maskedCredentials,
  });
});

/** Phase 2301–2350 — Gmail テスト送信（NOTIFICATION_TEST_TO） */
notificationsRouter.post("/test-email", requireAdminAuth, async (_req, res) => {
  const to = (process.env.NOTIFICATION_TEST_TO ?? "").trim();
  if (!to) {
    res.status(400).json({ ok: false, error: "NOTIFICATION_TEST_TO が未設定です" });
    return;
  }
  const gmail = getGmailSmtpStatus();
  if (gmail.gmailMode === "real" && !gmail.smtpConfigured) {
    res.status(503).json({
      ok: false,
      error: "Gmail not configured",
      gmailMode: gmail.gmailMode,
      smtpConfigured: false,
      maskedCredentials: gmail.maskedCredentials,
    });
    return;
  }
  const result = await sendGmailTestEmail(to);
  const status = result.ok ? 200 : 502;
  res.status(status).json(result);
});

notificationsRouter.get("/", (req, res) => {
  const db = getDatabase();
  const unreadOnly = req.query.unread === "true";
  const readOnly = req.query.read === "true";
  const eventType = req.query.eventType as string | undefined;
  const q = (req.query.q as string | undefined)?.trim();
  const limit = Math.min(Number(req.query.limit ?? 100), 500);

  let sql = "SELECT * FROM notification_logs WHERE 1=1";
  const params: unknown[] = [];
  if (unreadOnly) {
    sql += " AND read_at IS NULL";
  }
  if (readOnly) {
    sql += " AND read_at IS NOT NULL";
  }
  if (eventType) {
    sql += " AND event_type = ?";
    params.push(eventType);
  }
  if (q) {
    sql += " AND (title LIKE ? OR body LIKE ? OR event_type LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += " ORDER BY created_at DESC LIMIT ?";
  params.push(limit);

  res.json({ notifications: db.prepare(sql).all(...params) });
});

function markRead(id: string, res: import("express").Response): void {
  const db = getDatabase();
  const r = db
    .prepare(
      `UPDATE notification_logs SET read_at = datetime('now') WHERE id = ?`
    )
    .run(id);
  if (r.changes === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
}

notificationsRouter.patch("/:id/read", (req, res) => {
  markRead(req.params.id, res);
});

notificationsRouter.post("/:id/read", (req, res) => {
  if (req.params.id === "read-all") {
    res.status(400).json({ error: "Use POST /api/notifications/read-all" });
    return;
  }
  markRead(req.params.id, res);
});

notificationsRouter.post("/read-all", (_req, res) => {
  const db = getDatabase();
  const r = db
    .prepare(
      `UPDATE notification_logs SET read_at = datetime('now') WHERE read_at IS NULL`
    )
    .run();
  res.json({ ok: true, updated: r.changes });
});

notificationsRouter.post("/subscribe", (req, res) => {
  const { subscription, userId, deviceId } = req.body;
  if (!subscription?.endpoint || !subscription?.keys) {
    res.status(400).json({ error: "Web Push subscription required" });
    return;
  }
  const uid = userId ?? "admin-default";
  const tokenId = savePushSubscription(uid, subscription, deviceId);
  res.status(201).json({ tokenId, ok: true });
});

notificationsRouter.get("/vapid-public-key", (_req, res) => {
  res.json({ publicKey: config.vapid.publicKey });
});

notificationsRouter.post("/test", async (req, res) => {
  const channel = (req.body?.channel ?? "web_push") as NotificationChannel;
  const result = await getNotificationService().sendTest(channel);
  res.json(result);
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
