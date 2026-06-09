import type { DeliveryResult, NotificationPayload } from "./types.js";
export type EmailProviderMode = "mock" | "smtp" | "gmail";
export interface EmailNotificationProvider {
    readonly mode: EmailProviderMode;
    send(payload: NotificationPayload): Promise<DeliveryResult>;
}
export declare function getEmailProviderMode(): EmailProviderMode;
export declare function getEmailNotificationProvider(): EmailNotificationProvider;
export declare function resetEmailNotificationProvider(): void;
export declare function sendEmailViaProvider(payload: NotificationPayload): Promise<DeliveryResult>;
