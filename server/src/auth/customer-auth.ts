import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getCustomerByCode, getCustomerById } from "../customer/customer-store.js";
import type { CustomerRole } from "../customer/types.js";
import { verifyPassword } from "./password.js";
import { signToken, verifyToken } from "./jwt.js";
import { createSession } from "./session-store.js";
import { config } from "../config.js";
import { isAuthConfigured, loginAdmin, type AdminSession } from "./admin-auth.js";
import {
  clearCustomerFailedLogins,
  isCustomerUserLocked,
  recordCustomerFailedLogin,
} from "./customer-login-security.js";
import { logAudit } from "../provisioning/audit-log.js";

export interface CustomerSession {
  userId: string;
  username: string;
  role: CustomerRole;
  customerId: string;
  customerCode: string;
  token: string;
  tokenId?: string;
  scope: "customer";
}

export function loginCustomer(
  customerCode: string,
  username: string,
  password: string,
  meta?: { ip?: string; userAgent?: string }
): CustomerSession | null {
  if (!config.auth.jwtSecret) return null;
  const customer = getCustomerByCode(customerCode);
  if (!customer || customer.status !== "active") return null;

  const row = getDatabase()
    .prepare(
      `SELECT id, customer_id, username, password_hash, role, status
       FROM customer_users WHERE customer_id = ? AND username = ? AND status = 'active'`
    )
    .get(customer.customer_id, username) as
    | {
        id: string;
        customer_id: string;
        username: string;
        password_hash: string;
        role: CustomerRole;
        status: string;
      }
    | undefined;

  if (!row) return null;
  if (isCustomerUserLocked(row.id)) return null;
  if (!verifyPassword(password, row.password_hash)) {
    recordCustomerFailedLogin(row.id, customer.customer_id, username, meta);
    return null;
  }

  clearCustomerFailedLogins(row.id);
  logAudit({
    tenantId: customer.customer_id,
    userId: row.id,
    actorLabel: username,
    action: "auth.customer_login",
    targetType: "customer_user",
    targetId: row.id,
    ipAddress: meta?.ip,
    userAgent: meta?.userAgent,
    details: { customerCode: customer.customer_code, role: row.role },
  });

  const { token, jti } = signToken({
    sub: row.id,
    username: row.username,
    role: row.role,
    customerId: customer.customer_id,
    customerCode: customer.customer_code,
    scope: "customer",
  });
  createSession({
    userId: row.id,
    tokenId: jti,
    ipAddress: meta?.ip,
    userAgent: meta?.userAgent,
  });
  return {
    userId: row.id,
    username: row.username,
    role: row.role,
    customerId: customer.customer_id,
    customerCode: customer.customer_code,
    token,
    tokenId: jti,
    scope: "customer",
  };
}

export function loginUnified(
  customerCode: string | undefined,
  username: string,
  password: string,
  meta?: { ip?: string; userAgent?: string; totpCode?: string }
): AdminSession | CustomerSession | null {
  if (customerCode) return loginCustomer(customerCode, username, password, meta);
  return loginAdmin(username, password, meta);
}

export function resolveCustomerSession(token: string | undefined): CustomerSession | null {
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload || payload.scope !== "customer" || !payload.customerId) return null;
  const customer = getCustomerById(payload.customerId);
  if (!customer) return null;
  return {
    userId: payload.sub,
    username: payload.username,
    role: payload.role as CustomerRole,
    customerId: payload.customerId,
    customerCode: payload.customerCode ?? customer.customer_code,
    token,
    tokenId: payload.jti,
    scope: "customer",
  };
}

export function resolveAnySession(
  token: string | undefined
): (AdminSession & { scope?: "platform" }) | CustomerSession | null {
  const customer = resolveCustomerSession(token);
  if (customer) return customer;
  const admin = verifyToken(token ?? "");
  if (!admin) return null;
  if (admin.scope === "customer") return null;
  return {
    userId: admin.sub,
    username: admin.username,
    role: admin.role,
    token: token!,
    tokenId: admin.jti,
    scope: "platform",
  };
}

export function canAccessCustomer(
  session: { role: string; customerId?: string; scope?: string },
  customerId: string
): boolean {
  if (session.scope !== "customer") {
    return isPlatformSuperAdminRole(session.role);
  }
  return session.customerId === customerId;
}

function isPlatformSuperAdminRole(role: string): boolean {
  return role === "super_admin" || role === "admin";
}
