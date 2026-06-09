import { stripePriceForPlan } from "./stripe-client.js";
import { updateCustomerBilling } from "./billing-store.js";
import { mapStripeSubscriptionStatus } from "./subscription-status.js";
import { logAudit } from "../provisioning/audit-log.js";
const PRICE_TO_PLAN = {};
function buildPriceMap() {
    for (const plan of ["Lite", "Standard", "PRO", "PRO_REMOTE"]) {
        const priceId = stripePriceForPlan(plan);
        if (priceId)
            PRICE_TO_PLAN[priceId] = plan;
    }
}
export function planFromStripePriceId(priceId) {
    buildPriceMap();
    if (!priceId)
        return null;
    return PRICE_TO_PLAN[priceId] ?? null;
}
export function syncPlanFromSubscriptionObject(customer, sub) {
    const status = mapStripeSubscriptionStatus(String(sub.status ?? "none"));
    const items = sub.items;
    const priceId = items?.data?.[0]?.price?.id;
    const plan = planFromStripePriceId(priceId) ?? customer.plan;
    const periodEnd = sub.current_period_end;
    const nextBilling = periodEnd != null ? new Date(periodEnd * 1000).toISOString() : customer.next_billing_date;
    const contractStatus = status === "canceled" ? "cancelled" : status === "trialing" ? "trial" : "active";
    const updated = updateCustomerBilling(customer.customer_id, {
        plan,
        subscription_status: status,
        stripe_subscription_id: String(sub.id ?? customer.stripe_subscription_id ?? ""),
        next_billing_date: nextBilling ?? null,
        contract_status: contractStatus,
        status: status === "canceled" ? "suspended" : customer.status,
    });
    logAudit({
        tenantId: customer.customer_id,
        action: "billing.subscription_sync",
        targetType: "customer",
        targetId: customer.customer_id,
        afterJson: { plan, subscription_status: status, stripe_subscription_id: sub.id },
    });
    return updated;
}
export function applyPaymentFailed(customer) {
    const updated = updateCustomerBilling(customer.customer_id, {
        last_invoice_status: "failed",
        subscription_status: "past_due",
        contract_status: customer.contract_status === "cancelled" ? "cancelled" : "active",
    });
    logAudit({
        tenantId: customer.customer_id,
        action: "billing.payment_failed",
        targetType: "customer",
        targetId: customer.customer_id,
        afterJson: { last_invoice_status: "failed" },
    });
    return updated;
}
export function applyPaymentSucceeded(customer) {
    return updateCustomerBilling(customer.customer_id, {
        last_invoice_status: "paid",
        subscription_status: "active",
    });
}
