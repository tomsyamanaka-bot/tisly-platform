export type QnapSendStatus = "sent" | "failed" | "mock";
export interface QnapSendLogEntry {
    id: string;
    payloadType: string;
    customerCode: string | null;
    deviceId: string | null;
    filePath: string | null;
    status: QnapSendStatus;
    errorMessage: string | null;
    mock: boolean;
    createdAt: string;
}
export declare function logQnapSend(input: {
    payloadType: string;
    customerCode?: string;
    deviceId?: string;
    filePath?: string;
    status: QnapSendStatus;
    errorMessage?: string;
    mock?: boolean;
}): string;
export declare function listQnapSendLogs(limit?: number): QnapSendLogEntry[];
export declare function getQnapSendStats(): {
    total: number;
    sent: number;
    failed: number;
    mock: number;
    successRatePercent: number;
};
