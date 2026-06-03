import type { NextFunction, Response } from "express";
import { getCustomerByCode, getCustomerById } from "../customer/customer-store.js";
import { canAccessCustomer } from "./customer-auth.js";
import type { AuthedRequest } from "./auth-middleware.js";

/**
 * Ensures authenticated users cannot access another customer's data via URL params.
 */
export function requireTenantMatch(paramKey = "customerCode") {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.admin) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const code = (req.params[paramKey] ?? req.query.customerCode) as string | undefined;
    if (!code) {
      if (req.admin.scope === "customer" && req.admin.customerId) {
        next();
        return;
      }
      res.status(400).json({ error: "customerCode required" });
      return;
    }
    const customer = getCustomerByCode(String(code));
    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }
    if (!canAccessCustomer(req.admin, customer.customer_id)) {
      res.status(403).json({ error: "Tenant isolation: access denied" });
      return;
    }
    (req as AuthedRequest & { tenantCustomerId?: string }).tenantCustomerId =
      customer.customer_id;
    (req as AuthedRequest & { tenantId?: string }).tenantId =
      customer.tenant_id ?? customer.customer_id;
    next();
  };
}

/**
 * Validates tenant_id / customer_id in query/body against the session customer.
 */
export function assertTenantScope(
  session: { scope?: string; customerId?: string; role: string },
  tenantOrCustomerId: string | undefined
): boolean {
  if (!tenantOrCustomerId) return true;
  if (session.scope !== "customer") {
    return session.role === "super_admin" || session.role === "admin";
  }
  const customer = getCustomerById(session.customerId!);
  if (!customer) return false;
  const allowed = new Set([customer.customer_id, customer.tenant_id ?? customer.customer_id]);
  return allowed.has(tenantOrCustomerId);
}

export function tenantQueryGuard(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.admin) {
    next();
    return;
  }
  if (req.admin.scope !== "customer") {
    next();
    return;
  }
  const qTenant = (req.query.tenant_id ?? req.query.tenantId) as string | undefined;
  const qCustomer = (req.query.customer_id ?? req.query.customerId) as string | undefined;
  const target = qTenant ?? qCustomer;
  if (target && !assertTenantScope(req.admin, target)) {
    res.status(403).json({ error: "Tenant isolation: query scope denied" });
    return;
  }
  next();
}
