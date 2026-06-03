export type SubscriptionStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete";

export function mapStripeSubscriptionStatus(stripeStatus: string): SubscriptionStatus {
  const allowed: SubscriptionStatus[] = [
    "none",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "unpaid",
    "incomplete",
  ];
  if (allowed.includes(stripeStatus as SubscriptionStatus)) {
    return stripeStatus as SubscriptionStatus;
  }
  return "none";
}

export function subscriptionNeedsAttention(status: SubscriptionStatus | string | null): boolean {
  return status === "past_due" || status === "unpaid" || status === "incomplete";
}

export function invoiceStatusFromStripe(status: string): string {
  if (status === "paid") return "paid";
  if (status === "open") return "open";
  if (status === "uncollectible") return "failed";
  return status;
}
