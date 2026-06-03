import { v4 as uuid } from "uuid";
import { getDatabase } from "../../db/database.js";

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
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-TiSLY-Event": "webhook.test",
    };
    if (webhook.secret) headers["X-TiSLY-Webhook-Secret"] = webhook.secret;

    const res = await fetch(webhook.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        type: "webhook.test",
        customerId: webhook.customer_id,
        webhookId: webhook.id,
        at: new Date().toISOString(),
      }),
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
): Promise<{ ok: boolean; retryTodo: string }> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-TiSLY-Event": String(payload.type ?? "event"),
    };
    if (webhook.secret) headers["X-TiSLY-Webhook-Secret"] = webhook.secret;

    const res = await fetch(webhook.url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    return { ok: res.ok, retryTodo: res.ok ? "none" : "retry placeholder — queue not implemented" };
  } catch {
    return { ok: false, retryTodo: "retry placeholder — queue not implemented" };
  }
}
