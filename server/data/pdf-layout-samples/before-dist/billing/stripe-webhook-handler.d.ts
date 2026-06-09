import type { StripeSubscriptionEvent } from "./stripe-client.js";
export declare function handleStripeWebhookEvent(event: StripeSubscriptionEvent): {
    handled: boolean;
    action: string;
    customerCode?: string;
};
