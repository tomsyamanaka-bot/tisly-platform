import type { CustomerPlan } from "../customer/types.js";
import type { SubscriptionStatus } from "./subscription-status.js";
export interface CustomerBillingRow {
    customer_id: string;
    customer_code: string;
    plan: CustomerPlan;
    status: string;
    contract_status: string | null;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    subscription_status: string | null;
    next_billing_date: string | null;
    last_invoice_status: string | null;
}
export declare function getBillingByCustomerId(customerId: string): CustomerBillingRow | null;
export declare function getBillingByStripeCustomerId(stripeCustomerId: string): CustomerBillingRow | null;
export declare function getBillingByStripeSubscriptionId(subscriptionId: string): CustomerBillingRow | null;
export declare function updateCustomerBilling(customerId: string, patch: Partial<{
    plan: CustomerPlan;
    stripe_customer_id: string;
    stripe_subscription_id: string;
    subscription_status: SubscriptionStatus | string;
    next_billing_date: string | null;
    last_invoice_status: string;
    contract_status: string;
    status: string;
}>): CustomerBillingRow | null;
export declare function linkStripeCustomer(customerId: string, stripeCustomerId: string, stripeSubscriptionId?: string): void;
