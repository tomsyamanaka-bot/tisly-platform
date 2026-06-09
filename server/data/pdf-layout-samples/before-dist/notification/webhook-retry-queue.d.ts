import type { CustomerWebhook } from "./channels/webhook.js";
export type WebhookDeliveryStatus = "pending" | "delivered" | "failed" | "exhausted";
export interface WebhookDeliveryLog {
    id: string;
    webhook_id: string;
    customer_id: string;
    status: WebhookDeliveryStatus;
    attempt_count: number;
    max_attempts: number;
    next_retry_at: string | null;
    last_error: string | null;
    delivered_at: string | null;
    payload_json: string;
    created_at: string;
    updated_at: string;
}
export declare function enqueueWebhookDelivery(webhook: CustomerWebhook, payload: Record<string, unknown>): WebhookDeliveryLog;
export declare function getDeliveryLog(id: string): WebhookDeliveryLog | null;
export declare function listPendingDeliveries(limit?: number): WebhookDeliveryLog[];
export declare function processDelivery(log: WebhookDeliveryLog, webhook: CustomerWebhook): Promise<WebhookDeliveryLog>;
export declare function listDeliveriesForCustomer(customerId: string, limit?: number): WebhookDeliveryLog[];
export declare function retryDeliveryById(deliveryId: string, customerId: string): WebhookDeliveryLog | null;
