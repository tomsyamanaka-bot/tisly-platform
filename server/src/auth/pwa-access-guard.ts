import type { NextFunction, Response } from "express";
import type { AuthedRequest } from "./auth-middleware.js";
import { canAccessPwa, type PwaAppId } from "../pwa/pwa-hub.js";

export function requirePwaAccess(pwaId: PwaAppId) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const role = req.admin?.role ?? "viewer";
    if (!canAccessPwa(role, pwaId)) {
      res.status(403).json({
        error: "PWA access denied for this role",
        pwa: pwaId,
        role,
      });
      return;
    }
    next();
  };
}
