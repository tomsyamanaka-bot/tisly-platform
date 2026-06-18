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
  updateSurveyPhotoType,
  SURVEY_PHOTO_TYPES,
} from "../../survey/survey-store.js";
import { runSurveyAiIntake } from "../../survey/ai-intake.js";
import { runDrawingOcr } from "../../survey/drawing-ocr.js";
import { processSurveySync } from "../../survey/survey-sync.js";
import { removeProjectGoogleCalendarEvent } from "../../schedule/google-calendar-sync-service.js";
import { generateFloorMapFromSurvey } from "../../survey/survey-to-pro-map.js";
import { buildSurveyReportHtml } from "../../survey/survey-report.js";
import {
  reverseGeocodeAddress,
  saveSurveyAudio,
  saveSurveySketch,
  listSurveyAudio,
  listSurveySketches,
} from "../../survey/survey-field-media.js";

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

surveyRouter.delete("/projects/:projectId", ...surveyAuth, async (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const projectId = String(req.params.projectId);
  const googleDelete = await removeProjectGoogleCalendarEvent(
    { source: "survey", projectId },
    "legacy_survey_project_deleted"
  );
  if (!deleteSurveyProject(projectId)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true, googleDelete });
});

surveyRouter.post("/photo", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const body = req.body as {
    projectId?: string;
    photoType?: string;
    imageBase64?: string;
    fileName?: string;
    photos?: Array<{ photoType?: string; imageBase64: string; fileName?: string }>;
  };
  if (!body.projectId) {
    res.status(400).json({ error: "projectId required" });
    return;
  }
  const items =
    body.photos ??
    (body.imageBase64 && body.photoType
      ? [{ photoType: body.photoType, imageBase64: body.imageBase64, fileName: body.fileName }]
      : []);
  if (!items.length) {
    res.status(400).json({ error: "photoType+imageBase64 or photos[] required" });
    return;
  }
  try {
    const saved = items.map((p) =>
      saveSurveyPhoto({
        projectId: body.projectId!,
        photoType: p.photoType ?? "other",
        imageBase64: p.imageBase64,
        fileName: p.fileName,
        uploadedBy: req.admin?.username,
      })
    );
    res.status(201).json({ photos: saved, count: saved.length });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

surveyRouter.post("/audio", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const body = req.body as {
    projectId?: string;
    audioBase64?: string;
    fileName?: string;
    mimeType?: string;
    durationSec?: number;
    transcript?: string;
  };
  if (!body.projectId || !body.audioBase64) {
    res.status(400).json({ error: "projectId and audioBase64 required" });
    return;
  }
  try {
    const saved = saveSurveyAudio({
      projectId: body.projectId,
      audioBase64: body.audioBase64,
      fileName: body.fileName,
      mimeType: body.mimeType,
      durationSec: body.durationSec,
      transcript: body.transcript,
      uploadedBy: req.admin?.username,
    });
    res.status(201).json(saved);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

surveyRouter.get("/projects/:projectId/audio", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  res.json({ audio: listSurveyAudio(String(req.params.projectId)) });
});

surveyRouter.post("/projects/:projectId/sketch", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const body = req.body as { imageBase64?: string };
  if (!body.imageBase64) {
    res.status(400).json({ error: "imageBase64 required" });
    return;
  }
  try {
    const saved = saveSurveySketch({
      projectId: String(req.params.projectId),
      imageBase64: body.imageBase64,
      uploadedBy: req.admin?.username,
    });
    res.status(201).json(saved);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

surveyRouter.get("/projects/:projectId/sketches", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  res.json({ sketches: listSurveySketches(String(req.params.projectId)) });
});

surveyRouter.post("/reverse-geocode", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const body = req.body as { lat?: number; lng?: number; projectId?: string };
  if (body.lat == null || body.lng == null) {
    res.status(400).json({ error: "lat and lng required" });
    return;
  }
  const geo = reverseGeocodeAddress(body.lat, body.lng);
  if (body.projectId) {
    updateSurveyProject(body.projectId, { address: geo.address, gpsLat: body.lat, gpsLng: body.lng });
  }
  res.json(geo);
});

surveyRouter.post("/projects/:projectId/photos", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const body = req.body as { photoType?: string; imageBase64?: string; fileName?: string };
  if (!body.imageBase64 || !body.photoType) {
    res.status(400).json({ error: "photoType and imageBase64 required" });
    return;
  }
  if (!isValidSurveyPhotoType(body.photoType)) {
    res.status(400).json({ error: "Invalid photoType", allowed: SURVEY_PHOTO_TYPES });
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

surveyRouter.patch("/photos/:photoId", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const photoType = (req.body as { photoType?: string }).photoType;
  if (!photoType || !isValidSurveyPhotoType(photoType)) {
    res.status(400).json({ error: "Valid photoType required", allowed: SURVEY_PHOTO_TYPES });
    return;
  }
  if (!updateSurveyPhotoType(String(req.params.photoId), photoType)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true, photoType });
});

surveyRouter.get("/projects/:projectId/photos", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  res.json({ photos: listSurveyPhotos(String(req.params.projectId)), photoTypes: SURVEY_PHOTO_TYPES });
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

surveyRouter.post("/drawing/:drawingId/ocr", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  try {
    const result = runDrawingOcr(String(req.params.drawingId));
    res.json(result);
  } catch (e) {
    res.status(404).json({ error: String(e) });
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

surveyRouter.post("/projects/:projectId/ai/intake", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const body = req.body as { notes?: string; gps?: { lat?: number; lng?: number } };
  try {
    const result = runSurveyAiIntake(String(req.params.projectId), {
      notes: body.notes,
      gps: body.gps,
    });
    res.status(201).json(result);
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

surveyRouter.post("/projects/:projectId/generate-floor-map", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  try {
    const result = generateFloorMapFromSurvey(String(req.params.projectId));
    res.status(201).json(result);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

surveyRouter.post("/sync", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const body = req.body as { projectId?: string; items?: unknown[] };
  if (!body.projectId || !Array.isArray(body.items)) {
    res.status(400).json({ error: "projectId and items[] required" });
    return;
  }
  try {
    const result = processSurveySync(
      { projectId: body.projectId, items: body.items as Parameters<typeof processSurveySync>[0]["items"] },
      req.admin?.username
    );
    res.json(result);
  } catch (e) {
    res.status(404).json({ error: String(e) });
  }
});

surveyRouter.get("/projects/:projectId/report.html", ...surveyAuth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  try {
    const html = buildSurveyReportHtml(String(req.params.projectId));
    res.type("html").send(html);
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
