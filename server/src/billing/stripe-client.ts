import { config } from "../config.js";

export interface StripeSubscriptionEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

export function stripePriceForPlan(plan: string): string | undefined {
  const map: Record<string, string | undefined> = {
    Lite: process.env.STRIPE_PRICE_LITE,
    Standard: process.env.STRIPE_PRICE_STANDARD,
    PRO: process.env.STRIPE_PRICE_PRO,
    PRO_REMOTE: process.env.STRIPE_PRICE_PRO_REMOTE,
  };
  return map[plan];
}

/** Verify Stripe webhook signature when configured; mock accepts all in dev. */
export async function verifyStripeWebhook(
  rawBody: string,
  signatureHeader: string | undefined
): Promise<{ ok: boolean; mock: boolean; error?: string }> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return { ok: true, mock: true };
  }
  if (!signatureHeader) {
    return { ok: false, mock: false, error: "Missing stripe-signature header" };
  }
  try {
    const parts = signatureHeader.split(",").reduce(
      (acc, part) => {
        const [k, v] = part.split("=");
        if (k && v) acc[k.trim()] = v.trim();
        return acc;
      },
      {} as Record<string, string>
    );
    const timestamp = parts.t;
    const sig = parts.v1;
    if (!timestamp || !sig) {
      return { ok: false, mock: false, error: "Invalid signature format" };
    }
    const crypto = await import("crypto");
    const payload = `${timestamp}.${rawBody}`;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    if (expected !== sig) {
      return { ok: false, mock: false, error: "Signature mismatch" };
    }
    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (age > 300) {
      return { ok: false, mock: false, error: "Timestamp too old" };
    }
    return { ok: true, mock: false };
  } catch (e) {
    return {
      ok: false,
      mock: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function parseStripeEvent(body: unknown): StripeSubscriptionEvent | null {
  if (!body || typeof body !== "object") return null;
  const ev = body as StripeSubscriptionEvent;
  if (!ev.type || !ev.data?.object) return null;
  return ev;
}

export function billingPublicStatus(): {
  configured: boolean;
  mockMode: boolean;
  publicUrl: string;
} {
  return {
    configured: isStripeConfigured(),
    mockMode: !isStripeConfigured(),
    publicUrl: config.publicUrl,
  };
}
