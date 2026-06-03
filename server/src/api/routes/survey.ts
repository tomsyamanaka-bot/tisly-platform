import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement } from "../../auth/roles.js";
import {
  createSurveyProject,
  listSurveyProjects,
  getSurveyProject,
  updateSurveyProject,
  deleteSurveyProject,
  saveSurveyPhoto,
  listSurveyPhotos,
  saveSurveyDrawing,
  listSurveyDrawings,
  deleteSurveyDrawing,
  getSurveyChecklist,
  saveSurveyChecklist,
  createAiEstimatePlaceholder,
  importSurveyDrawingToProLayer,
  isValidSurveyPhotoType,
} from "../../survey/survey-store.js";

export const surveyRouter = Router();

const surveyAuth = [requireAuth("surveyor")] as const;

function assertSurveyRole(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (!roleMeetsRequirement(role, "surveyor") && role !== "super_admin") {
    res.status(403).json({ error: "Surveyor or admin role required" });
    return false;
  }
  return true;
}

surveyRouter.get("/projects", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const customerCode = req.query.customerCode as string | undefined;
  res.json({ projects: listSurveyProjects(customerCode) });
});

surveyRouter.post("/projects", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const body = req.body as {
    customerCode?: string;
    siteName?: string;
    address?: string;
    gpsLat?: number;
    gpsLng?: number;
    status?: string;
  };
  if (!body.customerCode || !body.siteName) {
    res.status(400).json({ error: "customerCode and siteName required" });
    return;
  }
  const project = createSurveyProject({
    customerCode: body.customerCode,
    siteName: body.siteName,
    address: body.address,
    gpsLat: body.gpsLat,
    gpsLng: body.gpsLng,
    status: body.status,
  });
  res.status(201).json(project);
});

surveyRouter.get("/projects/:projectId", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const project = getSurveyProject(String(req.params.projectId));
  if (!project) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(project);
});

surveyRouter.patch("/projects/:projectId", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const body = req.body as {
    siteName?: string;
    address?: string;
    gpsLat?: number;
    gpsLng?: number;
    status?: string;
    customerCode?: string;
  };
  const updated = updateSurveyProject(String(req.params.projectId), body);
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(updated);
});

surveyRouter.delete("/projects/:projectId", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  if (!deleteSurveyProject(String(req.params.projectId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

surveyRouter.post("/projects/:projectId/photos", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const body = req.body as { photoType?: string; imageBase64?: string; fileName?: string };
  if (!body.imageBase64 || !body.photoType) {
    res.status(400).json({ error: "photoType and imageBase64 required" });
    return;
  }
  if (!isValidSurveyPhotoType(body.photoType)) {
    res.status(400).json({ error: "Invalid photoType", allowed: ["outside", "inside", "network", "etc."] });
    return;
  }
  try {
    const saved = saveSurveyPhoto({
      projectId: String(req.params.projectId),
      photoType: body.photoType,
      imageBase64: body.imageBase64,
      fileName: body.fileName,
      uploadedBy: req.admin?.username,
    });
    res.status(201).json(saved);
  } catch (e) {
    res.status(404).json({ error: String(e) });
  }
});

surveyRouter.get("/projects/:projectId/photos", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  res.json({ photos: listSurveyPhotos(String(req.params.projectId)) });
});

surveyRouter.post("/drawing", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const body = req.body as {
    projectId?: string;
    imageBase64?: string;
    fileName?: string;
    mimeType?: string;
  };
  if (!body.projectId || !body.imageBase64) {
    res.status(400).json({ error: "projectId and imageBase64 required" });
    return;
  }
  try {
    const saved = saveSurveyDrawing({
      projectId: body.projectId,
      imageBase64: body.imageBase64,
      fileName: body.fileName,
      mimeType: body.mimeType,
      uploadedBy: req.admin?.username,
    });
    res.status(201).json(saved);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

surveyRouter.get("/drawing", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) {
    res.status(400).json({ error: "projectId query required" });
    return;
  }
  res.json({ drawings: listSurveyDrawings(projectId) });
});

surveyRouter.delete("/drawing/:drawingId", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  if (!deleteSurveyDrawing(String(req.params.drawingId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

surveyRouter.get("/projects/:projectId/checklist", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  res.json({ checklist: getSurveyChecklist(String(req.params.projectId)) });
});

surveyRouter.put("/projects/:projectId/checklist", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const checklist = (req.body as { checklist?: Record<string, unknown> }).checklist;
  if (!checklist) {
    res.status(400).json({ error: "checklist required" });
    return;
  }
  try {
    saveSurveyChecklist(String(req.params.projectId), checklist);
    res.json({ ok: true, checklist: getSurveyChecklist(String(req.params.projectId)) });
  } catch (e) {
    res.status(404).json({ error: String(e) });
  }
});

surveyRouter.post("/projects/:projectId/ai-estimate", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  try {
    const result = createAiEstimatePlaceholder(String(req.params.projectId));
    res.status(201).json(result);
  } catch (e) {
    res.status(404).json({ error: String(e) });
  }
});

surveyRouter.post("/drawing/:drawingId/import-pro", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const layerId = (req.body as { layerId?: string }).layerId;
  if (!layerId) {
    res.status(400).json({ error: "layerId required" });
    return;
  }
  const ok = importSurveyDrawingToProLayer(String(req.params.drawingId), layerId);
  if (!ok) {
    res.status(400).json({ error: "Import failed" });
    return;
  }
  res.json({ ok: true });
});
