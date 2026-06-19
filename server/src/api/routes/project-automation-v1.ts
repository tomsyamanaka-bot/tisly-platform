import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import {
  createPhotoTemplateItemV1,
  createProjectTemplateV1,
  createSpecPhotoTemplateItemV1,
  createTaskTemplateItemV1,
  createToolTemplateItemV1,
  deletePhotoTemplateItemV1,
  deleteProjectTemplateV1,
  deleteSpecPhotoTemplateItemV1,
  deleteTaskTemplateItemV1,
  deleteToolTemplateItemV1,
  listTemplateCategoriesV1,
  patchPhotoTemplateItemV1,
  patchProjectTemplateV1,
  patchSpecPhotoTemplateItemV1,
  patchTaskTemplateItemV1,
  patchToolTemplateItemV1,
  reorderPhotoTemplateItemsV1,
  reorderProjectTemplatesV1,
  reorderSpecPhotoTemplateItemsV1,
  reorderTaskTemplateItemsV1,
  reorderToolTemplateItemsV1,
} from "../../projects/project-automation-admin-v1-store.js";
import {
  addProjectTaskV1,
  addProjectToolV1,
  applyProjectTemplateV1,
  deleteProjectTaskV1,
  deleteProjectToolV1,
  getProjectAutomationBundleV1,
  getProjectTemplateV1,
  linkProjectPhotoSlotV1,
  listProjectTemplatesV1,
  listUnshotProjectPhotosV1,
  patchProjectTaskV1,
  patchProjectToolV1,
  reorderProjectTasksV1,
  reorderProjectToolsV1,
} from "../../projects/project-automation-v1-store.js";
import {
  dismissAiSuggestionV1,
  getCompletionReportPhotosV1,
  getSpecificationPhotosV1,
  listAiSuggestionsV1,
  refreshAiSuggestionsV1,
} from "../../projects/project-automation-suggestions-v1.js";
import {
  linkSpecProjectPhotoSlotV1,
  listUnshotSpecProjectPhotosV1,
  reorderSpecProjectPhotosV1,
} from "../../projects/spec-photo-slots-v1-store.js";

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

function assertAdmin(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (role !== "super_admin" && role !== "admin") {
    res.status(403).json({ error: "Admin role required" });
    return false;
  }
  return true;
}

projectAutomationV1Router.get("/templates", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const activeOnly = req.query.activeOnly !== "false";
  const q = String(req.query.q ?? "").trim() || undefined;
  const category = String(req.query.category ?? "").trim() || undefined;
  const sort = req.query.sort === "popular" ? "popular" : "order";
  res.json({
    templates: listProjectTemplatesV1(activeOnly, { q, category, sort }),
    categories: listTemplateCategoriesV1(),
  });
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
  const projectId = String(req.params.projectId);
  const bundle = getProjectAutomationBundleV1(projectId);
  const suggestions = refreshAiSuggestionsV1(projectId, {
    tasks: bundle.tasks,
    tools: bundle.tools,
    photos: bundle.photos,
  });
  res.json({ ...bundle, suggestions });
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
    const body = req.body ?? {};
    const updated = patchProjectTaskV1(String(req.params.projectId), String(req.params.taskId), {
      done: body.done !== undefined ? Boolean(body.done) : undefined,
      memo: body.memo !== undefined ? (body.memo != null ? String(body.memo) : null) : undefined,
      label: body.label !== undefined ? String(body.label) : undefined,
      sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : undefined,
    });
    if (!updated) {
      res.status(404).json({ error: "task not found" });
      return;
    }
    res.json(updated);
  }
);

projectAutomationV1Router.post("/projects/:projectId/tasks", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const label = String(req.body?.label ?? "").trim();
  if (!label) {
    res.status(400).json({ error: "label is required" });
    return;
  }
  res.status(201).json(addProjectTaskV1(String(req.params.projectId), label));
});

projectAutomationV1Router.delete(
  "/projects/:projectId/tasks/:taskId",
  ...auth,
  (req: AuthedRequest, res) => {
    if (!assertRole(req, res)) return;
    const ok = deleteProjectTaskV1(String(req.params.projectId), String(req.params.taskId));
    if (!ok) {
      res.status(404).json({ error: "task not found" });
      return;
    }
    res.status(204).send();
  }
);

projectAutomationV1Router.put(
  "/projects/:projectId/tasks/reorder",
  ...auth,
  (req: AuthedRequest, res) => {
    if (!assertRole(req, res)) return;
    const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds.map(String) : [];
    reorderProjectTasksV1(String(req.params.projectId), orderedIds);
    res.json({ ok: true });
  }
);

