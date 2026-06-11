import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import type { ProjectRefV1, PurchaseLineStatus } from "../../field-ops/field-ops-types.js";
import { PURCHASE_STATUS_LABELS } from "../../field-ops/field-ops-types.js";
import {
  generatePurchaseLinesV1,
  listPurchaseLinesV1,
  summarizePurchaseV1,
  updatePurchaseLineStatusV1,
} from "../../field-ops/purchase-v1-store.js";

export const purchaseV1Router = Router();

const auth = [requireAuth("surveyor")] as const;

const VALID_STATUSES = new Set<string>(["pending", "ordered", "received", "carried"]);

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

purchaseV1Router.get("/status-labels", ...auth, (_req: AuthedRequest, res) => {
  res.json({ labels: PURCHASE_STATUS_LABELS });
});

purchaseV1Router.get("/lines", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const ref = parseRef(req.query as Record<string, unknown>);
  if (!ref) {
    res.status(400).json({ error: "source and projectId query params are required" });
    return;
  }
  res.json({
    lines: listPurchaseLinesV1(ref),
    summary: summarizePurchaseV1(ref),
  });
});

purchaseV1Router.post("/lines/generate", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const ref = parseRef(req.body as Record<string, unknown>);
  if (!ref) {
    res.status(400).json({ error: "projectSource and projectId are required" });
    return;
  }
  res.json({
    lines: generatePurchaseLinesV1(ref),
    summary: summarizePurchaseV1(ref),
  });
});

purchaseV1Router.patch("/lines/:id/status", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const status = String((req.body as { status?: string }).status ?? "");
  if (!VALID_STATUSES.has(status)) {
    res.status(400).json({ error: "invalid status" });
    return;
  }
  const line = updatePurchaseLineStatusV1(String(req.params.id), status as PurchaseLineStatus);
  if (!line) {
    res.status(404).json({ error: "line not found" });
    return;
  }
  res.json(line);
});
