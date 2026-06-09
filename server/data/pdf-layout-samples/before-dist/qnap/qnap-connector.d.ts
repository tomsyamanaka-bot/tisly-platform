export type QnapPayloadType = "event" | "alarm" | "maintenance" | "photo";
export interface QnapSendResult {
    ok: boolean;
    mock: boolean;
    logId: string;
    filePath?: string;
    error?: string;
}
export interface QnapConnector {
    readonly mode: "mock" | "real";
    send(type: QnapPayloadType, payload: Record<string, unknown>, meta?: {
        customerCode?: string;
        deviceId?: string;
    }): Promise<QnapSendResult>;
    testConnection(): Promise<{
        ok: boolean;
        mock: boolean;
        message: string;
    }>;
}
export declare function getQnapConnector(): QnapConnector;
export declare function resetQnapConnector(): void;
