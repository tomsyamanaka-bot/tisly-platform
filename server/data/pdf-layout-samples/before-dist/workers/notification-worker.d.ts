export interface WorkerTickResult {
    notificationQueue: {
        processed: number;
        failed: number;
    };
    webhookDeliveries: {
        processed: number;
        failed: number;
    };
    reportEmails: {
        processed: number;
        failed: number;
    };
}
export declare function runNotificationWorkerTick(): Promise<WorkerTickResult>;
export declare function countPendingWebhookDeliveries(): number;
export declare function countPendingNotificationQueue(): number;
