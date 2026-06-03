import { getDatabase } from "../db/database.js";
import { sendEmail } from "../notification/channels/email.js";
import type { NotificationPayload } from "../notification/types.js";
import {
  listPendingDeliveries,
  processDelivery,
  type WebhookDeliveryLog,
} from "../notification/webhook-retry-queue.js";
import { getWebhook } from "../notification/channels/webhook.js";
import {
  listPendingReportEmails,
  processReportEmailJob,
} from "../reports/report-email-queue.js";
import { logAudit } from "../provisioning/audit-log.js";

export interface WorkerTickResult {
  notificationQueue: { processed: number; failed: number };
  webhookDeliveries: { processed: number; failed: number };
  reportEmails: { processed: number; failed: number };
}

function listPendingNotificationQueue(limit = 20) {
  try {
    return getDatabase()
      .prepare(
        `SELECT * FROM notification_queue
         WHERE status IN ('queued', 'pending')
           AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
         ORDER BY created_at ASC LIMIT ?`
      )
      .all(limit) as Array<{
      id: string;
      log_id: string | null;
      channel: string;
      payload_json: string;
      attempts: number;
      max_attempts: number;
    }>;
  } catch {
    return [];
  }
}

function markNotificationQueue(
  id: string,
  status: "sent" | "failed" | "exhausted",
  attempt: number,
  error?: string
): void {
  const db = getDatabase();
  if (status === "sent") {
    db.prepare(
      `UPDATE notification_queue SET status = 'sent', attempts = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(attempt, id);
  } else if (status === "exhausted") {
    db.prepare(
      `UPDATE notification_queue SET status = 'exhausted', attempts = ?, last_error = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(attempt, error ?? "max attempts", id);
  } else {
    const next = new Date(Date.now() + 60 * 2 ** attempt * 1000).toISOString();
    db.prepare(
      `UPDATE notification_queue SET status = 'pending', attempts = ?, next_retry_at = ?,
       last_error = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(attempt, next, error ?? "retry", id);
  }
}

async function processNotificationQueueItem(item: {
  id: string;
  channel: string;
  payload_json: string;
  attempts: number;
  max_attempts: number;
}): Promise<"ok" | "retry" | "exhausted"> {
  const attempt = item.attempts + 1;
  const payload = JSON.parse(item.payload_json) as NotificationPayload;
  if (item.channel !== "email") {
    markNotificationQueue(item.id, attempt >= item.max_attempts ? "exhausted" : "failed", attempt, "unsupported channel");
    return attempt >= item.max_attempts ? "exhausted" : "retry";
  }
  const result = await sendEmail(payload);
  if (result.success) {
    markNotificationQueue(item.id, "sent", attempt);
    logAudit({ action: "worker.notification_sent", targetType: "notification_queue", targetId: item.id });
    return "ok";
  }
  if (attempt >= item.max_attempts) {
    markNotificationQueue(item.id, "exhausted", attempt, result.error);
    return "exhausted";
  }
  markNotificationQueue(item.id, "failed", attempt, result.error);
  return "retry";
}

async function processWebhookDelivery(log: WebhookDeliveryLog): Promise<"ok" | "retry" | "exhausted"> {
  const wh = getWebhook(log.customer_id, log.webhook_id);
  if (!wh) {
    getDatabase()
      .prepare(
        `UPDATE webhook_delivery_logs SET status = 'failed', last_error = 'webhook missing', updated_at = datetime('now') WHERE id = ?`
      )
      .run(log.id);
    return "exhausted";
  }
  const updated = await processDelivery(log, wh);
  if (updated.status === "delivered") return "ok";
  if (updated.status === "exhausted") return "exhausted";
  return "retry";
}

export async function runNotificationWorkerTick(): Promise<WorkerTickResult> {
  const result: WorkerTickResult = {
    notificationQueue: { processed: 0, failed: 0 },
    webhookDeliveries: { processed: 0, failed: 0 },
    reportEmails: { processed: 0, failed: 0 },
  };

  for (const item of listPendingNotificationQueue()) {
    const r = await processNotificationQueueItem(item);
    if (r === "ok") result.notificationQueue.processed++;
    else result.notificationQueue.failed++;
  }

  for (const log of listPendingDeliveries()) {
    const r = await processWebhookDelivery(log);
    if (r === "ok") result.webhookDeliveries.processed++;
    else result.webhookDeliveries.failed++;
  }

  for (const job of listPendingReportEmails()) {
    const updated = await processReportEmailJob(job);
    if (updated.status === "sent") result.reportEmails.processed++;
    else result.reportEmails.failed++;
  }

  return result;
}

export function countPendingWebhookDeliveries(): number {
  return (
    getDatabase()
      .prepare(`SELECT COUNT(*) as c FROM webhook_delivery_logs WHERE status = 'pending'`)
      .get() as { c: number }
  ).c;
}

export function countPendingNotificationQueue(): number {
  try {
    return (
      getDatabase()
        .prepare(
          `SELECT COUNT(*) as c FROM notification_queue WHERE status IN ('queued', 'pending')`
        )
        .get() as { c: number }
    ).c;
  } catch {
    return 0;
  }
}
