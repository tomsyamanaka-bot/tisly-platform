import { config } from "../config.js";
import { getDatabase } from "../db/database.js";
import { logAudit } from "../provisioning/audit-log.js";

const MIN_PASSWORD_LEN = 8;

export function validateCustomerPasswordPolicy(password: string): string | null {
  if (password.length < MIN_PASSWORD_LEN) {
    return `Password must be at least ${MIN_PASSWORD_LEN} characters`;
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include letters and numbers";
  }
  return null;
}

export function isCustomerUserLocked(userId: string): boolean {
  const row = getDatabase()
    .prepare(
      `SELECT locked_until FROM customer_users WHERE id = ?`
    )
    .get(userId) as { locked_until: string | null } | undefined;
  if (!row?.locked_until) return false;
  return Date.parse(row.locked_until) > Date.now();
}

export function getCustomerFailedLoginCount(userId: string): number {
  const row = getDatabase()
    .prepare(`SELECT failed_login_count FROM customer_users WHERE id = ?`)
    .get(userId) as { failed_login_count: number } | undefined;
  return row?.failed_login_count ?? 0;
}

export function recordCustomerFailedLogin(
  userId: string,
  customerId: string,
  username: string,
  meta?: { ip?: string; userAgent?: string }
): { locked: boolean; attempts: number } {
  const db = getDatabase();
  const max = config.auth.customerLoginMaxAttempts;
  const lockMin = config.auth.customerLoginLockMinutes;

  const row = db
    .prepare(`SELECT failed_login_count FROM customer_users WHERE id = ?`)
    .get(userId) as { failed_login_count: number } | undefined;
  const next = (row?.failed_login_count ?? 0) + 1;
  let lockedUntil: string | null = null;
  if (next >= max) {
    lockedUntil = new Date(Date.now() + lockMin * 60 * 1000).toISOString();
  }
  db.prepare(
    `UPDATE customer_users SET failed_login_count = ?, locked_until = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(next, lockedUntil, userId);

  logAudit({
    tenantId: customerId,
    actorLabel: username,
    action: "auth.customer_login_failed",
    targetType: "customer_user",
    targetId: userId,
    ipAddress: meta?.ip,
    userAgent: meta?.userAgent,
    details: { attempts: next, locked: Boolean(lockedUntil) },
  });

  return { locked: Boolean(lockedUntil), attempts: next };
}

export function clearCustomerFailedLogins(userId: string): void {
  getDatabase()
    .prepare(
      `UPDATE customer_users SET failed_login_count = 0, locked_until = NULL, last_login_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    )
    .run(userId);
}
