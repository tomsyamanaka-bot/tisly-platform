export type DeviceTimelineEventType = "created" | "qr_issued" | "claimed" | "heartbeat" | "heartbeat_warning" | "heartbeat_offline" | "heartbeat_recovered" | "config_change" | "cert_issued" | "notification";
export interface DeviceTimelineEntry {
    id: string;
    deviceId: string;
    customerId: string | null;
    eventType: DeviceTimelineEventType;
    title: string;
    detail: string | null;
    actor: string | null;
    createdAt: string;
}
export declare function appendDeviceTimeline(input: {
    deviceId: string;
    customerId?: string;
    eventType: DeviceTimelineEventType;
    title: string;
    detail?: string;
    actor?: string;
}): DeviceTimelineEntry;
export declare function listDeviceTimeline(customerId: string, deviceId?: string, limit?: number): DeviceTimelineEntry[];
