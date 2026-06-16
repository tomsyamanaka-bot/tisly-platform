import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import { getBusinessProject } from "../../business/business-store.js";
import {
  addProjectTimelineEventV1,
  listProjectTimelineEventsV1,
} from "../../projects/project-timeline-v1-store.js";

export const projectTimelineV1Router = Router();

const auth = [requireAuth("surveyor")] as const;

function assertRole(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (!roleMeetsRequirement(role, "surveyor") && role !== "super_admin") {
    res.status(403).json({ error: "Surveyor or admin role required" });
    return false;
  }
  return true;
}

projectTimelineV1Router.get("/:projectId", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const projectId = String(req.params.projectId);
  if (!getBusinessProject(projectId)) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  const q = (req.query.q as string) ?? "";
  const events = listProjectTimelineEventsV1(projectId, { q });
  res.json({ events, count: events.length });
});

projectTimelineV1Router.post("/add", ...auth, (req: AuthedRequest, res) => {
  if (!assertRole(req, res)) return;
  const body = req.body ?? {};
  const projectId = String(body.projectId ?? "").trim();
  const eventType = String(body.eventType ?? "").trim();
  const title = String(body.title ?? "").trim();
  if (!projectId || !eventType || !title) {
    res.status(400).json({ error: "projectId, eventType, and title are required" });
    return;
  }
  if (!getBusinessProject(projectId)) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  const event = addProjectTimelineEventV1({
    projectId,
    eventType,
    title,
    description: body.description != null ? String(body.description) : undefined,
  });
  res.status(201).json({ event });
});
