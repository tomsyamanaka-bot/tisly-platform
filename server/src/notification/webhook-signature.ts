import { createHmac, timingSafeEqual } from "crypto";

const SIG_VERSION = "v1";

export function buildWebhookSignaturePayload(
  timestamp: string,
  rawBody: string
): string {
  return `${timestamp}.${rawBody}`;
}

export function signWebhookPayload(secret: string, timestamp: string, rawBody: string): string {
  const payload = buildWebhookSignaturePayload(timestamp, rawBody);
  const digest = createHmac("sha256", secret).update(payload).digest("hex");
  return `${SIG_VERSION}=${digest}`;
}

export function webhookSignatureHeaders(
  secret: string,
  rawBody: string
): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signWebhookPayload(secret, timestamp, rawBody);
  return {
    "x-tisly-webhook-timestamp": timestamp,
    "x-tisly-webhook-signature": signature,
  };
}

export function verifyWebhookSignature(
  secret: string,
  timestamp: string,
  signature: string,
  rawBody: string,
  maxSkewSec = 300
): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > maxSkewSec) return false;

  const expected = signWebhookPayload(secret, timestamp, rawBody);
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
