export type NotificationChannel = "web_push" | "discord" | "email" | "line" | "telegram" | "sms";
export type EventSeverity = "info" | "warning" | "alarm" | "critical";
export interface TislyEvent {
    id?: string;
    tenantId?: string;
    siteId?: string;
    sourceType?: string;
    deviceId: string;
    eventType: string;
    severity?: EventSeverity;
    zone?: string;
    title: string;
    body?: string;
    payload?: Record<string, unknown>;
    timestamp?: string;
}
export interface NotificationPayload {
    title: string;
    body: string;
    eventType: string;
    deviceId?: string;
    url?: string;
    data?: Record<string, unknown>;
}
export interface DeliveryResult {
    channel: NotificationChannel;
    success: boolean;
    error?: string;
}
