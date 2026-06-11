import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import { buildFieldOpsDashboardV1Async } from "../../projects/field-ops-dashboard.js";
import { getProjectDetailV1, listProjectsV1 } from "../../projects/projects-v1-store.js";

export const projectsV1Router = Router();

const auth = [requireAuth("surveyor")] as const;

function assertRole(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (!roleMeetsRequirement(role, "surveyor") && role !== "super_admin") {
    res.status(403).json({ error: "Surveyor or admin role required" });
    return false;
  }
  return true;
}

projectsV1Router.get("/dashboard", ...auth, async (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  try {
    res.json(await buildFieldOpsDashboardV1Async());
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "dashboard failed" });
  }
});

projectsV1Router.get("/projects", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const customerCode = (req.query.customerCode as string) ?? req.admin?.customerCode;
  res.json({ projects: listProjectsV1({ customerCode }) });
});

projectsV1Router.get("/projects/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const detail = getProjectDetailV1(String(req.params.id), req.query.source as string | undefined);
  if (!detail) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json(detail);
});
