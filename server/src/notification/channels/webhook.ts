import { v4 as uuid } from "uuid";
import { getDatabase } from "../../db/database.js";
import { webhookSignatureHeaders } from "../webhook-signature.js";
import { enqueueWebhookDelivery } from "../webhook-retry-queue.js";

export interface CustomerWebhook {
  id: string;
  customer_id: string;
  url: string;
  secret: string | null;
  enabled: number;
  created_at: string;
}

export function listWebhooks(customerId: string): CustomerWebhook[] {
  return getDatabase()
    .prepare(
      `SELECT id, customer_id, url, secret, enabled, created_at
       FROM customer_webhooks WHERE customer_id = ? ORDER BY created_at DESC`
    )
    .all(customerId) as CustomerWebhook[];
}

export function createWebhook(customerId: string, url: string, secret?: string): CustomerWebhook {
  const id = uuid();
  getDatabase()
    .prepare(
      `INSERT INTO customer_webhooks (id, customer_id, url, secret, enabled, created_at)
       VALUES (?, ?, ?, ?, 1, datetime('now'))`
    )
    .run(id, customerId, url, secret ?? null);
  return getWebhook(customerId, id)!;
}

export function getWebhook(customerId: string, id: string): CustomerWebhook | null {
  const row = getDatabase()
    .prepare(
      `SELECT id, customer_id, url, secret, enabled, created_at
       FROM customer_webhooks WHERE customer_id = ? AND id = ?`
    )
    .get(customerId, id) as CustomerWebhook | undefined;
  return row ?? null;
}

export function deleteWebhook(customerId: string, id: string): boolean {
  const r = getDatabase()
    .prepare(`DELETE FROM customer_webhooks WHERE customer_id = ? AND id = ?`)
    .run(customerId, id);
  return r.changes > 0;
}

export async function sendWebhookTest(
  webhook: CustomerWebhook
): Promise<{ ok: boolean; status?: number; error?: string; deliveryId?: string }> {
  const body = JSON.stringify({
    type: "webhook.test",
    customerId: webhook.customer_id,
    webhookId: webhook.id,
    at: new Date().toISOString(),
  });
  return deliverWebhookPayload(webhook, body, "webhook.test");
}

async function deliverWebhookPayload(
  webhook: CustomerWebhook,
  body: string,
  eventHeader: string
): Promise<{ ok: boolean; status?: number; error?: string; deliveryId?: string }> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-TiSLY-Event": eventHeader,
    };
    if (webhook.secret) {
      Object.assign(headers, webhookSignatureHeaders(webhook.secret, body));
    }

    const res = await fetch(webhook.url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(8000),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function sendWebhookEvent(
  webhook: CustomerWebhook,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; retryTodo: string; deliveryId?: string }> {
  const body = JSON.stringify(payload);
  const eventType = String(payload.type ?? "event");
  const result = await deliverWebhookPayload(webhook, body, eventType);
  if (result.ok) {
    return { ok: true, retryTodo: "none" };
  }
  const log = enqueueWebhookDelivery(webhook, payload);
  void processWebhookRetry(log.id, webhook);
  return {
    ok: false,
    retryTodo: "queued",
    deliveryId: log.id,
  };
}

async function processWebhookRetry(logId: string, webhook: CustomerWebhook): Promise<void> {
  const { getDeliveryLog, processDelivery } = await import("../webhook-retry-queue.js");
  const log = getDeliveryLog(logId);
  if (log) await processDelivery(log, webhook);
}
