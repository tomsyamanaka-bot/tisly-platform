import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import { MATERIAL_CATEGORIES } from "../../field-ops/field-ops-types.js";
import {
  createMaterialV1,
  getMaterialV1,
  listMaterialsV1,
  updateMaterialV1,
} from "../../field-ops/materials-v1-store.js";
import {
  getWorkTemplateV1,
  listWorkTemplatesV1,
} from "../../field-ops/work-templates-store.js";
import { applyWorkTemplatesToProject } from "../../field-ops/project-materials-service.js";
import type { ProjectRefV1 } from "../../field-ops/field-ops-types.js";

export const materialsV1Router = Router();

const auth = [requireAuth("surveyor")] as const;

function assertRole(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (!roleMeetsRequirement(role, "surveyor") && role !== "super_admin") {
    res.status(403).json({ error: "Surveyor or admin role required" });
    return false;
  }
  return true;
}

function parseProjectRef(body: Record<string, unknown>): ProjectRefV1 | null {
  const source = body.projectSource ?? body.source;
  const projectId = body.projectId;
  if (source !== "survey" && source !== "business") return null;
  if (!projectId || typeof projectId !== "string") return null;
  return { source, projectId };
}

materialsV1Router.get("/categories", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json({ categories: MATERIAL_CATEGORIES });
});

materialsV1Router.get("/materials", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const category = req.query.category as string | undefined;
  const q = req.query.q as string | undefined;
  const activeOnly = req.query.activeOnly !== "false";
  res.json({ materials: listMaterialsV1({ category, q, activeOnly }) });
});

materialsV1Router.get("/materials/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const mat = getMaterialV1(String(req.params.id));
  if (!mat) {
    res.status(404).json({ error: "material not found" });
    return;
  }
  res.json(mat);
});

materialsV1Router.post("/materials", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  if (!body.category || !body.name) {
    res.status(400).json({ error: "category and name are required" });
    return;
  }
  const mat = createMaterialV1({
    category: String(body.category),
    name: String(body.name),
    maker: body.maker != null ? String(body.maker) : null,
    model: body.model != null ? String(body.model) : null,
    unit: body.unit != null ? String(body.unit) : undefined,
    cost: body.cost != null ? Number(body.cost) : undefined,
    stockQty: body.stockQty != null ? Number(body.stockQty) : undefined,
    minStock: body.minStock != null ? Number(body.minStock) : undefined,
    supplier: body.supplier != null ? String(body.supplier) : null,
    memo: body.memo != null ? String(body.memo) : null,
    active: body.active !== false,
  });
  res.status(201).json(mat);
});

materialsV1Router.patch("/materials/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const mat = updateMaterialV1(String(req.params.id), {
    category: body.category != null ? String(body.category) : undefined,
    name: body.name != null ? String(body.name) : undefined,
    maker: body.maker !== undefined ? (body.maker != null ? String(body.maker) : null) : undefined,
    model: body.model !== undefined ? (body.model != null ? String(body.model) : null) : undefined,
    unit: body.unit != null ? String(body.unit) : undefined,
    cost: body.cost != null ? Number(body.cost) : undefined,
    stockQty: body.stockQty != null ? Number(body.stockQty) : undefined,
    minStock: body.minStock != null ? Number(body.minStock) : undefined,
    supplier: body.supplier !== undefined ? (body.supplier != null ? String(body.supplier) : null) : undefined,
    memo: body.memo !== undefined ? (body.memo != null ? String(body.memo) : null) : undefined,
    active: body.active !== undefined ? Boolean(body.active) : undefined,
  });
  if (!mat) {
    res.status(404).json({ error: "material not found" });
    return;
  }
  res.json(mat);
});

materialsV1Router.get("/work-templates", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const activeOnly = req.query.activeOnly !== "false";
  res.json({ templates: listWorkTemplatesV1(activeOnly) });
});

materialsV1Router.get("/work-templates/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const tpl = getWorkTemplateV1(String(req.params.id));
  if (!tpl) {
    res.status(404).json({ error: "work template not found" });
    return;
  }
  res.json(tpl);
});

materialsV1Router.post("/projects/apply-templates", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const ref = parseProjectRef(req.body as Record<string, unknown>);
  if (!ref) {
    res.status(400).json({ error: "projectSource and projectId are required" });
    return;
  }
  const body = req.body as { templateIds?: string[] };
  const templateIds = Array.isArray(body.templateIds) ? body.templateIds.map(String) : [];
  const result = applyWorkTemplatesToProject(ref, templateIds);
  res.json(result);
});
