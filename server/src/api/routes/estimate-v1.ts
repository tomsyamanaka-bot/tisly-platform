import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import fs from "fs";
import path from "path";
import {
  buildTomsFormatPreviewV1,
  createEstimateFromSurveyV1,
  createInvoiceFromEstimateV1,
  duplicateEstimateV1,
  finalizeEstimateV1,
  getEstimatePdfContextV1,
  getEstimateProjectV1Detail,
  listEstimateProjectsV1,
  listPendingSurveysV1,
  renderCompletionReportHtmlV1,
  renderSpecificationHtmlV1,
  updateEstimateHeaderV1,
  updateEstimateItemsV1,
} from "../../estimate/estimate-v1-store.js";
import {
  addCompletionPhotoV1,
  deleteCompletionPhotoV1,
  listCompletionPhotosV1,
  updateCompletionPhotoV1,
} from "../../estimate/completion-photos-store.js";
import { businessUploadsDir } from "../../business/business-store.js";
import {
  getEstimatePdfOrPlaceholder,
  getInvoicePdfOrPlaceholder,
} from "../../business/services/pdfService.js";
import { getBusinessProject, getEstimate, getInvoice } from "../../business/business-store.js";
import type { EstimateLineItem } from "../../business/business-types.js";
import type { EstimateHeaderInputV1 } from "../../estimate/estimate-v1-types.js";
import {
  buildMaterialCandidatesForSurvey,
  listAllMaterialCandidatePresets,
} from "../../estimate/material-candidates.js";

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

function parseIncludePhotos(query: Record<string, unknown>): boolean {
  const raw = query.includePhotos ?? query.photos;
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  return false;
}

estimateV1Router.get("/material-candidates/:surveyProjectId", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const groups = buildMaterialCandidatesForSurvey(String(req.params.surveyProjectId));
  res.json({ groups });
});

estimateV1Router.get("/material-candidates", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  res.json({ groups: listAllMaterialCandidatePresets() });
});

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

estimateV1Router.patch("/projects/:id/header", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const body = req.body as EstimateHeaderInputV1;
  try {
    const header = updateEstimateHeaderV1(String(req.params.id), body);
    res.json({ header });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "update failed";
    res.status(msg === "estimate not found" ? 404 : 400).json({ error: msg });
  }
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
  const body = (req.body ?? {}) as { includePhotos?: boolean };
  try {
    const result = finalizeEstimateV1(String(req.params.id), {
      includePhotos: body.includePhotos === true,
    });
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
  const includePhotos = parseIncludePhotos(req.query as Record<string, unknown>);
  const pdfCtx = getEstimatePdfContextV1(project.id, { includePhotos }) ?? undefined;
  const { contentType, path: filePath } = getEstimatePdfOrPlaceholder(project, estimate, pdfCtx);
  res.type(contentType).sendFile(filePath);
});

estimateV1Router.post("/projects/:id/invoice", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  try {
    const result = createInvoiceFromEstimateV1(String(req.params.id));
    res.status(201).json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "invoice failed";
    res.status(msg === "estimate not found" ? 404 : 400).json({ error: msg });
  }
});

estimateV1Router.get("/projects/:id/invoice/pdf", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const project = getBusinessProject(String(req.params.id));
  if (!project?.invoiceId || !project.estimateId) {
    res.status(404).json({ error: "No invoice" });
    return;
  }
  const invoice = getInvoice(project.invoiceId);
  const estimate = getEstimate(project.estimateId);
  if (!invoice || !estimate) {
    res.status(404).json({ error: "No invoice" });
    return;
  }
  const includePhotos = parseIncludePhotos(req.query as Record<string, unknown>);
  const pdfCtx = getEstimatePdfContextV1(project.id, { includePhotos }) ?? undefined;
  const { contentType, path: filePath } = getInvoicePdfOrPlaceholder(project, invoice, estimate, {
    notes: pdfCtx?.notes,
    includePhotos: pdfCtx?.includePhotos,
  });
  res.type(contentType).sendFile(filePath);
});

estimateV1Router.get(
  "/projects/:id/specification/pdf",
  ...estimateV1Auth,
  (req: AuthedRequest, res) => {
    if (!assertEstimateV1Role(req, res)) return;
    const project = getBusinessProject(String(req.params.id));
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const html = renderSpecificationHtmlV1(project.id);
    if (!html) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const tmp = businessUploadsDir(project.id, "pdf-html");
    const p = path.join(tmp, "specification-live.html");
    fs.writeFileSync(p, html, "utf8");
    res.type("text/html; charset=utf-8").sendFile(p);
  }
);

estimateV1Router.get("/projects/:id/completion-photos", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const project = getBusinessProject(String(req.params.id));
  if (!project) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ photos: listCompletionPhotosV1(project.id) });
});

estimateV1Router.post("/projects/:id/completion-photos", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  const projectId = String(req.params.id);
  const body = req.body as { imageBase64?: string; fileName?: string; title?: string };
  if (!body.imageBase64) {
    res.status(400).json({ error: "imageBase64 required" });
    return;
  }
  try {
    const photo = addCompletionPhotoV1(projectId, {
      imageBase64: body.imageBase64,
      fileName: body.fileName,
      title: body.title,
      uploadedBy: req.admin?.username,
    });
    res.status(201).json(photo);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upload failed";
    res.status(msg === "project not found" ? 404 : 400).json({ error: msg });
  }
});

estimateV1Router.patch(
  "/projects/:id/completion-photos/:photoId",
  ...estimateV1Auth,
  (req: AuthedRequest, res) => {
    if (!assertEstimateV1Role(req, res)) return;
    const body = req.body as { title?: string; imageBase64?: string; fileName?: string };
    const updated = updateCompletionPhotoV1(String(req.params.id), String(req.params.photoId), body);
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(updated);
  }
);

estimateV1Router.delete(
  "/projects/:id/completion-photos/:photoId",
  ...estimateV1Auth,
  (req: AuthedRequest, res) => {
    if (!assertEstimateV1Role(req, res)) return;
    const ok = deleteCompletionPhotoV1(String(req.params.id), String(req.params.photoId));
    if (!ok) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(204).send();
  }
);

estimateV1Router.get(
  "/projects/:id/completion-report/pdf",
  ...estimateV1Auth,
  (req: AuthedRequest, res) => {
    if (!assertEstimateV1Role(req, res)) return;
    const project = getBusinessProject(String(req.params.id));
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const html = renderCompletionReportHtmlV1(project.id);
    if (!html) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const tmp = businessUploadsDir(project.id, "pdf-html");
    const p = path.join(tmp, "completion-report-live.html");
    fs.writeFileSync(p, html, "utf8");
    res.type("text/html; charset=utf-8").sendFile(p);
  }
);

estimateV1Router.post("/projects/:id/duplicate", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  try {
    const detail = duplicateEstimateV1(String(req.params.id));
    res.status(201).json(detail);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "duplicate failed";
    res.status(msg === "estimate not found" ? 404 : 400).json({ error: msg });
  }
});

estimateV1Router.get("/projects/:id/toms-format", ...estimateV1Auth, (req: AuthedRequest, res) => {
  if (!assertEstimateV1Role(req, res)) return;
  try {
    const includePhotos = parseIncludePhotos(req.query as Record<string, unknown>);
    res.json(buildTomsFormatPreviewV1(String(req.params.id), { includePhotos }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "toms format failed";
    res.status(msg === "estimate not found" ? 404 : 400).json({ error: msg });
  }
});
