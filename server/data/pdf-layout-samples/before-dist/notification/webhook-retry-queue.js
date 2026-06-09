import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { sendWebhookEvent } from "./channels/webhook.js";
const MAX_ATTEMPTS = 5;
export function enqueueWebhookDelivery(webhook, payload) {
    const id = uuid();
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`INSERT INTO webhook_delivery_logs (
        id, webhook_id, customer_id, status, attempt_count, max_attempts,
        next_retry_at, last_error, payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, 'pending', 0, ?, datetime('now'), NULL, ?, ?, ?)`)
        .run(id, webhook.id, webhook.customer_id, MAX_ATTEMPTS, JSON.stringify(payload), now, now);
    return getDeliveryLog(id);
}
export function getDeliveryLog(id) {
    const row = getDatabase()
        .prepare(`SELECT * FROM webhook_delivery_logs WHERE id = ?`)
        .get(id);
    return row ?? null;
}
export function listPendingDeliveries(limit = 50) {
    return getDatabase()
        .prepare(`SELECT * FROM webhook_delivery_logs
       WHERE status = 'pending' AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
       ORDER BY created_at ASC LIMIT ?`)
        .all(limit);
}
function nextRetryIso(attempt) {
    const delaySec = Math.min(3600, 30 * 2 ** attempt);
    return new Date(Date.now() + delaySec * 1000).toISOString();
}
export async function processDelivery(log, webhook) {
    const payload = JSON.parse(log.payload_json);
    const result = await sendWebhookEvent(webhook, payload);
    const attempt = log.attempt_count + 1;
    const db = getDatabase();
    if (result.ok) {
        db.prepare(`UPDATE webhook_delivery_logs SET status = 'delivered', attempt_count = ?,
       last_error = NULL, delivered_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(attempt, log.id);
    }
    else if (attempt >= log.max_attempts) {
        db.prepare(`UPDATE webhook_delivery_logs SET status = 'exhausted', attempt_count = ?,
       last_error = ?, updated_at = datetime('now') WHERE id = ?`).run(attempt, result.retryTodo, log.id);
    }
    else {
        db.prepare(`UPDATE webhook_delivery_logs SET status = 'pending', attempt_count = ?,
       next_retry_at = ?, last_error = ?, updated_at = datetime('now') WHERE id = ?`).run(attempt, nextRetryIso(attempt), result.retryTodo, log.id);
    }
    return getDeliveryLog(log.id);
}
export function listDeliveriesForCustomer(customerId, limit = 50) {
    return getDatabase()
        .prepare(`SELECT * FROM webhook_delivery_logs WHERE customer_id = ?
       ORDER BY created_at DESC LIMIT ?`)
        .all(customerId, limit);
}
export function retryDeliveryById(deliveryId, customerId) {
    const log = getDeliveryLog(deliveryId);
    if (!log || log.customer_id !== customerId)
        return null;
    if (log.status === "delivered")
        return log;
    getDatabase()
        .prepare(`UPDATE webhook_delivery_logs SET status = 'pending', next_retry_at = NULL,
       updated_at = datetime('now') WHERE id = ? AND customer_id = ?`)
        .run(deliveryId, customerId);
    return getDeliveryLog(deliveryId);
}
