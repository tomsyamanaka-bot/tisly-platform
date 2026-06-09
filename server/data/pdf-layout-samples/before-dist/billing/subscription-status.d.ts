export type SubscriptionStatus = "none" | "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "incomplete";
export declare function mapStripeSubscriptionStatus(stripeStatus: string): SubscriptionStatus;
export declare function subscriptionNeedsAttention(status: SubscriptionStatus | string | null): boolean;
export declare function invoiceStatusFromStripe(status: string): string;
