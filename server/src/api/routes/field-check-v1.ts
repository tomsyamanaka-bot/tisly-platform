import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import type { ProjectRefV1 } from "../../field-ops/field-ops-types.js";
import {
  addManualFieldCheckItemV1,
  completeFieldCheckSessionV1,
  createFieldCheckProjectV1,
  deleteFieldCheckItemV1,
  generateFieldCheckItemsV1,
  getFieldCheckProgressV1,
  listFieldCheckItemsV1,
  listFieldCheckProjectsV1,
  listFieldCheckSessionsV1,
  updateFieldCheckItemV1,
} from "../../field-ops/field-check-v1-store.js";

export const fieldCheckV1Router = Router();

const auth = [requireAuth("surveyor")] as const;

function assertRole(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (!roleMeetsRequirement(role, "surveyor") && role !== "super_admin") {
    res.status(403).json({ error: "Surveyor or admin role required" });
    return false;
  }
  return true;
}

function parseRef(query: Record<string, unknown>): ProjectRefV1 | null {
  const source = query.source ?? query.projectSource;
  const projectId = query.projectId;
  if (source !== "survey" && source !== "business") return null;
  if (!projectId || typeof projectId !== "string") return null;
  return { source, projectId };
}

function parseCheckDate(query: Record<string, unknown>): string | undefined {
  const raw = query.date ?? query.checkDate;
  if (raw == null) return undefined;
  const d = String(raw).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined;
}

fieldCheckV1Router.get("/projects", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  res.json({ projects: listFieldCheckProjectsV1() });
});

fieldCheckV1Router.post("/projects", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const title = body.title != null ? String(body.title) : "";
  try {
    const project = createFieldCheckProjectV1({
      title,
      customerName: body.customerName != null ? String(body.customerName) : undefined,
    });
    res.status(201).json(project);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "create failed";
    res.status(400).json({ error: msg });
  }
});

fieldCheckV1Router.get("/items", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const ref = parseRef(req.query as Record<string, unknown>);
  if (!ref) {
    res.status(400).json({ error: "source and projectId query params are required" });
    return;
  }
  const checkDate = parseCheckDate(req.query as Record<string, unknown>);
  res.json({ items: listFieldCheckItemsV1(ref, checkDate) });
});

fieldCheckV1Router.get("/progress", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const ref = parseRef(req.query as Record<string, unknown>);
  if (!ref) {
    res.status(400).json({ error: "source and projectId query params are required" });
    return;
  }
  const checkDate = parseCheckDate(req.query as Record<string, unknown>);
  res.json(getFieldCheckProgressV1(ref, checkDate));
});

fieldCheckV1Router.post("/items/generate", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const ref = parseRef(req.body as Record<string, unknown>);
  if (!ref) {
    res.status(400).json({ error: "projectSource and projectId are required" });
    return;
  }
  res.json({ items: generateFieldCheckItemsV1(ref) });
});

fieldCheckV1Router.post("/items", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const ref = parseRef(body);
  if (!ref || !body.label) {
    res.status(400).json({ error: "projectSource, projectId, and label are required" });
    return;
  }
  const item = addManualFieldCheckItemV1(ref, {
    label: String(body.label),
    quantity: body.quantity != null ? Number(body.quantity) : undefined,
    unit: body.unit != null ? String(body.unit) : undefined,
    category: body.category != null ? String(body.category) : undefined,
  });
  res.status(201).json(item);
});

fieldCheckV1Router.patch("/items/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const checkDate = parseCheckDate(body);
  const item = updateFieldCheckItemV1(
    String(req.params.id),
    {
      checked: body.checked !== undefined ? Boolean(body.checked) : undefined,
      checkedBy:
        body.checkedBy !== undefined
          ? body.checkedBy != null
            ? String(body.checkedBy)
            : null
          : req.admin?.username ?? null,
      label: body.label != null ? String(body.label) : undefined,
      quantity: body.quantity != null ? Number(body.quantity) : undefined,
    },
    checkDate
  );
  if (!item) {
    res.status(404).json({ error: "item not found" });
    return;
  }
  res.json(item);
});

fieldCheckV1Router.delete("/items/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const ok = deleteFieldCheckItemV1(String(req.params.id));
  if (!ok) {
    res.status(404).json({ error: "item not found" });
    return;
  }
  res.status(204).send();
});

fieldCheckV1Router.post("/sessions", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const ref = parseRef(body);
  if (!ref) {
    res.status(400).json({ error: "projectSource and projectId are required" });
    return;
  }
  const checkDate = parseCheckDate(body);
  const session = completeFieldCheckSessionV1(
    ref,
    req.admin?.username ?? null,
    body.memo != null ? String(body.memo) : null,
    checkDate
  );
  res.status(201).json(session);
});

fieldCheckV1Router.get("/sessions", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const ref = parseRef(req.query as Record<string, unknown>);
  if (!ref) {
    res.status(400).json({ error: "source and projectId query params are required" });
    return;
  }
  res.json({ sessions: listFieldCheckSessionsV1(ref) });
});
