import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import type { ProjectRefV1 } from "../../field-ops/field-ops-types.js";
import {
  generateCompletionChecklistV1,
  getLatestWorkSessionForProject,
  getWorkSessionV1,
  listCompletionChecklistV1,
  listWorkSessionsForDate,
  recordArrivalV1,
  recordWorkCompleteV1,
  recordWorkStartV1,
  updateCompletionChecklistItemV1,
} from "../../field-ops/work-session-v1-store.js";

export const workSessionV1Router = Router();

const auth = [requireAuth("surveyor")] as const;

function assertRole(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (!roleMeetsRequirement(role, "surveyor") && role !== "super_admin") {
    res.status(403).json({ error: "Surveyor or admin role required" });
    return false;
  }
  return true;
}

function parseRef(input: Record<string, unknown>): ProjectRefV1 | null {
  const source = input.source ?? input.projectSource;
  const projectId = input.projectId;
  if (source !== "survey" && source !== "business") return null;
  if (!projectId || typeof projectId !== "string") return null;
  return { source, projectId };
}

workSessionV1Router.get("/session", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const ref = parseRef(req.query as Record<string, unknown>);
  if (!ref) {
    res.status(400).json({ error: "source and projectId query params are required" });
    return;
  }
  const workDate = req.query.workDate ? String(req.query.workDate).slice(0, 10) : undefined;
  const session = getWorkSessionV1(ref, workDate) ?? getLatestWorkSessionForProject(ref);
  const checklist = listCompletionChecklistV1(ref);
  res.json({ session, checklist });
});

workSessionV1Router.get("/sessions-by-date", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const workDate = String(req.query.workDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    res.status(400).json({ error: "valid workDate required (YYYY-MM-DD)" });
    return;
  }
  res.json({ sessions: listWorkSessionsForDate(workDate) });
});

workSessionV1Router.post("/arrival", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const ref = parseRef(body);
  if (!ref) {
    res.status(400).json({ error: "projectSource and projectId are required" });
    return;
  }
  try {
    const session = recordArrivalV1(ref, {
      workDate: body.workDate != null ? String(body.workDate).slice(0, 10) : undefined,
      lat: body.lat != null ? Number(body.lat) : body.arrivalLat != null ? Number(body.arrivalLat) : null,
      lng: body.lng != null ? Number(body.lng) : body.arrivalLng != null ? Number(body.arrivalLng) : null,
      workerName: body.workerName != null ? String(body.workerName) : req.admin?.username ?? null,
      scheduleEventId: body.scheduleEventId != null ? String(body.scheduleEventId) : null,
    });
    res.json({ session, checklist: listCompletionChecklistV1(ref) });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "arrival failed" });
  }
});

workSessionV1Router.post("/start", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const ref = parseRef(body);
  if (!ref) {
    res.status(400).json({ error: "projectSource and projectId are required" });
    return;
  }
  try {
    const session = recordWorkStartV1(
      ref,
      body.workDate != null ? String(body.workDate).slice(0, 10) : undefined
    );
    res.json({ session });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "start failed" });
  }
});

workSessionV1Router.post("/complete", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const ref = parseRef(body);
  if (!ref) {
    res.status(400).json({ error: "projectSource and projectId are required" });
    return;
  }
  try {
    const session = recordWorkCompleteV1(
      ref,
      body.workDate != null ? String(body.workDate).slice(0, 10) : undefined
    );
    res.json({ session });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "complete failed" });
  }
});

workSessionV1Router.get("/completion-checklist", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const ref = parseRef(req.query as Record<string, unknown>);
  if (!ref) {
    res.status(400).json({ error: "source and projectId query params are required" });
    return;
  }
  res.json({ items: listCompletionChecklistV1(ref) });
});

workSessionV1Router.post("/completion-checklist/generate", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const ref = parseRef(req.body as Record<string, unknown>);
  if (!ref) {
    res.status(400).json({ error: "projectSource and projectId are required" });
    return;
  }
  res.json({ items: generateCompletionChecklistV1(ref) });
});

workSessionV1Router.patch("/completion-checklist/:id", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const item = updateCompletionChecklistItemV1(String(req.params.id), {
    checked: body.checked !== undefined ? Boolean(body.checked) : undefined,
    checkedBy: req.admin?.username ?? null,
    label: body.label != null ? String(body.label) : undefined,
  });
  if (!item) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(item);
});
