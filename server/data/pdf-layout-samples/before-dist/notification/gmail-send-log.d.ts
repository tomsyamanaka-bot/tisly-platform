export type GmailSendLogStatus = "sent" | "failed" | "mock";
export interface GmailSendLogEntry {
    id: string;
    recipient: string;
    subject: string;
    sendType: string;
    status: GmailSendLogStatus;
    errorMessage: string | null;
    mock: boolean;
    createdAt: string;
}
export declare function logGmailSend(input: {
    recipient: string;
    subject: string;
    sendType?: string;
    status: GmailSendLogStatus;
    errorMessage?: string;
    mock?: boolean;
}): string;
export declare function listGmailSendLogs(limit?: number): GmailSendLogEntry[];
export declare function getLastGmailSendStatus(): {
    status: GmailSendLogStatus | null;
    recipient: string | null;
    subject: string | null;
    errorMessage: string | null;
    createdAt: string | null;
};
export declare function getGmailSendStats(): {
    total: number;
    sent: number;
    failed: number;
    mock: number;
    successRatePercent: number;
};