projectAutomationV1Router.patch(
  "/projects/:projectId/tools/:toolId",
  ...auth,
  (req: AuthedRequest, res) => {
    if (!assertRole(req, res)) return;
    const body = req.body ?? {};
    const updated = patchProjectToolV1(String(req.params.projectId), String(req.params.toolId), {
      checked: body.checked !== undefined ? Boolean(body.checked) : undefined,
      memo: body.memo !== undefined ? (body.memo != null ? String(body.memo) : null) : undefined,
      forgottenMemo:
        body.forgottenMemo !== undefined
          ? body.forgottenMemo != null
            ? String(body.forgottenMemo)
            : null
          : undefined,
      label: body.label !== undefined ? String(body.label) : undefined,
      sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : undefined,
    });
    if (!updated) {
      res.status(404).json({ error: "tool not found" });
      return;
    }
    res.json(updated);
  }
);

projectAutomationV1Router.post("/projects/:projectId/tools", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const label = String(req.body?.label ?? "").trim();
  if (!label) {
    res.status(400).json({ error: "label is required" });
    return;
  }
  res.status(201).json(addProjectToolV1(String(req.params.projectId), label));
});

projectAutomationV1Router.delete(
  "/projects/:projectId/tools/:toolId",
  ...auth,
  (req: AuthedRequest, res) => {
    if (!assertRole(req, res)) return;
    const ok = deleteProjectToolV1(String(req.params.projectId), String(req.params.toolId));
    if (!ok) {
      res.status(404).json({ error: "tool not found" });
      return;
    }
    res.status(204).send();
  }
);

projectAutomationV1Router.put(
  "/projects/:projectId/tools/reorder",
  ...auth,
  (req: AuthedRequest, res) => {
    if (!assertRole(req, res)) return;
    const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds.map(String) : [];
    reorderProjectToolsV1(String(req.params.projectId), orderedIds);
    res.json({ ok: true });
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
      caption: body.caption !== undefined ? (body.caption != null ? String(body.caption) : null) : undefined,
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

projectAutomationV1Router.get(
  "/projects/:projectId/completion-report-photos",
  ...auth,
  (req: AuthedRequest, res) => {
    if (!assertRole(req, res)) return;
    res.json({ photos: getCompletionReportPhotosV1(String(req.params.projectId)) });
  }
);

projectAutomationV1Router.get(
  "/projects/:projectId/specification-photos",
  ...auth,
  (req: AuthedRequest, res) => {
    if (!assertRole(req, res)) return;
    res.json({ photos: getSpecificationPhotosV1(String(req.params.projectId)) });
  }
);

projectAutomationV1Router.get(
  "/projects/:projectId/unshot-spec-photos",
  ...auth,
  (req: AuthedRequest, res) => {
    if (!assertRole(req, res)) return;
    res.json({ photos: listUnshotSpecProjectPhotosV1(String(req.params.projectId)) });
  }
);

projectAutomationV1Router.patch(
  "/projects/:projectId/spec-photos/:photoId/link",
  ...auth,
  (req: AuthedRequest, res) => {
    if (!assertRole(req, res)) return;
    const body = req.body ?? {};
    const updated = linkSpecProjectPhotoSlotV1(
      String(req.params.projectId),
      String(req.params.photoId),
      {
        documentId: body.documentId != null ? String(body.documentId) : undefined,
        photoPath: body.photoPath != null ? String(body.photoPath) : undefined,
        caption: body.caption !== undefined ? (body.caption != null ? String(body.caption) : null) : undefined,
      }
    );
    if (!updated) {
      res.status(404).json({ error: "spec photo slot not found" });
      return;
    }
    res.json(updated);
  }
);

projectAutomationV1Router.put(
  "/projects/:projectId/spec-photos/reorder",
  ...auth,
  (req: AuthedRequest, res) => {
    if (!assertRole(req, res)) return;
    const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds.map(String) : [];
    reorderSpecProjectPhotosV1(String(req.params.projectId), orderedIds);
    res.json({ ok: true });
  }
);

projectAutomationV1Router.get(
  "/projects/:projectId/suggestions",
  ...auth,
  (req: AuthedRequest, res) => {
    if (!assertRole(req, res)) return;
    res.json({ suggestions: listAiSuggestionsV1(String(req.params.projectId)) });
  }
);

projectAutomationV1Router.patch(
  "/projects/:projectId/suggestions/:suggestionId/dismiss",
  ...auth,
  (req: AuthedRequest, res) => {
    if (!assertRole(req, res)) return;
    const ok = dismissAiSuggestionV1(
      String(req.params.projectId),
      String(req.params.suggestionId)
    );
    if (!ok) {
      res.status(404).json({ error: "suggestion not found" });
      return;
    }
    res.json({ ok: true });
  }
);

/* ---- Admin: テンプレート管理 v1.5 ---- */

projectAutomationV1Router.get("/admin/templates", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const q = String(req.query.q ?? "").trim() || undefined;
  const category = String(req.query.category ?? "").trim() || undefined;
  const sort = req.query.sort === "popular" ? "popular" : "order";
  res.json({
    templates: listProjectTemplatesV1(false, { q, category, sort }),
    categories: listTemplateCategoriesV1(),
  });
});

projectAutomationV1Router.post("/admin/templates", ...auth, (req: AuthedRequest, res) => {
  if (!assertAdmin(req, res)) return;
  const name = String(req.body?.name ?? "").trim();
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  try {
    const tpl = createProjectTemplateV1({
      name,
      category: req.body?.category != null ? String(req.body.category) : "",
      subCategory: req.body?.subCategory != null ? String(req.body.subCategory) : "",
      description: req.body?.description != null ? String(req.body.description) : null,
      active: req.body?.active !== false,
      sortOrder: req.body?.sortOrder != null ? Number(req.body.sortOrder) : undefined,
    });
    res.status(201).json(tpl);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "create failed" });
  }
});

