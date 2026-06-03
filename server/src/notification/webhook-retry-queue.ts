import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import type { CustomerWebhook } from "./channels/webhook.js";
import { sendWebhookEvent } from "./channels/webhook.js";

export type WebhookDeliveryStatus = "pending" | "delivered" | "failed" | "exhausted";

const MAX_ATTEMPTS = 5;

export interface WebhookDeliveryLog {
  id: string;
  webhook_id: string;
  customer_id: string;
  status: WebhookDeliveryStatus;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string | null;
  last_error: string | null;
  payload_json: string;
  created_at: string;
  updated_at: string;
}

export function enqueueWebhookDelivery(
  webhook: CustomerWebhook,
  payload: Record<string, unknown>
): WebhookDeliveryLog {
  const id = uuid();
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO webhook_delivery_logs (
        id, webhook_id, customer_id, status, attempt_count, max_attempts,
        next_retry_at, last_error, payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, 'pending', 0, ?, datetime('now'), NULL, ?, ?, ?)`
    )
    .run(
      id,
      webhook.id,
      webhook.customer_id,
      MAX_ATTEMPTS,
      JSON.stringify(payload),
      now,
      now
    );
  return getDeliveryLog(id)!;
}

export function getDeliveryLog(id: string): WebhookDeliveryLog | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM webhook_delivery_logs WHERE id = ?`)
    .get(id) as WebhookDeliveryLog | undefined;
  return row ?? null;
}

export function listPendingDeliveries(limit = 50): WebhookDeliveryLog[] {
  return getDatabase()
    .prepare(
      `SELECT * FROM webhook_delivery_logs
       WHERE status = 'pending' AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
       ORDER BY created_at ASC LIMIT ?`
    )
    .all(limit) as WebhookDeliveryLog[];
}

function nextRetryIso(attempt: number): string {
  const delaySec = Math.min(3600, 30 * 2 ** attempt);
  return new Date(Date.now() + delaySec * 1000).toISOString();
}

export async function processDelivery(
  log: WebhookDeliveryLog,
  webhook: CustomerWebhook
): Promise<WebhookDeliveryLog> {
  const payload = JSON.parse(log.payload_json) as Record<string, unknown>;
  const result = await sendWebhookEvent(webhook, payload);
  const attempt = log.attempt_count + 1;
  const db = getDatabase();

  if (result.ok) {
    db.prepare(
      `UPDATE webhook_delivery_logs SET status = 'delivered', attempt_count = ?,
       last_error = NULL, updated_at = datetime('now') WHERE id = ?`
    ).run(attempt, log.id);
  } else if (attempt >= log.max_attempts) {
    db.prepare(
      `UPDATE webhook_delivery_logs SET status = 'exhausted', attempt_count = ?,
       last_error = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(attempt, result.retryTodo, log.id);
  } else {
    db.prepare(
      `UPDATE webhook_delivery_logs SET status = 'pending', attempt_count = ?,
       next_retry_at = ?, last_error = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(attempt, nextRetryIso(attempt), result.retryTodo, log.id);
  }
  return getDeliveryLog(log.id)!;
}
