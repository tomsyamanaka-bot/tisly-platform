import type { NextFunction, Request, Response } from "express";
import { isAuthConfigured, resolveSession } from "./admin-auth.js";

export interface AuthedRequest extends Request {
  admin?: {
    userId: string;
    username: string;
    role: string;
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
  req.admin = {
    userId: session.userId,
    username: session.username,
    role: session.role,
  };
  next();
}

export function optionalAdminAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const token = extractBearer(req);
  const session = resolveSession(token);
  if (session) {
    req.admin = {
      userId: session.userId,
      username: session.username,
      role: session.role,
    };
  }
  next();
}
