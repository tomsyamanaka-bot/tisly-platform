import { createHmac, timingSafeEqual } from "crypto";
import { config } from "../config.js";

export interface JwtPayload {
  sub: string;
  username: string;
  role: string;
}

function b64url(data: string): string {
  return Buffer.from(data, "utf8").toString("base64url");
}

function b64urlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

export function signToken(payload: JwtPayload): string {
  const secret = config.auth.jwtSecret;
  if (!secret) throw new Error("JWT_SECRET not configured");
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(
    JSON.stringify({
      ...payload,
      iat: now,
      exp: now + config.auth.sessionExpiresMinutes * 60,
    })
  );
  const sig = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string): JwtPayload | null {
  const secret = config.auth.jwtSecret;
  if (!secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  const parsed = JSON.parse(b64urlDecode(body)) as JwtPayload & { exp?: number; iat?: number };
  if (parsed.exp && parsed.exp < Math.floor(Date.now() / 1000)) return null;
  return { sub: parsed.sub, username: parsed.username, role: parsed.role };
}
