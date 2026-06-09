import { v4 as uuid } from "uuid";
import { getDatabase } from "../../db/database.js";
import { webhookSignatureHeaders } from "../webhook-signature.js";
import { enqueueWebhookDelivery } from "../webhook-retry-queue.js";
export function listWebhooks(customerId) {
    return getDatabase()
        .prepare(`SELECT id, customer_id, url, secret, enabled, created_at
       FROM customer_webhooks WHERE customer_id = ? ORDER BY created_at DESC`)
        .all(customerId);
}
export function createWebhook(customerId, url, secret) {
    const id = uuid();
    getDatabase()
        .prepare(`INSERT INTO customer_webhooks (id, customer_id, url, secret, enabled, created_at)
       VALUES (?, ?, ?, ?, 1, datetime('now'))`)
        .run(id, customerId, url, secret ?? null);
    return getWebhook(customerId, id);
}
export function getWebhook(customerId, id) {
    const row = getDatabase()
        .prepare(`SELECT id, customer_id, url, secret, enabled, created_at
       FROM customer_webhooks WHERE customer_id = ? AND id = ?`)
        .get(customerId, id);
    return row ?? null;
}
export function deleteWebhook(customerId, id) {
    const r = getDatabase()
        .prepare(`DELETE FROM customer_webhooks WHERE customer_id = ? AND id = ?`)
        .run(customerId, id);
    return r.changes > 0;
}
export async function sendWebhookTest(webhook) {
    const body = JSON.stringify({
        type: "webhook.test",
        customerId: webhook.customer_id,
        webhookId: webhook.id,
        at: new Date().toISOString(),
    });
    return deliverWebhookPayload(webhook, body, "webhook.test");
}
async function deliverWebhookPayload(webhook, body, eventHeader) {
    try {
        const headers = {
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
    }
    catch (e) {
        return { ok: false, error: String(e) };
    }
}
export async function sendWebhookEvent(webhook, payload) {
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
async function processWebhookRetry(logId, webhook) {
    const { getDeliveryLog, processDelivery } = await import("../webhook-retry-queue.js");
    const log = getDeliveryLog(logId);
    if (log)
        await processDelivery(log, webhook);
}
