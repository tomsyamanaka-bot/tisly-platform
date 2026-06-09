export type OfflineSyncAction = "qr_claim" | "nfc_claim" | "map_placement" | "checklist_complete" | "photo_upload" | "test_result" | "mqtt_test_result" | "field_checklist_update";
export interface OfflineSyncEntry {
    id?: string;
    action: OfflineSyncAction;
    clientAt?: string;
    body: Record<string, unknown>;
}
export interface OfflineSyncResultItem {
    id: string;
    action: OfflineSyncAction;
    status: "applied" | "skipped" | "rejected" | "warning" | "conflict" | "merged";
    message: string;
}
export interface OfflineSyncReport {
    ok: boolean;
    applied: number;
    skipped: number;
    rejected: number;
    warnings: number;
    results: OfflineSyncResultItem[];
}
export declare function processOfflineSync(customerId: string, entries: OfflineSyncEntry[], actor?: string): OfflineSyncReport;
