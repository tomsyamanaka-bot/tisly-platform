import { randomBytes } from "crypto";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { getDatabase } from "../db/database.js";
import { config } from "../config.js";

export interface TotpSetupResult {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
  mock: false;
}

authenticator.options = { window: 1 };

export function setupTotp(userId: string): Promise<TotpSetupResult> {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(userId, "TiSLY", secret);
  getDatabase()
    .prepare(
      `INSERT INTO totp_secrets (user_id, secret, enabled)
       VALUES (?, ?, 0)
       ON CONFLICT(user_id) DO UPDATE SET secret = excluded.secret, enabled = 0`
    )
    .run(userId, secret);
  return QRCode.toDataURL(otpauthUrl).then((qrDataUrl) => ({
    secret,
    otpauthUrl,
    qrDataUrl,
    mock: false as const,
  }));
}

export function verifyTotpCode(userId: string, code: string): boolean {
  const row = getDatabase()
    .prepare(`SELECT secret, enabled FROM totp_secrets WHERE user_id = ?`)
    .get(userId) as { secret: string; enabled: number } | undefined;
  if (!row) return false;
  return authenticator.verify({ token: code, secret: row.secret });
}

export function enableTotp(userId: string, code: string): boolean {
  if (!verifyTotpCode(userId, code)) return false;
  getDatabase()
    .prepare(
      `UPDATE totp_secrets SET enabled = 1, verified_at = datetime('now') WHERE user_id = ?`
    )
    .run(userId);
  return true;
}

export function disableTotp(userId: string, code?: string): boolean {
  if (code && !verifyTotpCode(userId, code)) return false;
  getDatabase().prepare(`DELETE FROM totp_secrets WHERE user_id = ?`).run(userId);
  return true;
}

export function isTotpEnabled(userId: string): boolean {
  const row = getDatabase()
    .prepare(`SELECT enabled FROM totp_secrets WHERE user_id = ?`)
    .get(userId) as { enabled: number } | undefined;
  return Boolean(row?.enabled);
}

export function isRequire2fa(): boolean {
  return process.env.REQUIRE_2FA === "true";
}

export function adminRequires2fa(userId: string): boolean {
  if (!isRequire2fa()) return false;
  return userId === "admin-default" || userId === config.auth.adminUsername;
}

/** @deprecated use verifyTotpCode */
export function verifyTotp(userId: string, code: string): boolean {
  return verifyTotpCode(userId, code);
}
