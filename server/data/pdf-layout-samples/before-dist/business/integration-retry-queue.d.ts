export type RetryChannel = "gmail" | "qnap" | "pdf";
export type RetryQueueStatus = "pending" | "retrying" | "success" | "failed" | "cancelled";
export type SendMode = "dryRun" | "mockOnly" | "realSend";
export interface RetryQueueItem {
    id: string;
    projectId: string | null;
    channel: RetryChannel;
    status: RetryQueueStatus;
    payload: Record<string, unknown>;
    sendMode: SendMode;
    attemptCount: number;
    lastError: string | null;
    log: Array<{
        at: string;
        message: string;
    }>;
    createdAt: string;
    updatedAt: string;
}
export declare function enqueueIntegrationRetry(input: {
    projectId?: string | null;
    channel: RetryChannel;
    payload?: Record<string, unknown>;
    sendMode?: SendMode;
    errorMessage?: string;
}): RetryQueueItem;
export declare function listIntegrationRetryQueue(opts?: {
    projectId?: string;
    status?: RetryQueueStatus;
    limit?: number;
}): RetryQueueItem[];
export declare function retryIntegrationQueueItem(id: string): RetryQueueItem | null;
export declare function cancelIntegrationRetry(id: string): RetryQueueItem | null;
export declare function getIntegrationRetryLog(id: string): RetryQueueItem | null;
