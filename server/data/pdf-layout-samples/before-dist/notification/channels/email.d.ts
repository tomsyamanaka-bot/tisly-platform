import type { NotificationPayload } from "../types.js";
import type { DeliveryResult } from "../types.js";
export declare function sendEmail(payload: NotificationPayload): Promise<DeliveryResult>;
export declare function sendReportEmail(input: {
    to: string;
    subject: string;
    html: string;
    attachments?: Array<{
        filename: string;
        content: Buffer;
    }>;
}): Promise<{
    ok: boolean;
    error?: string;
}>;
export declare function resendNotificationLog(logId: string): Promise<DeliveryResult>;
export declare function queueFailedDelivery(logId: string, channel: string, payload: NotificationPayload): void;
