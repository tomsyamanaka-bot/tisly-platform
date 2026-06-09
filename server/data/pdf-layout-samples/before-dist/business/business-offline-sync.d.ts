export type OfflineSyncOpType = "project_create" | "photo_memo" | "status_change" | "estimate_item" | "invoice_memo" | "payment_memo";
export interface OfflineSyncItem {
    type: OfflineSyncOpType;
    projectId?: string;
    payload?: Record<string, unknown>;
    clientId?: string;
}
export interface OfflineSyncResult {
    synced: Array<{
        type: OfflineSyncOpType;
        projectId?: string;
        clientId?: string;
    }>;
    failed: Array<{
        type: OfflineSyncOpType;
        error: string;
        clientId?: string;
    }>;
    skipped: Array<{
        type: OfflineSyncOpType;
        reason: string;
        clientId?: string;
    }>;
}
export declare function processBusinessOfflineSync(items: OfflineSyncItem[]): OfflineSyncResult;
