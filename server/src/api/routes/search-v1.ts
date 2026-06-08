import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import { practicalSearchV1 } from "../../search/practical-search-v1.js";

export const searchV1Router = Router();

const auth = [requireAuth("surveyor")] as const;

function assertRole(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (!roleMeetsRequirement(role, "surveyor") && role !== "super_admin") {
    res.status(403).json({ error: "Surveyor or admin role required" });
    return false;
  }
  return true;
}

searchV1Router.get("/", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const q = String(req.query.q ?? "");
  res.json({ query: q, hits: practicalSearchV1(q) });
});
