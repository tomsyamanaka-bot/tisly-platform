import type { NotificationPayload } from "../types.js";
import type { DeliveryResult } from "../types.js";
export declare function configureWebPush(): void;
export declare function sendWebPush(payload: NotificationPayload, userId?: string): Promise<DeliveryResult>;
export declare function countPushSubscriptions(userId?: string): number;
export declare function savePushSubscription(userId: string, subscription: {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
}, deviceId?: string): string;
