import { randomBytes } from "crypto";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getCustomerByCode } from "./customer-store.js";
import { hashPassword } from "../auth/password.js";
import { logAudit } from "../provisioning/audit-log.js";
import { buildInviteAcceptUrl, buildInviteEmailHtml, sendInviteEmailPlaceholder, } from "./invite-email-template.js";
const INVITE_TTL_HOURS = 72;
export function listCustomerUsers(customerId) {
    return getDatabase()
        .prepare(`SELECT id, customer_id, username, role, status, last_login_at,
              invite_expires_at, invited_at, accepted_at, disabled_at, created_at
       FROM customer_users
       WHERE customer_id = ? AND status != 'deleted'
       ORDER BY username`)
        .all(customerId);
}
export function canInviteUsers(role) {
    const r = role === "super_admin" ? "owner" : role;
    return r === "owner" || r === "admin";
}
export function inviteCustomerUser(input) {
    const customer = getCustomerByCode(input.customerCode);
    if (!customer)
        return { error: "Customer not found" };
    const existing = getDatabase()
        .prepare(`SELECT id FROM customer_users WHERE customer_id = ? AND username = ? AND status != 'deleted'`)
        .get(customer.customer_id, input.username);
    if (existing)
        return { error: "Username already exists" };
    const userId = uuid();
    const inviteToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600_000).toISOString();
    const placeholderHash = hashPassword(randomBytes(16).toString("hex"));
    getDatabase()
        .prepare(`INSERT INTO customer_users (
        id, customer_id, username, password_hash, role, status,
        invite_token, invite_expires_at, invited_by, invited_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'invited', ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))`)
        .run(userId, customer.customer_id, input.username, placeholderHash, input.role, inviteToken, expiresAt, input.invitedByUserId);
    logAudit({
        tenantId: customer.customer_id,
        userId: input.invitedByUserId,
        actorLabel: input.invitedByLabel,
        action: "customer_user.invite",
        targetType: "customer_user",
        targetId: userId,
        afterJson: { username: input.username, role: input.role, expiresAt },
        ipAddress: input.ip,
    });
    const emailPreview = buildInviteEmailHtml({
        customerName: customer.customer_name,
        customerCode: customer.customer_code,
        inviterName: input.invitedByLabel,
        role: input.role,
        expiresAt,
        inviteToken,
    });
    void sendInviteEmailPlaceholder(`${input.username}@placeholder.local`, {
        customerName: customer.customer_name,
        customerCode: customer.customer_code,
        inviterName: input.invitedByLabel,
        role: input.role,
        expiresAt,
        inviteToken,
    });
    return {
        userId,
        inviteToken,
        expiresAt,
        acceptUrl: buildInviteAcceptUrl(customer.customer_code, inviteToken),
        emailPreview,
        emailSent: false,
    };
}
export function reinviteCustomerUser(input) {
    const row = getDatabase()
        .prepare(`SELECT username, role, status, customer_id FROM customer_users WHERE id = ?`)
        .get(input.userId);
    if (!row || row.customer_id !== input.customerId)
        return { error: "User not found" };
    if (!["invited", "suspended"].includes(row.status)) {
        return { error: "User must be invited or suspended to reinvite" };
    }
    const customer = getDatabase()
        .prepare(`SELECT customer_code, customer_name FROM customers WHERE customer_id = ?`)
        .get(input.customerId);
    const inviteToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600_000).toISOString();
    getDatabase()
        .prepare(`UPDATE customer_users SET status = 'invited', invite_token = ?, invite_expires_at = ?,
       invited_by = ?, invited_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`)
        .run(inviteToken, expiresAt, input.invitedByUserId, input.userId);
    logAudit({
        tenantId: input.customerId,
        userId: input.invitedByUserId,
        actorLabel: input.invitedByLabel,
        action: "customer_user.reinvite",
        targetType: "customer_user",
        targetId: input.userId,
        ipAddress: input.ip,
    });
    void sendInviteEmailPlaceholder(`${row.username}@placeholder.local`, {
        customerName: customer.customer_name,
        customerCode: customer.customer_code,
        inviterName: input.invitedByLabel,
        role: row.role,
        expiresAt,
        inviteToken,
    });
    return { inviteToken, expiresAt };
}
export function acceptCustomerInvite(input) {
    const customer = getCustomerByCode(input.customerCode);
    if (!customer)
        return { error: "Customer not found" };
    const row = getDatabase()
        .prepare(`SELECT id, username, invite_expires_at, status
       FROM customer_users
       WHERE customer_id = ? AND invite_token = ?`)
        .get(customer.customer_id, input.inviteToken);
    if (!row)
        return { error: "Invalid invite token" };
    if (row.status !== "invited")
        return { error: "Invite not pending" };
    if (row.invite_expires_at && new Date(row.invite_expires_at).getTime() < Date.now()) {
        return { error: "Invite expired" };
    }
    const passwordHash = hashPassword(input.password);
    getDatabase()
        .prepare(`UPDATE customer_users SET
        password_hash = ?, status = 'active',
        invite_token = NULL, invite_expires_at = NULL,
        accepted_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`)
        .run(passwordHash, row.id);
    logAudit({
        tenantId: customer.customer_id,
        userId: row.id,
        actorLabel: row.username,
        action: "customer_user.accept_invite",
        targetType: "customer_user",
        targetId: row.id,
        ipAddress: input.ip,
    });
    return { userId: row.id, username: row.username };
}
export function disableCustomerUser(input) {
    const r = getDatabase()
        .prepare(`UPDATE customer_users SET status = 'suspended', disabled_at = datetime('now'),
       updated_at = datetime('now')
       WHERE id = ? AND customer_id = ? AND status IN ('active', 'invited')`)
        .run(input.userId, input.customerId);
    if (r.changes === 0)
        return false;
    logAudit({
        tenantId: input.customerId,
        userId: input.actorUserId,
        actorLabel: input.actorLabel,
        action: "customer_user.disable",
        targetType: "customer_user",
        targetId: input.userId,
        ipAddress: input.ip,
    });
    return true;
}
export function updateCustomerUserRole(input) {
    const r = getDatabase()
        .prepare(`UPDATE customer_users SET role = ?, updated_at = datetime('now')
       WHERE id = ? AND customer_id = ? AND status != 'deleted'`)
        .run(input.role, input.userId, input.customerId);
    if (r.changes === 0)
        return false;
    logAudit({
        tenantId: input.customerId,
        userId: input.actorUserId,
        actorLabel: input.actorLabel,
        action: "customer_user.role",
        targetType: "customer_user",
        targetId: input.userId,
        afterJson: { role: input.role },
        ipAddress: input.ip,
    });
    return true;
}
