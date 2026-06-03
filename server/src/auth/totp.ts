import { randomBytes } from "crypto";
import { getDatabase } from "../db/database.js";

export interface TotpSetupResult {
  secret: string;
  otpauthUrl: string;
  mock: true;
}

/** Mock TOTP — Phase 201+ replace with otplib/speakeasy */
export function setupTotp(userId: string): TotpSetupResult {
  const secret = randomBytes(10).toString("base64url");
  getDatabase()
    .prepare(
      `INSERT INTO totp_secrets (user_id, secret, enabled)
       VALUES (?, ?, 0)
       ON CONFLICT(user_id) DO UPDATE SET secret = excluded.secret, enabled = 0`
    )
    .run(userId, secret);
  return {
    secret,
    otpauthUrl: `otpauth://totp/TiSLY:${userId}?secret=${secret}&issuer=TiSLY`,
    mock: true,
  };
}

export function verifyTotp(userId: string, code: string): boolean {
  const row = getDatabase()
    .prepare(`SELECT secret, enabled FROM totp_secrets WHERE user_id = ?`)
    .get(userId) as { secret: string; enabled: number } | undefined;
  if (!row) return false;
  // Mock: accept code "000000" or last 6 chars of secret base32-ish
  const mockCode = row.secret.slice(-6).replace(/[^0-9]/g, "0").padStart(6, "0").slice(-6);
  return code === "000000" || code === mockCode;
}

export function enableTotp(userId: string, code: string): boolean {
  if (!verifyTotp(userId, code)) return false;
  getDatabase()
    .prepare(
      `UPDATE totp_secrets SET enabled = 1, verified_at = datetime('now') WHERE user_id = ?`
    )
    .run(userId);
  return true;
}

export function disableTotp(userId: string): void {
  getDatabase().prepare(`DELETE FROM totp_secrets WHERE user_id = ?`).run(userId);
}

export function isTotpEnabled(userId: string): boolean {
  const row = getDatabase()
    .prepare(`SELECT enabled FROM totp_secrets WHERE user_id = ?`)
    .get(userId) as { enabled: number } | undefined;
  return Boolean(row?.enabled);
}
