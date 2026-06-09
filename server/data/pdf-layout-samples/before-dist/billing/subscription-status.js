export function mapStripeSubscriptionStatus(stripeStatus) {
    const allowed = [
        "none",
        "trialing",
        "active",
        "past_due",
        "canceled",
        "unpaid",
        "incomplete",
    ];
    if (allowed.includes(stripeStatus)) {
        return stripeStatus;
    }
    return "none";
}
export function subscriptionNeedsAttention(status) {
    return status === "past_due" || status === "unpaid" || status === "incomplete";
}
export function invoiceStatusFromStripe(status) {
    if (status === "paid")
        return "paid";
    if (status === "open")
        return "open";
    if (status === "uncollectible")
        return "failed";
    return status;
}
