import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import {
  applyProjectTemplateV1,
  getProjectAutomationBundleV1,
  getProjectTemplateV1,
  linkProjectPhotoSlotV1,
  listProjectTemplatesV1,
  listUnshotProjectPhotosV1,
  patchProjectTaskV1,
  patchProjectToolV1,
} from "../../projects/project-automation-v1-store.js";

export const projectAutomationV1Router = Router();

const auth = [requireAuth("surveyor")] as const;

function assertRole(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (!roleMeetsRequirement(role, "surveyor") && role !== "super_admin") {
    res.status(403).json({ error: "Surveyor or admin role required" });
    return false;
  }
  return true;
}

projectAutomationV1Router.get("/templates", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const activeOnly = req.query.activeOnly !== "false";
  res.json({ templates: listProjectTemplatesV1(activeOnly) });
});

projectAutomationV1Router.get("/templates/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const tpl = getProjectTemplateV1(String(req.params.id));
  if (!tpl) {
    res.status(404).json({ error: "template not found" });
    return;
  }
  res.json(tpl);
});

projectAutomationV1Router.get("/projects/:projectId", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json(getProjectAutomationBundleV1(String(req.params.projectId)));
});

projectAutomationV1Router.post("/projects/:projectId/apply", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const templateId = String(req.body?.templateId ?? "").trim();
  if (!templateId) {
    res.status(400).json({ error: "templateId is required" });
    return;
  }
  try {
    const bundle = applyProjectTemplateV1(String(req.params.projectId), templateId);
    res.json(bundle);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "apply failed";
    if (msg === "template not found") {
      res.status(404).json({ error: msg });
      return;
    }
    res.status(400).json({ error: msg });
  }
});

projectAutomationV1Router.patch(
  "/projects/:projectId/tasks/:taskId",
  ...auth,
  (req: AuthedRequest, res) => {
    if (!assertRole(req, res)) return;
    const done = Boolean(req.body?.done);
    const updated = patchProjectTaskV1(String(req.params.projectId), String(req.params.taskId), done);
    if (!updated) {
      res.status(404).json({ error: "task not found" });
      return;
    }
    res.json(updated);
  }
);

projectAutomationV1Router.patch(
  "/projects/:projectId/tools/:toolId",
  ...auth,
  (req: AuthedRequest, res) => {
    if (!assertRole(req, res)) return;
    const checked = Boolean(req.body?.checked);
    const updated = patchProjectToolV1(
      String(req.params.projectId),
      String(req.params.toolId),
      checked
    );
    if (!updated) {
      res.status(404).json({ error: "tool not found" });
      return;
    }
    res.json(updated);
  }
);

projectAutomationV1Router.patch(
  "/projects/:projectId/photos/:photoId/link",
  ...auth,
  (req: AuthedRequest, res) => {
    if (!assertRole(req, res)) return;
    const body = req.body ?? {};
    const updated = linkProjectPhotoSlotV1(String(req.params.projectId), String(req.params.photoId), {
      documentId: body.documentId != null ? String(body.documentId) : undefined,
      photoPath: body.photoPath != null ? String(body.photoPath) : undefined,
    });
    if (!updated) {
      res.status(404).json({ error: "photo slot not found" });
      return;
    }
    res.json(updated);
  }
);

projectAutomationV1Router.get(
  "/projects/:projectId/unshot-photos",
  ...auth,
  (req: AuthedRequest, res) => {
    if (!assertRole(req, res)) return;
    res.json({ photos: listUnshotProjectPhotosV1(String(req.params.projectId)) });
  }
);
