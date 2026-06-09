export interface StripeSubscriptionEvent {
    id: string;
    type: string;
    data: {
        object: Record<string, unknown>;
    };
}
export declare function isStripeConfigured(): boolean;
export declare function stripePriceForPlan(plan: string): string | undefined;
/** Verify Stripe webhook signature when configured; mock accepts all in dev. */
export declare function verifyStripeWebhook(rawBody: string, signatureHeader: string | undefined): Promise<{
    ok: boolean;
    mock: boolean;
    error?: string;
}>;
export declare function parseStripeEvent(body: unknown): StripeSubscriptionEvent | null;
export declare function billingPublicStatus(): {
    configured: boolean;
    mockMode: boolean;
    publicUrl: string;
};
