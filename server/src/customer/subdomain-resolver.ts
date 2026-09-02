import type { NextFunction, Request, Response } from "express";
import { getCustomerByCode } from "./customer-store.js";

const DEMO_SUBDOMAINS: Record<string, string> = {
  toms001: "TOMS001",
  toyoshima001: "TOYOSHIMA001",
};

export function resolveCustomerCodeFromHost(host: string): string | null {
  const h = host.split(":")[0].toLowerCase();
  const parts = h.split(".");
  if (parts.length < 3) return null;
  const sub = parts[0];
  if (sub === "www" || sub === "api" || sub === "portal") return null;
  return DEMO_SUBDOMAINS[sub] ?? null;
}

export function resolveCustomerCodeFromRequest(req: Request): string | null {
  const header =
    req.header("x-tisly-customer-code") ??
    req.header("X-TiSLY-Customer-Code");
  if (header) return header.trim().toUpperCase();

  const query = req.query.customerCode ?? req.query.customer;
  if (typeof query === "string" && query.trim()) {
    return query.trim().toUpperCase();
  }

  const host = req.header("host") ?? req.hostname;
  if (host) {
    const fromHost = resolveCustomerCodeFromHost(host);
    if (fromHost) return fromHost;
  }

  return null;
}

export function attachCustomerFromSubdomain(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const code = resolveCustomerCodeFromRequest(req);
  if (code) {
    const customer = getCustomerByCode(code);
    if (customer) {
      (req as Request & { resolvedCustomerCode?: string; resolvedCustomerId?: string }).resolvedCustomerCode =
        customer.customer_code;
      (req as Request & { resolvedCustomerId?: string }).resolvedCustomerId = customer.customer_id;
    }
  }
  next();
}
