import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import {
  SURVEY_MATERIAL_CATEGORIES,
  SURVEY_WORKFLOW_STATUSES,
  type SurveyWorkflowStatus,
} from "../../survey/survey-v1-types.js";
import {
  addSurveyMaterialV1,
  addSurveyPhotoMemoV1,
  copySurveyProjectV1,
  createSurveyProjectV1,
  deleteSurveyPhotoV1,
  deleteSurveyProjectV1,
  getSurveyProjectV1Detail,
  listSurveyProjectsV1,
  markEstimatePendingV1,
  moveSurveyPhotoV1,
  updateSurveyPhotoV1,
  updateSurveyProjectV1,
} from "../../survey/survey-v1-store.js";

export const surveyV1Router = Router();

const surveyV1Auth = [requireAuth("surveyor")] as const;

function assertSurveyRole(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (!roleMeetsRequirement(role, "surveyor") && role !== "super_admin") {
    res.status(403).json({ error: "Surveyor or admin role required" });
    return false;
  }
  return true;
}

function parseWorkflowStatus(raw: unknown): SurveyWorkflowStatus | null {
  if (typeof raw !== "string") return null;
  return (SURVEY_WORKFLOW_STATUSES as readonly string[]).includes(raw)
    ? (raw as SurveyWorkflowStatus)
    : null;
}

surveyV1Router.get("/projects", ...surveyV1Auth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const customerCode = req.query.customerCode as string | undefined;
  const workflowStatus = parseWorkflowStatus(req.query.workflowStatus);
  res.json({
    projects: listSurveyProjectsV1({ customerCode, workflowStatus: workflowStatus ?? undefined }),
  });
});

surveyV1Router.post("/projects", ...surveyV1Auth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const body = req.body as {
    customerCode?: string;
    customerName?: string;
    customerAddress?: string;
    siteName?: string;
    address?: string;
    phone?: string;
    email?: string;
    surveyDate?: string;
    assignee?: string;
    notes?: string;
    projectNo?: string;
  };
  const customerCode = body.customerCode ?? req.admin?.customerCode;
  if (!customerCode || !body.customerName?.trim()) {
    res.status(400).json({ error: "customerCode and customerName required" });
    return;
  }
  try {
    const project = createSurveyProjectV1({
      customerCode,
      customerName: body.customerName,
      customerAddress: body.customerAddress,
      siteName: body.siteName,
      address: body.address,
      phone: body.phone,
      email: body.email,
      surveyDate: body.surveyDate,
      assignee: body.assignee,
      notes: body.notes,
      projectNo: body.projectNo,
    });
    res.status(201).json(project);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "create failed" });
  }
});

surveyV1Router.get("/projects/:id", ...surveyV1Auth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const detail = getSurveyProjectV1Detail(String(req.params.id));
  if (!detail) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(detail);
});

surveyV1Router.patch("/projects/:id", ...surveyV1Auth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const body = req.body as {
    customerName?: string;
    customerAddress?: string;
    siteName?: string;
    address?: string;
    phone?: string;
    email?: string;
    surveyDate?: string;
    assignee?: string;
    notes?: string;
    workflowStatus?: string;
  };
  const workflowStatus = body.workflowStatus ? parseWorkflowStatus(body.workflowStatus) : undefined;
  if (body.workflowStatus && !workflowStatus) {
    res.status(400).json({ error: "invalid workflowStatus", allowed: SURVEY_WORKFLOW_STATUSES });
    return;
  }
  try {
    const updated = updateSurveyProjectV1(String(req.params.id), {
      customerName: body.customerName,
      customerAddress: body.customerAddress,
      siteName: body.siteName,
      address: body.address,
      phone: body.phone,
      email: body.email,
      surveyDate: body.surveyDate,
      assignee: body.assignee,
      notes: body.notes,
      workflowStatus: workflowStatus ?? undefined,
    });
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "update failed" });
  }
});

