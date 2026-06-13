import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import {
  createFieldChecklistTemplateV1,
  deleteFieldChecklistTemplateV1,
  duplicateFieldChecklistTemplateV1,
  getFieldChecklistMonthlyStatsV1,
  getFieldChecklistTemplateV1,
  listFieldChecklistTemplatesV1,
  updateFieldChecklistTemplateV1,
} from "../../field-ops/field-checklist-templates-store.js";

export const fieldChecklistV1Router = Router();

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
  if (!roleMeetsRequirement(role, "admin") && role !== "super_admin") {
    res.status(403).json({ error: "Admin role required" });
    return false;
  }
  return true;
}

fieldChecklistV1Router.get("/templates", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const activeOnly = req.query.activeOnly !== "false";
  res.json({ templates: listFieldChecklistTemplatesV1(activeOnly) });
});

fieldChecklistV1Router.get("/templates/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const tpl = getFieldChecklistTemplateV1(String(req.params.id));
  if (!tpl) {
    res.status(404).json({ error: "template not found" });
    return;
  }
  res.json(tpl);
});

fieldChecklistV1Router.post("/templates", ...auth, (req: AuthedRequest, res) => {
  if (!assertAdmin(req, res)) return;
  const body = req.body as Record<string, unknown>;
  if (!body.name || typeof body.name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const items = Array.isArray(body.items)
    ? (body.items as Array<Record<string, unknown>>).map((it) => ({
        label: String(it.label ?? ""),
        photoRequired: Boolean(it.photoRequired),
      }))
    : [];
  const tpl = createFieldChecklistTemplateV1({
    name: body.name,
    description: body.description != null ? String(body.description) : null,
    active: body.active !== false,
    sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
    items,
  });
  res.status(201).json(tpl);
});

fieldChecklistV1Router.patch("/templates/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertAdmin(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const items = Array.isArray(body.items)
    ? (body.items as Array<Record<string, unknown>>).map((it) => ({
        label: String(it.label ?? ""),
        photoRequired: Boolean(it.photoRequired),
      }))
    : undefined;
  const tpl = updateFieldChecklistTemplateV1(String(req.params.id), {
    name: body.name != null ? String(body.name) : undefined,
    description: body.description !== undefined ? (body.description != null ? String(body.description) : null) : undefined,
    active: body.active !== undefined ? Boolean(body.active) : undefined,
    sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
    items,
  });
  if (!tpl) {
    res.status(404).json({ error: "template not found" });
    return;
  }
  res.json(tpl);
});

fieldChecklistV1Router.delete("/templates/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertAdmin(req, res)) return;
  const ok = deleteFieldChecklistTemplateV1(String(req.params.id));
  if (!ok) {
    res.status(404).json({ error: "template not found" });
    return;
  }
  res.status(204).send();
});

fieldChecklistV1Router.post("/templates/:id/duplicate", ...auth, (req: AuthedRequest, res) => {
  if (!assertAdmin(req, res)) return;
  const tpl = duplicateFieldChecklistTemplateV1(String(req.params.id));
  if (!tpl) {
    res.status(404).json({ error: "template not found" });
    return;
  }
  res.status(201).json(tpl);
});

fieldChecklistV1Router.get("/stats/monthly", ...auth, (req: AuthedRequest, res) => {
  if (!assertAdmin(req, res)) return;
  const month = req.query.month ? String(req.query.month).slice(0, 7) : undefined;
  res.json(getFieldChecklistMonthlyStatsV1(month));
});
