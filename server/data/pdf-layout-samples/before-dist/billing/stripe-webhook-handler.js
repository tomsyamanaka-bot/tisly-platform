import { getBillingByStripeCustomerId, getBillingByStripeSubscriptionId, getBillingByCustomerId, updateCustomerBilling, } from "./billing-store.js";
import { applyPaymentFailed, applyPaymentSucceeded, syncPlanFromSubscriptionObject, } from "./plan-sync.js";
import { getCustomerByCode } from "../customer/customer-store.js";
import { logAudit } from "../provisioning/audit-log.js";
function resolveCustomerFromSubscription(sub) {
    const subId = String(sub.id ?? "");
    if (subId) {
        const bySub = getBillingByStripeSubscriptionId(subId);
        if (bySub)
            return bySub;
    }
    const customerRef = sub.customer;
    const stripeCustomerId = typeof customerRef === "string"
        ? customerRef
        : customerRef?.id;
    if (stripeCustomerId) {
        return getBillingByStripeCustomerId(stripeCustomerId);
    }
    const meta = sub.metadata;
    if (meta?.customer_code) {
        const c = getCustomerByCode(meta.customer_code);
        if (c)
            return getBillingByCustomerId(c.customer_id);
    }
    return null;
}
export function handleStripeWebhookEvent(event) {
    const obj = event.data.object;
    switch (event.type) {
        case "customer.subscription.created":
        case "customer.subscription.updated": {
            const customer = resolveCustomerFromSubscription(obj);
            if (!customer) {
                return { handled: false, action: "customer_not_found" };
            }
            syncPlanFromSubscriptionObject(customer, obj);
            return { handled: true, action: event.type, customerCode: customer.customer_code };
        }
        case "customer.subscription.deleted": {
            const customer = resolveCustomerFromSubscription(obj);
            if (!customer) {
                return { handled: false, action: "customer_not_found" };
            }
            updateCustomerBilling(customer.customer_id, {
                subscription_status: "canceled",
                contract_status: "cancelled",
                status: "suspended",
            });
            logAudit({
                tenantId: customer.customer_id,
                action: "billing.subscription_deleted",
                targetType: "customer",
                targetId: customer.customer_id,
            });
            return { handled: true, action: event.type, customerCode: customer.customer_code };
        }
        case "invoice.payment_succeeded": {
            const subId = String(obj.subscription ?? "");
            const customer = (subId ? getBillingByStripeSubscriptionId(subId) : null) ??
                getBillingByStripeCustomerId(String(obj.customer ?? ""));
            if (!customer) {
                return { handled: false, action: "customer_not_found" };
            }
            applyPaymentSucceeded(customer);
            return { handled: true, action: event.type, customerCode: customer.customer_code };
        }
        case "invoice.payment_failed": {
            const subId = String(obj.subscription ?? "");
            const customer = (subId ? getBillingByStripeSubscriptionId(subId) : null) ??
                getBillingByStripeCustomerId(String(obj.customer ?? ""));
            if (!customer) {
                return { handled: false, action: "customer_not_found" };
            }
            applyPaymentFailed(customer);
            return { handled: true, action: event.type, customerCode: customer.customer_code };
        }
        default:
            return { handled: false, action: "ignored" };
    }
}
