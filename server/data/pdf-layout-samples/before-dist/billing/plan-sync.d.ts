import type { CustomerPlan } from "../customer/types.js";
import { type CustomerBillingRow } from "./billing-store.js";
export declare function planFromStripePriceId(priceId: string | undefined): CustomerPlan | null;
export declare function syncPlanFromSubscriptionObject(customer: CustomerBillingRow, sub: Record<string, unknown>): CustomerBillingRow | null;
export declare function applyPaymentFailed(customer: CustomerBillingRow): CustomerBillingRow | null;
export declare function applyPaymentSucceeded(customer: CustomerBillingRow): CustomerBillingRow | null;
