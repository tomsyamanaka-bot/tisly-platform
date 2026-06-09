export type FieldChecklistItemId = "esp_registered" | "shelly_registered" | "mqtt_heartbeat" | "notification_test" | "google_tv" | "photo_before" | "photo_after" | "completion_report";
export type FieldChecklistStatus = "pending" | "done" | "needs_review";
export interface FieldChecklistItem {
    id: FieldChecklistItemId;
    label: string;
    status: FieldChecklistStatus;
    statusLabel: string;
    detail: string;
    autoEvaluated: boolean;
}
export declare function evaluateFieldChecklist(customerCode: string): {
    customerCode: string;
    phase: string;
    items: FieldChecklistItem[];
    summary: {
        pending: number;
        done: number;
        needsReview: number;
        total: number;
    };
};
export declare function updateFieldChecklistItem(customerCode: string, itemId: FieldChecklistItemId, status: FieldChecklistStatus): FieldChecklistItem;
export declare function getInstallerHomeCards(customerCode: string): Promise<{
    todayWork: string;
    incompleteCount: number;
    photoShortage: number;
    mqttUnconfirmed: number;
    shellyUnconfirmed: number;
    fieldChecklist: ReturnType<typeof evaluateFieldChecklist>;
}>;
