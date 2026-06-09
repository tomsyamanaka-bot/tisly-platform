export type ChecklistItemId = "qr_registered" | "site_assigned" | "floor_assigned" | "zone_assigned" | "map_placed" | "heartbeat_ok" | "event_test_ok" | "notification_test_ok" | "tv_display_ok" | "photo_registered";
export interface ChecklistItem {
    id: ChecklistItemId;
    label: string;
    completed: boolean;
    completedAt: string | null;
    manualOverride: boolean;
}
export declare function evaluateDeviceChecklist(customerId: string, deviceId: string): {
    deviceId: string;
    items: ChecklistItem[];
    completedCount: number;
    total: number;
};
export declare function getCustomerInstallChecklist(customerId: string): {
    devices: Array<{
        deviceId: string;
        label: string;
        items: ChecklistItem[];
        completedCount: number;
        total: number;
    }>;
    summary: {
        totalDevices: number;
        fullyComplete: number;
        openItems: string[];
    };
};
export declare function completeChecklistItem(customerId: string, deviceId: string, itemId: ChecklistItemId, actor?: string): ChecklistItem;
