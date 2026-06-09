import { config } from "../config.js";
import { getDatabase } from "../db/database.js";
import { logAudit } from "../provisioning/audit-log.js";
const MIN_PASSWORD_LEN = 8;
export function validateCustomerPasswordPolicy(password) {
    if (password.length < MIN_PASSWORD_LEN) {
        return `Password must be at least ${MIN_PASSWORD_LEN} characters`;
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
        return "Password must include letters and numbers";
    }
    return null;
}
export function isCustomerUserLocked(userId) {
    const row = getDatabase()
        .prepare(`SELECT locked_until FROM customer_users WHERE id = ?`)
        .get(userId);
    if (!row?.locked_until)
        return false;
    return Date.parse(row.locked_until) > Date.now();
}
export function getCustomerFailedLoginCount(userId) {
    const row = getDatabase()
        .prepare(`SELECT failed_login_count FROM customer_users WHERE id = ?`)
        .get(userId);
    return row?.failed_login_count ?? 0;
}
export function recordCustomerFailedLogin(userId, customerId, username, meta) {
    const db = getDatabase();
    const max = config.auth.customerLoginMaxAttempts;
    const lockMin = config.auth.customerLoginLockMinutes;
    const row = db
        .prepare(`SELECT failed_login_count FROM customer_users WHERE id = ?`)
        .get(userId);
    const next = (row?.failed_login_count ?? 0) + 1;
    let lockedUntil = null;
    if (next >= max) {
        lockedUntil = new Date(Date.now() + lockMin * 60 * 1000).toISOString();
    }
    db.prepare(`UPDATE customer_users SET failed_login_count = ?, locked_until = ?, updated_at = datetime('now') WHERE id = ?`).run(next, lockedUntil, userId);
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
export function clearCustomerFailedLogins(userId) {
    getDatabase()
        .prepare(`UPDATE customer_users SET failed_login_count = 0, locked_until = NULL, last_login_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
        .run(userId);
}
