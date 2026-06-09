export type DemoNotificationKind = "intrusion" | "power_outage" | "esp_fault" | "shelly_fault" | "maintenance_due";
export declare function triggerDemoNotification(kind: DemoNotificationKind, customerCode?: string): Promise<{
    ok: boolean;
    kind: DemoNotificationKind;
    customerCode: string;
    eventId: string;
    notificationLogId: string;
    proRemote: {
        tier: string | null;
        layerId: string | null;
    };
    webPush: {
        success: boolean;
        error?: string;
    };
}>;
export declare function listDemoNotificationKinds(): DemoNotificationKind[];