projectAutomationV1Router.patch("/admin/templates/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertAdmin(req, res)) return;
  const updated = patchProjectTemplateV1(String(req.params.id), {
    name: req.body?.name != null ? String(req.body.name) : undefined,
    category: req.body?.category != null ? String(req.body.category) : undefined,
    subCategory: req.body?.subCategory != null ? String(req.body.subCategory) : undefined,
    description:
      req.body?.description !== undefined
        ? req.body.description != null
          ? String(req.body.description)
          : null
        : undefined,
    active: req.body?.active !== undefined ? Boolean(req.body.active) : undefined,
    sortOrder: req.body?.sortOrder != null ? Number(req.body.sortOrder) : undefined,
  });
  if (!updated) {
    res.status(404).json({ error: "template not found" });
    return;
  }
  res.json(updated);
});

projectAutomationV1Router.delete("/admin/templates/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertAdmin(req, res)) return;
  const ok = deleteProjectTemplateV1(String(req.params.id));
  if (!ok) {
    res.status(404).json({ error: "template not found" });
    return;
  }
  res.status(204).send();
});

projectAutomationV1Router.put("/admin/templates/reorder", ...auth, (req: AuthedRequest, res) => {
  if (!assertAdmin(req, res)) return;
  const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds.map(String) : [];
  reorderProjectTemplatesV1(orderedIds);
  res.json({ ok: true });
});

function adminItemRoutes(
  kind: "tasks" | "tools" | "photos" | "spec-photos",
  createFn: (tplId: string, input: { label: string }) => unknown,
  patchFn: (tplId: string, itemId: string, input: { label?: string; sortOrder?: number }) => unknown,
  deleteFn: (tplId: string, itemId: string) => boolean,
  reorderFn: (tplId: string, ids: string[]) => void
) {
  projectAutomationV1Router.post(`/admin/templates/:id/${kind}`, ...auth, (req: AuthedRequest, res) => {
    if (!assertAdmin(req, res)) return;
    const label = String(req.body?.label ?? "").trim();
    if (!label) {
      res.status(400).json({ error: "label is required" });
      return;
    }
    try {
      res.status(201).json(createFn(String(req.params.id), { label }));
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "create failed" });
    }
  });

  projectAutomationV1Router.patch(
    `/admin/templates/:id/${kind}/:itemId`,
    ...auth,
    (req: AuthedRequest, res) => {
      if (!assertAdmin(req, res)) return;
      const updated = patchFn(String(req.params.id), String(req.params.itemId), {
        label: req.body?.label != null ? String(req.body.label) : undefined,
        sortOrder: req.body?.sortOrder != null ? Number(req.body.sortOrder) : undefined,
      });
      if (!updated) {
        res.status(404).json({ error: "item not found" });
        return;
      }
      res.json(updated);
    }
  );

  projectAutomationV1Router.delete(
    `/admin/templates/:id/${kind}/:itemId`,
    ...auth,
    (req: AuthedRequest, res) => {
      if (!assertAdmin(req, res)) return;
      const ok = deleteFn(String(req.params.id), String(req.params.itemId));
      if (!ok) {
        res.status(404).json({ error: "item not found" });
        return;
      }
      res.status(204).send();
    }
  );

  projectAutomationV1Router.put(
    `/admin/templates/:id/${kind}/reorder`,
    ...auth,
    (req: AuthedRequest, res) => {
      if (!assertAdmin(req, res)) return;
      const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds.map(String) : [];
      reorderFn(String(req.params.id), orderedIds);
      res.json({ ok: true });
    }
  );
}

adminItemRoutes(
  "tasks",
  createTaskTemplateItemV1,
  patchTaskTemplateItemV1,
  deleteTaskTemplateItemV1,
  reorderTaskTemplateItemsV1
);
adminItemRoutes(
  "tools",
  createToolTemplateItemV1,
  patchToolTemplateItemV1,
  deleteToolTemplateItemV1,
  reorderToolTemplateItemsV1
);
adminItemRoutes(
  "photos",
  createPhotoTemplateItemV1,
  patchPhotoTemplateItemV1,
  deletePhotoTemplateItemV1,
  reorderPhotoTemplateItemsV1
);
adminItemRoutes(
  "spec-photos",
  createSpecPhotoTemplateItemV1,
  patchSpecPhotoTemplateItemV1,
  deleteSpecPhotoTemplateItemV1,
  reorderSpecPhotoTemplateItemsV1
);
