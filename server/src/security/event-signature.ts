import { createHmac, timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { getDatabase } from "../db/database.js";
import { verifyDeviceSecret } from "../auth/device-auth.js";
import { decryptDeviceSecret } from "./secret-crypto.js";
import { recordSignatureError } from "./security-metrics.js";

export interface SignatureRequest extends Request {
  rawBody?: string;
}

function hmacSha256(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function resolveDeviceSecret(deviceId: string, headerSecret?: string): string | null {
  if (headerSecret && verifyDeviceSecret(deviceId, headerSecret)) {
    return headerSecret;
  }
  const row = getDatabase()
    .prepare(
      `SELECT secret_encrypted FROM device_credentials
       WHERE device_id = ? AND status = 'active'`
    )
    .get(deviceId) as { secret_encrypted: string | null } | undefined;
  if (row?.secret_encrypted) {
    return decryptDeviceSecret(row.secret_encrypted);
  }
  return null;
}

export function verifyEventSignature(
  deviceId: string,
  timestamp: string,
  rawBody: string,
  signature: string,
  headerSecret?: string
): { ok: true } | { ok: false; reason: string } {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: "invalid timestamp" };
  }
  const ageSec = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (ageSec > config.security.signatureMaxAgeSec) {
    return { ok: false, reason: "timestamp too old" };
  }

  const secret = resolveDeviceSecret(deviceId, headerSecret);
  if (!secret) {
    return { ok: false, reason: "device secret not available" };
  }

  const expected = hmacSha256(secret, `${timestamp}.${rawBody}`);
  try {
    const sigBuf = Buffer.from(signature, "hex");
    const expBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return { ok: false, reason: "signature mismatch" };
    }
  } catch {
    return { ok: false, reason: "signature mismatch" };
  }
  return { ok: true };
}

/** Optional HMAC verification when signature headers present or SIGNATURE_CHECK_ENABLED */
export function requireEventSignature(
  req: SignatureRequest,
  res: Response,
  next: NextFunction
): void {
  const deviceId = req.header("x-tisly-device-id");
  const timestamp = req.header("x-tisly-timestamp");
  const signature = req.header("x-tisly-signature");
  const hasSignatureHeaders = Boolean(deviceId && timestamp && signature);

  if (!config.security.signatureCheckEnabled && !hasSignatureHeaders) {
    next();
    return;
  }

  if (!deviceId || !timestamp || !signature) {
    recordSignatureError("missing headers");
    res.status(401).json({ error: "Missing x-tisly-device-id, x-tisly-timestamp, or x-tisly-signature" });
    return;
  }

  const rawBody = req.rawBody ?? JSON.stringify(req.body ?? {});
  const headerSecret = req.header("x-tisly-device-secret") ?? undefined;
  const result = verifyEventSignature(deviceId, timestamp, rawBody, signature, headerSecret);
  if (!result.ok) {
    recordSignatureError(result.reason);
    res.status(401).json({ error: "Invalid event signature", reason: result.reason });
    return;
  }
  next();
}

export { hmacSha256 };
