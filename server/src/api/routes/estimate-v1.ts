import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import {
  buildTomsFormatPreviewV1,
  createEstimateFromSurveyV1,
  finalizeEstimateV1,
  getEstimatePdfContextV1,
  getEstimateProjectV1Detail,
  listEstimateProjectsV1,
  listPendingSurveysV1,
  updateEstimateItemsV1,
} from "../../estimate/estimate-v1-store.js";
import { getEstimatePdfOrPlaceholder } from "../../business/services/pdfService.js";
import { getBusinessProject } from "../../business/business-store.js";
import type { EstimateLineItem } from "../../business/business-types.js";

export const estimateV1Router = Router();

const estimateV1Auth = [requireAuth("surveyor")] as const;

function assertEstimateV1Role(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (
    !roleMeetsRequirement(role, "surveyor") &&
    !roleMeetsRequirement(role, "manager") &&
    role !== "super_admin"
  ) {
    res.status(403).json({ error: "Surveyor, manager or admin role required" });
    return false;
  }
  return true;
}

estimateV1Router.get("/pending-surveys", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const customerCode = (req.query.customerCode as string) ?? req.admin?.customerCode;
  res.json({ surveys: listPendingSurveysV1({ customerCode }) });
});

estimateV1Router.get("/projects", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const customerCode = (req.query.customerCode as string) ?? req.admin?.customerCode;
  res.json({ projects: listEstimateProjectsV1({ customerCode }) });
});

estimateV1Router.post("/from-survey/:surveyProjectId", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  try {
    const detail = createEstimateFromSurveyV1(
      String(req.params.surveyProjectId),
      req.admin?.username
    );
    res.status(201).json(detail);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "create failed";
    const status =
      msg === "survey project not found"
        ? 404
        : msg === "survey project must be estimate_pending"
          ? 400
          : 400;
    res.status(status).json({ error: msg });
  }
});

estimateV1Router.get("/projects/:id", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const detail = getEstimateProjectV1Detail(String(req.params.id));
  if (!detail) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(detail);
});

estimateV1Router.patch("/projects/:id/items", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const body = req.body as { items?: Partial<EstimateLineItem>[]; notes?: string };
  if (!Array.isArray(body.items)) {
    res.status(400).json({ error: "items array required" });
    return;
  }
  try {
    const result = updateEstimateItemsV1(String(req.params.id), body.items, {
      notes: body.notes,
    });
    res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "update failed";
    res.status(msg === "estimate not found" ? 404 : 400).json({ error: msg });
  }
});

estimateV1Router.post("/projects/:id/finalize", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  try {
    const result = finalizeEstimateV1(String(req.params.id));
    res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "finalize failed";
    res.status(msg === "estimate not found" ? 404 : 400).json({ error: msg });
  }
});

estimateV1Router.get("/projects/:id/pdf", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const project = getBusinessProject(String(req.params.id));
  if (!project?.estimateId) {
    res.status(404).json({ error: "No estimate" });
    return;
  }
  const estimate = getEstimateProjectV1Detail(project.id)?.estimate;
  if (!estimate) {
    res.status(404).json({ error: "No estimate" });
    return;
  }
  const pdfCtx = getEstimatePdfContextV1(project.id) ?? undefined;
  const { contentType, path: filePath } = getEstimatePdfOrPlaceholder(project, estimate, pdfCtx);
  res.type(contentType).sendFile(filePath);
});

estimateV1Router.get("/projects/:id/toms-format", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  try {
    res.json(buildTomsFormatPreviewV1(String(req.params.id)));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "toms format failed";
    res.status(msg === "estimate not found" ? 404 : 400).json({ error: msg });
  }
});