surveyV1Router.post("/projects/:id/copy", ...surveyV1Auth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  try {
    const copied = copySurveyProjectV1(String(req.params.id));
    res.status(201).json(copied);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "copy failed";
    res.status(msg === "project not found" ? 404 : 400).json({ error: msg });
  }
});

surveyV1Router.delete("/projects/:id", ...surveyV1Auth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const ok = deleteSurveyProjectV1(String(req.params.id));
  if (!ok) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

surveyV1Router.post(
  "/projects/:id/photos/:photoId/move",
  ...surveyV1Auth,
  (req: AuthedRequest, res) => {
    if (!assertSurveyRole(req, res)) return;
    const body = req.body as { direction?: string };
    if (body.direction !== "up" && body.direction !== "down") {
      res.status(400).json({ error: "direction must be up or down" });
      return;
    }
    const photos = moveSurveyPhotoV1(
      String(req.params.id),
      String(req.params.photoId),
      body.direction
    );
    if (!photos) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ photos });
  }
);

surveyV1Router.delete(
  "/projects/:id/photos/:photoId",
  ...surveyV1Auth,
  (req: AuthedRequest, res) => {
    if (!assertSurveyRole(req, res)) return;
    const ok = deleteSurveyPhotoV1(String(req.params.id), String(req.params.photoId));
    if (!ok) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ok: true });
  }
);

surveyV1Router.patch("/projects/:id/photos/:photoId", ...surveyV1Auth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const body = req.body as {
    title?: string;
    comment?: string;
    imageBase64?: string;
    fileName?: string;
  };
  if (!body.title?.trim() && !body.comment?.trim() && !body.imageBase64) {
    res.status(400).json({ error: "title, comment or imageBase64 required" });
    return;
  }
  try {
    const updated = updateSurveyPhotoV1(String(req.params.id), String(req.params.photoId), body);
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(updated);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "photo update failed";
    res.status(400).json({ error: msg });
  }
});

surveyV1Router.post("/projects/:id/photos", ...surveyV1Auth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const body = req.body as {
    comment?: string;
    imageBase64?: string;
    fileName?: string;
    takenAt?: string;
  };
  if (!body.comment?.trim() && !body.imageBase64) {
    res.status(400).json({ error: "comment or imageBase64 required" });
    return;
  }
  try {
    const photo = addSurveyPhotoMemoV1(String(req.params.id), {
      comment: body.comment,
      imageBase64: body.imageBase64,
      fileName: body.fileName,
      takenAt: body.takenAt,
      uploadedBy: req.admin?.username,
    });
    res.status(201).json(photo);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "photo failed";
    res.status(msg === "project not found" ? 404 : 400).json({ error: msg });
  }
});

surveyV1Router.post("/projects/:id/materials", ...surveyV1Auth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const body = req.body as {
    category?: string;
    itemLabel?: string;
    quantity?: number;
    memo?: string;
  };
  if (!body.category || !(SURVEY_MATERIAL_CATEGORIES as readonly string[]).includes(body.category)) {
    res.status(400).json({ error: "valid category required", allowed: SURVEY_MATERIAL_CATEGORIES });
    return;
  }
  try {
    const material = addSurveyMaterialV1(String(req.params.id), {
      category: body.category,
      itemLabel: body.itemLabel,
      quantity: body.quantity,
      memo: body.memo,
    });
    res.status(201).json(material);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "material failed";
    res.status(msg === "project not found" ? 404 : 400).json({ error: msg });
  }
});

surveyV1Router.post(
  "/projects/:id/estimate-pending",
  ...surveyV1Auth,
  (req: AuthedRequest, res) => {
    if (!assertSurveyRole(req, res)) return;
    try {
      const result = markEstimatePendingV1(String(req.params.id), req.admin?.userId);
      res.json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "handoff failed";
      res.status(msg === "project not found" ? 404 : 400).json({ error: msg });
    }
  }
);
