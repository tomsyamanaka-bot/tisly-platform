export interface CustomerWebhook {
    id: string;
    customer_id: string;
    url: string;
    secret: string | null;
    enabled: number;
    created_at: string;
}
export declare function listWebhooks(customerId: string): CustomerWebhook[];
export declare function createWebhook(customerId: string, url: string, secret?: string): CustomerWebhook;
export declare function getWebhook(customerId: string, id: string): CustomerWebhook | null;
export declare function deleteWebhook(customerId: string, id: string): boolean;
export declare function sendWebhookTest(webhook: CustomerWebhook): Promise<{
    ok: boolean;
    status?: number;
    error?: string;
    deliveryId?: string;
}>;
export declare function sendWebhookEvent(webhook: CustomerWebhook, payload: Record<string, unknown>): Promise<{
    ok: boolean;
    retryTodo: string;
    deliveryId?: string;
}>;
