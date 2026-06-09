import type { NotificationPayload } from "../types.js";
import type { DeliveryResult } from "../types.js";
export declare function sendDiscord(payload: NotificationPayload): Promise<DeliveryResult>;
