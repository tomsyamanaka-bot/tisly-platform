import { Router } from "express";
import {
  verifyStripeWebhook,
  parseStripeEvent,
  billingPublicStatus,
} from "../../billing/stripe-client.js";
import { handleStripeWebhookEvent } from "../../billing/stripe-webhook-handler.js";
import { getBillingByCustomerId } from "../../billing/billing-store.js";
import { getCustomerByCode } from "../../customer/customer-store.js";
import { requireAdminAuth } from "../../auth/auth-middleware.js";

export const billingRouter = Router();

billingRouter.post("/stripe/webhook", async (req, res) => {
  const rawBody =
    (req as typeof req & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);
  const sig = req.header("stripe-signature");
  const verified = await verifyStripeWebhook(rawBody, sig);
  if (!verified.ok) {
    res.status(400).json({ error: verified.error ?? "Invalid signature" });
    return;
  }

  let body: unknown = req.body;
  if (typeof rawBody === "string" && rawBody.startsWith("{")) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      /* use req.body */
    }
  }

  const event = parseStripeEvent(body);
  if (!event) {
    res.status(400).json({ error: "Invalid Stripe event payload" });
    return;
  }

  const result = handleStripeWebhookEvent(event);
  res.json({
    received: true,
    mock: verified.mock,
    ...result,
  });
});

billingRouter.get("/status", requireAdminAuth, (_req, res) => {
  res.json(billingPublicStatus());
});

billingRouter.get("/:customerCode", requireAdminAuth, (req, res) => {
  const customer = getCustomerByCode(String(req.params.customerCode));
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  const billing = getBillingByCustomerId(customer.customer_id);
  res.json({
    customerCode: customer.customer_code,
    plan: customer.plan,
    status: customer.status,
    billing: billing
      ? {
          subscription_status: billing.subscription_status ?? "none",
          next_billing_date: billing.next_billing_date,
          stripe_customer_id: billing.stripe_customer_id,
          stripe_subscription_id: billing.stripe_subscription_id,
          last_invoice_status: billing.last_invoice_status,
          contract_status: billing.contract_status ?? "active",
        }
      : null,
    placeholder: "Billing UI — Stripe integration ready; charges are not live until keys are set.",
  });
});
