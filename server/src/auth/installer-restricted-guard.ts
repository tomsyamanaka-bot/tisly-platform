import type { NextFunction, Request, Response } from "express";
import { resolveAnySession } from "./customer-auth.js";
import type { AuthedRequest } from "./auth-middleware.js";
import { normalizeRole } from "./roles.js";

function extractBearer(req: Request): string | undefined {
  const auth = req.header("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  return req.header("x-tisly-admin-token") ?? undefined;
}

/** Paths installer role must not access (billing, user admin, plan, settings). */
const INSTALLER_BLOCKED = [
  /\/users(?:\/|$)/,
  /\/billing(?:\/|$)/,
  /\/plan(?:\/|$)/,
  /\/subscription(?:\/|$)/,
  /\/settings(?:\/|$)/,
  /\/admin(?:\/|$)/,
  /\/users\/invite/,
  /\/notification-rules(?:\/|$)/,
  /\/webhooks(?:\/|$)/,
];

export function rejectInstallerRestricted(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): void {
  const sub = req.path;
  if (!INSTALLER_BLOCKED.some((re) => re.test(sub))) {
    next();
    return;
  }
  const token = extractBearer(req);
  const session = resolveAnySession(token);
  if (!session) {
    next();
    return;
  }
  const role = normalizeRole(session.role);
  if (role !== "installer") {
    next();
    return;
  }
  res.status(403).json({
    error: "Installer role cannot access this resource",
    hint: "billing, customer admin, plan change, and settings are restricted to manager+",
  });
}
