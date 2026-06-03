import { randomBytes } from "crypto";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getCustomerByCode } from "./customer-store.js";
import type { CustomerRole } from "./types.js";
import { hashPassword } from "../auth/password.js";
import { logAudit } from "../provisioning/audit-log.js";
import {
  buildInviteAcceptUrl,
  buildInviteEmailHtml,
  sendInviteEmailPlaceholder,
} from "./invite-email-template.js";

const INVITE_TTL_HOURS = 72;

export interface CustomerUserRow {
  id: string;
  customer_id: string;
  username: string;
  role: CustomerRole;
  status: string;
  last_login_at: string | null;
  invite_expires_at: string | null;
  invited_at: string | null;
  accepted_at: string | null;
  disabled_at: string | null;
  created_at: string;
}

export function listCustomerUsers(customerId: string): CustomerUserRow[] {
  return getDatabase()
    .prepare(
      `SELECT id, customer_id, username, role, status, last_login_at,
              invite_expires_at, invited_at, accepted_at, disabled_at, created_at
       FROM customer_users
       WHERE customer_id = ? AND status != 'deleted'
       ORDER BY username`
    )
    .all(customerId) as CustomerUserRow[];
}

export function canInviteUsers(role: string): boolean {
  const r = role === "super_admin" ? "owner" : role;
  return r === "owner" || r === "admin";
}

export function inviteCustomerUser(input: {
  customerCode: string;
  username: string;
  role: CustomerRole;
  invitedByUserId: string;
  invitedByLabel: string;
  ip?: string;
}):
  | {
      userId: string;
      inviteToken: string;
      expiresAt: string;
      acceptUrl: string;
      emailPreview: string;
      emailSent: false;
    }
  | { error: string } {
  const customer = getCustomerByCode(input.customerCode);
  if (!customer) return { error: "Customer not found" };

  const existing = getDatabase()
    .prepare(
      `SELECT id FROM customer_users WHERE customer_id = ? AND username = ? AND status != 'deleted'`
    )
    .get(customer.customer_id, input.username) as { id: string } | undefined;
  if (existing) return { error: "Username already exists" };

  const userId = uuid();
  const inviteToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600_000).toISOString();
  const placeholderHash = hashPassword(randomBytes(16).toString("hex"));

  getDatabase()
    .prepare(
      `INSERT INTO customer_users (
        id, customer_id, username, password_hash, role, status,
        invite_token, invite_expires_at, invited_by, invited_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'invited', ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))`
    )
    .run(
      userId,
      customer.customer_id,
      input.username,
      placeholderHash,
      input.role,
      inviteToken,
      expiresAt,
      input.invitedByUserId
    );

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

export function reinviteCustomerUser(input: {
  customerId: string;
  userId: string;
  invitedByUserId: string;
  invitedByLabel: string;
  ip?: string;
}): { inviteToken: string; expiresAt: string } | { error: string } {
  const row = getDatabase()
    .prepare(`SELECT username, role, status, customer_id FROM customer_users WHERE id = ?`)
    .get(input.userId) as
    | { username: string; role: CustomerRole; status: string; customer_id: string }
    | undefined;
  if (!row || row.customer_id !== input.customerId) return { error: "User not found" };
  if (!["invited", "suspended"].includes(row.status)) {
    return { error: "User must be invited or suspended to reinvite" };
  }
  const customer = getDatabase()
    .prepare(`SELECT customer_code, customer_name FROM customers WHERE customer_id = ?`)
    .get(input.customerId) as { customer_code: string; customer_name: string };
  const inviteToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600_000).toISOString();
  getDatabase()
    .prepare(
      `UPDATE customer_users SET status = 'invited', invite_token = ?, invite_expires_at = ?,
       invited_by = ?, invited_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`
    )
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

export function acceptCustomerInvite(input: {
  customerCode: string;
  inviteToken: string;
  password: string;
  ip?: string;
}): { userId: string; username: string } | { error: string } {
  const customer = getCustomerByCode(input.customerCode);
  if (!customer) return { error: "Customer not found" };

  const row = getDatabase()
    .prepare(
      `SELECT id, username, invite_expires_at, status
       FROM customer_users
       WHERE customer_id = ? AND invite_token = ?`
    )
    .get(customer.customer_id, input.inviteToken) as
    | { id: string; username: string; invite_expires_at: string; status: string }
    | undefined;

  if (!row) return { error: "Invalid invite token" };
  if (row.status !== "invited") return { error: "Invite not pending" };
  if (row.invite_expires_at && new Date(row.invite_expires_at).getTime() < Date.now()) {
    return { error: "Invite expired" };
  }

  const passwordHash = hashPassword(input.password);
  getDatabase()
    .prepare(
      `UPDATE customer_users SET
        password_hash = ?, status = 'active',
        invite_token = NULL, invite_expires_at = NULL,
        accepted_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`
    )
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

export function disableCustomerUser(input: {
  customerId: string;
  userId: string;
  actorUserId: string;
  actorLabel: string;
  ip?: string;
}): boolean {
  const r = getDatabase()
    .prepare(
      `UPDATE customer_users SET status = 'suspended', disabled_at = datetime('now'),
       updated_at = datetime('now')
       WHERE id = ? AND customer_id = ? AND status IN ('active', 'invited')`
    )
    .run(input.userId, input.customerId);
  if (r.changes === 0) return false;

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

export function updateCustomerUserRole(input: {
  customerId: string;
  userId: string;
  role: CustomerRole;
  actorUserId: string;
  actorLabel: string;
  ip?: string;
}): boolean {
  const r = getDatabase()
    .prepare(
      `UPDATE customer_users SET role = ?, updated_at = datetime('now')
       WHERE id = ? AND customer_id = ? AND status != 'deleted'`
    )
    .run(input.role, input.userId, input.customerId);
  if (r.changes === 0) return false;

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
