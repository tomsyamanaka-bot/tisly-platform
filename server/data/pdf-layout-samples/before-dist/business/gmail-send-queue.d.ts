export type GmailQueueStatus = "pending" | "retrying" | "sent" | "failed";
export interface GmailSendQueueItem {
    id: string;
    projectId: string | null;
    toAddress: string;
    subject: string;
    bodyPreview: string;
    status: GmailQueueStatus;
    sendMode: "mockOnly" | "realSend" | "dryRun";
    attemptCount: number;
    lastError: string | null;
    createdAt: string;
    updatedAt: string;
}
export declare function resolveGmailSendMode(): "mockOnly" | "realSend";
export declare function enqueueGmailSend(input: {
    projectId?: string | null;
    toAddress: string;
    subject: string;
    bodyPreview?: string;
    sendMode?: GmailSendQueueItem["sendMode"];
}): GmailSendQueueItem;
export declare function listGmailSendQueue(opts?: {
    status?: GmailQueueStatus;
    limit?: number;
}): GmailSendQueueItem[];
export declare function processGmailQueueItem(id: string): GmailSendQueueItem | null;
export declare function processGmailQueueBatch(limit?: number): {
    processed: number;
    sent: number;
    failed: number;
};
