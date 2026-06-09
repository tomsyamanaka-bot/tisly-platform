import { getDatabase } from "../db/database.js";
export function getBillingByCustomerId(customerId) {
    const row = getDatabase()
        .prepare(`SELECT customer_id, customer_code, plan, status,
              contract_status, stripe_customer_id, stripe_subscription_id,
              subscription_status, next_billing_date, last_invoice_status
       FROM customers WHERE customer_id = ?`)
        .get(customerId);
    return row ?? null;
}
export function getBillingByStripeCustomerId(stripeCustomerId) {
    const row = getDatabase()
        .prepare(`SELECT customer_id, customer_code, plan, status,
              contract_status, stripe_customer_id, stripe_subscription_id,
              subscription_status, next_billing_date, last_invoice_status
       FROM customers WHERE stripe_customer_id = ?`)
        .get(stripeCustomerId);
    return row ?? null;
}
export function getBillingByStripeSubscriptionId(subscriptionId) {
    const row = getDatabase()
        .prepare(`SELECT customer_id, customer_code, plan, status,
              contract_status, stripe_customer_id, stripe_subscription_id,
              subscription_status, next_billing_date, last_invoice_status
       FROM customers WHERE stripe_subscription_id = ?`)
        .get(subscriptionId);
    return row ?? null;
}
export function updateCustomerBilling(customerId, patch) {
    const sets = ["updated_at = datetime('now')"];
    const params = [];
    for (const [key, val] of Object.entries(patch)) {
        if (val !== undefined) {
            sets.push(`${key} = ?`);
            params.push(val);
        }
    }
    if (sets.length === 1)
        return getBillingByCustomerId(customerId);
    params.push(customerId);
    getDatabase()
        .prepare(`UPDATE customers SET ${sets.join(", ")} WHERE customer_id = ?`)
        .run(...params);
    return getBillingByCustomerId(customerId);
}
export function linkStripeCustomer(customerId, stripeCustomerId, stripeSubscriptionId) {
    updateCustomerBilling(customerId, {
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
    });
}
