import { getDatabase } from "../db/database.js";
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

export function getBillingByCustomerId(customerId: string): CustomerBillingRow | null {
  const row = getDatabase()
    .prepare(
      `SELECT customer_id, customer_code, plan, status,
              contract_status, stripe_customer_id, stripe_subscription_id,
              subscription_status, next_billing_date, last_invoice_status
       FROM customers WHERE customer_id = ?`
    )
    .get(customerId) as CustomerBillingRow | undefined;
  return row ?? null;
}

export function getBillingByStripeCustomerId(stripeCustomerId: string): CustomerBillingRow | null {
  const row = getDatabase()
    .prepare(
      `SELECT customer_id, customer_code, plan, status,
              contract_status, stripe_customer_id, stripe_subscription_id,
              subscription_status, next_billing_date, last_invoice_status
       FROM customers WHERE stripe_customer_id = ?`
    )
    .get(stripeCustomerId) as CustomerBillingRow | null;
  return row ?? null;
}

export function getBillingByStripeSubscriptionId(
  subscriptionId: string
): CustomerBillingRow | null {
  const row = getDatabase()
    .prepare(
      `SELECT customer_id, customer_code, plan, status,
              contract_status, stripe_customer_id, stripe_subscription_id,
              subscription_status, next_billing_date, last_invoice_status
       FROM customers WHERE stripe_subscription_id = ?`
    )
    .get(subscriptionId) as CustomerBillingRow | null;
  return row ?? null;
}

export function updateCustomerBilling(
  customerId: string,
  patch: Partial<{
    plan: CustomerPlan;
    stripe_customer_id: string;
    stripe_subscription_id: string;
    subscription_status: SubscriptionStatus | string;
    next_billing_date: string | null;
    last_invoice_status: string;
    contract_status: string;
    status: string;
  }>
): CustomerBillingRow | null {
  const sets: string[] = ["updated_at = datetime('now')"];
  const params: unknown[] = [];
  for (const [key, val] of Object.entries(patch)) {
    if (val !== undefined) {
      sets.push(`${key} = ?`);
      params.push(val);
    }
  }
  if (sets.length === 1) return getBillingByCustomerId(customerId);
  params.push(customerId);
  getDatabase()
    .prepare(`UPDATE customers SET ${sets.join(", ")} WHERE customer_id = ?`)
    .run(...params);
  return getBillingByCustomerId(customerId);
}

export function linkStripeCustomer(
  customerId: string,
  stripeCustomerId: string,
  stripeSubscriptionId?: string
): void {
  updateCustomerBilling(customerId, {
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: stripeSubscriptionId,
  });
}
