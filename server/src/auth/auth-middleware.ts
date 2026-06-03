import type { NextFunction, Request, Response } from "express";
import { isAuthConfigured, resolveSession } from "./admin-auth.js";
import { getCustomerByCode } from "../customer/customer-store.js";
import { canAccessCustomer, resolveAnySession } from "./customer-auth.js";
import { isSessionRevoked } from "./session-store.js";
import { roleMeetsRequirement, type AppRole } from "./roles.js";

export interface AuthedRequest extends Request {
  admin?: {
    userId: string;
    username: string;
    role: string;
    tokenId?: string;
    customerId?: string;
    customerCode?: string;
    scope?: "platform" | "customer";
  };
}

function extractBearer(req: Request): string | undefined {
  const auth = req.header("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  return req.header("x-tisly-admin-token") ?? undefined;
}

export function requireAdminAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!isAuthConfigured()) {
    res.status(503).json({
      error: "Admin authentication not configured",
      hint: "Set JWT_SECRET and ADMIN_PASSWORD_HASH in .env",
    });
    return;
  }
  const token = extractBearer(req);
  const session = resolveSession(token);
  if (!session) {
    res.status(401).json({ error: "Unauthorized — admin token required" });
    return;
  }
  if (session.tokenId && isSessionRevoked(session.tokenId)) {
    res.status(401).json({ error: "Session revoked or expired" });
    return;
  }
  req.admin = {
    userId: session.userId,
    username: session.username,
    role: session.role,
    tokenId: session.tokenId,
    scope: "platform",
  };
  next();
}

export function requireAuth(minRole: AppRole = "viewer") {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!isAuthConfigured()) {
      res.status(503).json({ error: "Authentication not configured" });
      return;
    }
    const token = extractBearer(req);
    const session = resolveAnySession(token);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if ("tokenId" in session && session.tokenId && isSessionRevoked(session.tokenId)) {
      res.status(401).json({ error: "Session revoked" });
      return;
    }
    const effectiveRole =
      session.role === "admin" && (!("scope" in session) || session.scope === "platform")
        ? "super_admin"
        : session.role;
    if (!roleMeetsRequirement(effectiveRole, minRole)) {
      res.status(403).json({ error: "Insufficient role", required: minRole });
      return;
    }
    req.admin = {
      userId: session.userId,
      username: session.username,
      role: session.role,
      tokenId: "tokenId" in session ? session.tokenId : undefined,
      customerId: "customerId" in session ? session.customerId : undefined,
      customerCode: "customerCode" in session ? session.customerCode : undefined,
      scope: "scope" in session ? session.scope : "platform",
    };
    next();
  };
}

export function requireCustomerAccess(paramKey = "customerCode") {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const code = (req.params[paramKey] ?? req.query.customerCode) as string | undefined;
    if (!req.admin) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!code && req.admin.customerId) {
      next();
      return;
    }
    if (!code) {
      res.status(400).json({ error: "customerCode required" });
      return;
    }
    const customer = getCustomerByCode(code);
    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }
    if (!canAccessCustomer(req.admin, customer.customer_id)) {
      res.status(403).json({ error: "Customer access denied" });
      return;
    }
    next();
  };
}

export function optionalAdminAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const token = extractBearer(req);
  const session = resolveAnySession(token) ?? resolveSession(token);
  if (session) {
    const cust = session as { customerId?: string; customerCode?: string; scope?: "platform" | "customer" };
    req.admin = {
      userId: session.userId,
      username: session.username,
      role: session.role,
      customerId: cust.customerId,
      customerCode: cust.customerCode,
      scope: cust.scope ?? "platform",
    };
  }
  next();
}
