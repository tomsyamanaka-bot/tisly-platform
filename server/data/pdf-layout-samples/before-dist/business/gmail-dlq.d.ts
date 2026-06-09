export type GmailDlqStatus = "dead_letter" | "requeued";
export interface GmailDlqItem {
    id: string;
    projectId: string | null;
    queueId: string | null;
    toAddress: string;
    subject: string;
    status: GmailDlqStatus;
    attemptCount: number;
    lastError: string | null;
    payloadJson: string | null;
    createdAt: string;
}
export declare function enqueueGmailDeadLetter(input: {
    projectId?: string | null;
    queueId?: string | null;
    toAddress: string;
    subject: string;
    attemptCount?: number;
    lastError?: string;
    payload?: unknown;
}): GmailDlqItem;
export declare function listGmailDlq(opts?: {
    limit?: number;
    projectId?: string;
}): GmailDlqItem[];
