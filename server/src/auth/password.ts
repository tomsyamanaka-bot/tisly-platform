import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SCRYPT_HASH_RE = /^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/;

export function normalizeStoredPasswordHash(stored: string): string {
  let value = stored.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

export function isValidScryptPasswordHash(stored: string | undefined): boolean {
  if (!stored) return false;
  return SCRYPT_HASH_RE.test(normalizeStoredPasswordHash(stored));
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const normalized = normalizeStoredPasswordHash(stored);
  const parts = normalized.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, expected] = parts;
  if (!/^[0-9a-f]{32}$/.test(salt) || !/^[0-9a-f]{128}$/.test(expected)) return false;
  const actual = scryptSync(password, salt, 64).toString("hex");
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));
  } catch {
    return false;
  }
}
