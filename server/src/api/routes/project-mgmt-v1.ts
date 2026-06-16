import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import {
  createProjectMgmtV1,
  getProjectMgmtDetailV1,
  listProjectCityCodesV1,
  listProjectMgmtV1,
  softDeleteProjectMgmtV1,
  updateProjectMgmtV1,
} from "../../projects/project-mgmt-v1-store.js";
import { isValidMgmtStatus } from "../../projects/project-mgmt-status-v1.js";

export const projectMgmtV1Router = Router();

const auth = [requireAuth("surveyor")] as const;

function assertRole(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (!roleMeetsRequirement(role, "surveyor") && role !== "super_admin") {
    res.status(403).json({ error: "Surveyor or admin role required" });
    return false;
  }
  return true;
}

projectMgmtV1Router.get("/city-codes", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json({ cityCodes: listProjectCityCodesV1() });
});

projectMgmtV1Router.get("/projects", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const q = (req.query.q as string) ?? "";
  const statusRaw = (req.query.status as string) ?? "";
  const status = isValidMgmtStatus(statusRaw) ? statusRaw : undefined;
  res.json({ projects: listProjectMgmtV1({ q, status }) });
});

projectMgmtV1Router.post("/projects", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body ?? {};
  if (!body.title?.trim() || !body.customerName?.trim()) {
    res.status(400).json({ error: "title and customerName are required" });
    return;
  }
  if (body.mgmtStatus && !isValidMgmtStatus(String(body.mgmtStatus))) {
    res.status(400).json({ error: "invalid mgmtStatus" });
    return;
  }
  try {
    const project = createProjectMgmtV1({
      title: String(body.title),
      customerName: String(body.customerName),
      phone: body.phone != null ? String(body.phone) : undefined,
      address: body.address != null ? String(body.address) : undefined,
      municipality: body.municipality != null ? String(body.municipality) : undefined,
      assignee: body.assignee != null ? String(body.assignee) : undefined,
      cityCode: body.cityCode != null ? String(body.cityCode) : undefined,
      customerId: body.customerId != null ? String(body.customerId) : undefined,
      surveyProjectId: body.surveyProjectId != null ? String(body.surveyProjectId) : undefined,
      mgmtStatus: body.mgmtStatus && isValidMgmtStatus(String(body.mgmtStatus))
        ? body.mgmtStatus
        : undefined,
    });
    res.status(201).json({ project, detail: getProjectMgmtDetailV1(project.id) });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "create failed" });
  }
});

projectMgmtV1Router.get("/projects/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const detail = getProjectMgmtDetailV1(String(req.params.id));
  if (!detail) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json(detail);
});

projectMgmtV1Router.patch("/projects/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body ?? {};
  if (body.mgmtStatus && !isValidMgmtStatus(String(body.mgmtStatus))) {
    res.status(400).json({ error: "invalid mgmtStatus" });
    return;
  }
  const updated = updateProjectMgmtV1(String(req.params.id), {
    title: body.title != null ? String(body.title) : undefined,
    customerName: body.customerName != null ? String(body.customerName) : undefined,
    phone: body.phone != null ? String(body.phone) : undefined,
    address: body.address != null ? String(body.address) : undefined,
    municipality: body.municipality != null ? String(body.municipality) : undefined,
    assignee: body.assignee != null ? String(body.assignee) : undefined,
    mgmtStatus:
      body.mgmtStatus && isValidMgmtStatus(String(body.mgmtStatus)) ? body.mgmtStatus : undefined,
  });
  if (!updated) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json({ project: updated, detail: getProjectMgmtDetailV1(updated.id) });
});

projectMgmtV1Router.delete("/projects/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const ok = softDeleteProjectMgmtV1(String(req.params.id));
  if (!ok) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json({ ok: true });
});
