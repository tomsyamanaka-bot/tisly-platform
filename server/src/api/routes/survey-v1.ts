import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { roleMeetsRequirement, normalizeRole } from "../../auth/roles.js";
import {
  SURVEY_MATERIAL_CATEGORIES,
  SURVEY_WORKFLOW_STATUSES,
  type SurveyWorkflowStatus,
  type SurveyWorkType,
} from "../../survey/survey-v1-types.js";
import { applyWorkTemplatesToProject } from "../../field-ops/project-materials-service.js";
import { listProjectWorkTemplateIds, listWorkTemplatesV1 } from "../../field-ops/work-templates-store.js";
import {
  removeProjectGoogleCalendarEvent,
  surveyPatchTouchesSchedule,
  syncSurveyProjectScheduleToGoogleIfLinked,
} from "../../schedule/google-calendar-sync-service.js";
import {
  addSurveyMaterialV1,
  addSurveyIpEquipmentV1,
  addSurveyPhotoMemoV1,
  copySurveyProjectV1,
  createSurveyProjectV1,
  deleteSurveyIpEquipmentV1,
  deleteSurveyPhotoV1,
  deleteSurveyProjectV1,
  getSurveyDeletePreviewV1,
  getSurveyProjectV1Detail,
  listDeletedSurveyProjectsV1,
  listSurveyProjectsV1,
  markEstimatePendingV1,
  moveSurveyPhotoV1,
  restoreSurveyProjectV1,
  updateSurveyIpEquipmentV1,
  updateSurveyPhotoV1,
  updateSurveyProjectV1,
} from "../../survey/survey-v1-store.js";
import {
  findBusinessProjectIdForSurvey,
  maybeAutoSaveSpecificationPdfV1,
} from "../../projects/project-pdf-auto-save.js";
import {
  createSurveyDrawingSketchV1,
  deleteSurveyDrawingSketchV1,
  getSurveyDrawingSketchV1,
  listSurveyDrawingSketchesV1,
  exportSurveyDrawingAiJsonV1,
  saveSurveyDrawingSketchBackgroundV1,
  updateSurveyDrawingSketchV1,
  mergeAutoPlotIntoSurveyDrawingV1,
} from "../../survey/survey-drawing-v1-store.js";
import {
  SURVEY_DRAWING_LINE_TYPE_META,
  SURVEY_DRAWING_LINE_TYPES,
  SURVEY_DRAWING_SYMBOL_PALETTE,
  SURVEY_DRAWING_SOURCE_TYPES,
} from "../../survey/survey-drawing-v1-types.js";
import { linkSurveyDrawingBackgroundToSpecSlotV1 } from "../../projects/specification-photos-v1.js";
import { runSurveyAiPipelineV1SafeAsync } from "../../survey/survey-ai-pipeline-v1.js";
import {
  mapGridOcrMemosToSurveyNotesV1,
  runSurveyGridOcrWithLineDetectV1,
} from "../../survey/survey-grid-ocr-v1.js";
import {
  detectSketchLinesFromBase64V1,
  detectSketchLinesFromBufferV1,
} from "../../survey/survey-sketch-line-detect-v1.js";
import {
  parseMultipartBufferV1,
  pickMultipartImageV1,
  readRequestBodyBufferV1,
} from "../../survey/multipart-image-v1.js";
import { postSymbolCountsToAiEstimateEngineV2 } from "../../master/ai-estimate-engine-v2.js";
import { syncFieldCheckAfterDrawingSaveV1 } from "../../field-ops/field-check-drawing-sync-v1.js";

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

function isStorageAdmin(role: string): boolean {
  const n = normalizeRole(role);
  return n === "owner" || n === "admin" || n === "super_admin";
}

function stripIpPasswords<T extends { password?: string }>(items: T[], includePassword: boolean): T[] {
  if (includePassword) return items;
  return items.map(({ password: _p, ...rest }) => rest as T);
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
    workTypes?: string[];
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
      workTypes: body.workTypes as SurveyWorkType[] | undefined,
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
  const role = req.admin?.role ?? "viewer";
  res.json({
    ...detail,
    ipEquipment: stripIpPasswords(detail.ipEquipment, isStorageAdmin(role)),
  });
});

surveyV1Router.patch("/projects/:id", ...surveyV1Auth, async (req: AuthedRequest, res) => {
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
    workTypes?: string[];
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
      workTypes: body.workTypes as SurveyWorkType[] | undefined,
    });
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    let googleSync: Awaited<ReturnType<typeof syncSurveyProjectScheduleToGoogleIfLinked>> | undefined;
    if (surveyPatchTouchesSchedule(body) && updated.surveyDate) {
      googleSync = await syncSurveyProjectScheduleToGoogleIfLinked({
        projectId: updated.projectId,
        surveyDate: updated.surveyDate,
        siteName: updated.siteName,
        customerName: updated.customerName,
        address: updated.address,
        notes: updated.notes,
      });
    }
    res.json({ ...updated, googleSync: googleSync ?? null });
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

surveyV1Router.get("/projects/:id/delete-preview", ...surveyV1Auth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const preview = getSurveyDeletePreviewV1(String(req.params.id));
  if (!preview) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(preview);
});

surveyV1Router.get("/projects/deleted", ...surveyV1Auth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const role = normalizeRole(req.admin?.role ?? "viewer");
  if (role !== "owner" && role !== "admin" && role !== "super_admin") {
    res.status(403).json({ error: "Admin role required" });
    return;
  }
  res.json({ projects: listDeletedSurveyProjectsV1() });
});

surveyV1Router.post("/projects/:id/restore", ...surveyV1Auth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const role = normalizeRole(req.admin?.role ?? "viewer");
  if (role !== "owner" && role !== "admin" && role !== "super_admin") {
    res.status(403).json({ error: "Admin role required" });
    return;
  }
  const ok = restoreSurveyProjectV1(String(req.params.id));
  if (!ok) {
    res.status(404).json({ error: "Not found or not deleted" });
    return;
  }
  res.json({ ok: true, project: getSurveyProjectV1Detail(String(req.params.id)) });
});

surveyV1Router.delete("/projects/:id", ...surveyV1Auth, async (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const projectId = String(req.params.id);
  const googleDelete = await removeProjectGoogleCalendarEvent(
    { source: "survey", projectId },
    "survey_project_deleted"
  );
  const ok = deleteSurveyProjectV1(projectId);
  if (!ok) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true, googleDelete });
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
  const hasTitlePatch = body.title !== undefined || body.comment !== undefined;
  if (!hasTitlePatch && !body.imageBase64) {
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

surveyV1Router.get("/work-templates", ...surveyV1Auth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  res.json({ templates: listWorkTemplatesV1(true) });
});

surveyV1Router.get("/projects/:id/work-templates", ...surveyV1Auth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const projectId = String(req.params.id);
  const detail = getSurveyProjectV1Detail(projectId);
  if (!detail) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  const templateIds = listProjectWorkTemplateIds({ source: "survey", projectId });
  res.json({ templateIds, templates: listWorkTemplatesV1(true).filter((t) => templateIds.includes(t.id)) });
});

surveyV1Router.post("/projects/:id/work-templates", ...surveyV1Auth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const projectId = String(req.params.id);
  const detail = getSurveyProjectV1Detail(projectId);
  if (!detail) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  const body = req.body as { templateIds?: string[] };
  const templateIds = Array.isArray(body.templateIds) ? body.templateIds.map(String) : [];
  const result = applyWorkTemplatesToProject({ source: "survey", projectId }, templateIds);
  res.json(result);
});

surveyV1Router.post(
  "/projects/:id/estimate-pending",
  ...surveyV1Auth,
  async (req: AuthedRequest, res) => {
    if (!assertSurveyRole(req, res)) return;
    try {
      const surveyProjectId = String(req.params.id);
      const result = markEstimatePendingV1(surveyProjectId, req.admin?.userId);
      const businessProjectId = findBusinessProjectIdForSurvey(surveyProjectId);
      if (businessProjectId) {
        await maybeAutoSaveSpecificationPdfV1(businessProjectId);
      }
      res.json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "handoff failed";
      res.status(msg === "project not found" ? 404 : 400).json({ error: msg });
    }
  }
);

surveyV1Router.post("/projects/:id/ip-equipment", ...surveyV1Auth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const role = req.admin?.role ?? "viewer";
  try {
    const item = addSurveyIpEquipmentV1(String(req.params.id), {
      deviceName: body.deviceName != null ? String(body.deviceName) : undefined,
      deviceType: body.deviceType != null ? String(body.deviceType) : undefined,
      location: body.location != null ? String(body.location) : undefined,
      ipAddress: body.ipAddress != null ? String(body.ipAddress) : undefined,
      loginId: body.loginId != null ? String(body.loginId) : undefined,
      password: isStorageAdmin(role) && body.password != null ? String(body.password) : undefined,
      memo: body.memo != null ? String(body.memo) : undefined,
    });
    res.status(201).json({
      item: stripIpPasswords([item], isStorageAdmin(role))[0],
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "add failed" });
  }
});

surveyV1Router.patch("/projects/:id/ip-equipment/:itemId", ...surveyV1Auth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const role = req.admin?.role ?? "viewer";
  const patch: Record<string, string | undefined> = {};
  for (const key of ["deviceName", "deviceType", "location", "ipAddress", "loginId", "memo"] as const) {
    if (body[key] != null) patch[key] = String(body[key]);
  }
  if (isStorageAdmin(role) && body.password != null) patch.password = String(body.password);
  const item = updateSurveyIpEquipmentV1(String(req.params.id), String(req.params.itemId), patch);
  if (!item) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ item: stripIpPasswords([item], isStorageAdmin(role))[0] });
});

surveyV1Router.delete("/projects/:id/ip-equipment/:itemId", ...surveyV1Auth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const ok = deleteSurveyIpEquipmentV1(String(req.params.id), String(req.params.itemId));
  if (!ok) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

surveyV1Router.get("/drawing-sketches/symbols", ...surveyV1Auth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  res.json({ symbols: SURVEY_DRAWING_SYMBOL_PALETTE });
});

surveyV1Router.get("/drawing-sketches/line-types", ...surveyV1Auth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  res.json({
    lineTypes: SURVEY_DRAWING_LINE_TYPES.map((id) => ({
      id,
      ...SURVEY_DRAWING_LINE_TYPE_META[id],
    })),
  });
});

surveyV1Router.get("/projects/:id/drawing-sketches", ...surveyV1Auth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  res.json({ sketches: listSurveyDrawingSketchesV1(String(req.params.id)) });
});

surveyV1Router.post("/projects/:id/drawing-sketches", ...surveyV1Auth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const body = req.body ?? {};
  const rawSource = body.sourceType != null ? String(body.sourceType) : undefined;
  const sourceType =
    rawSource && (SURVEY_DRAWING_SOURCE_TYPES as readonly string[]).includes(rawSource)
      ? (rawSource as (typeof SURVEY_DRAWING_SOURCE_TYPES)[number])
      : undefined;
  try {
    const sketch = createSurveyDrawingSketchV1({
      projectId: String(req.params.id),
      title: body.title != null ? String(body.title) : undefined,
      sourceType,
      notes: body.notes != null ? String(body.notes) : undefined,
    });
    res.status(201).json({ sketch });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

surveyV1Router.get("/drawing-sketches/:sketchId", ...surveyV1Auth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const sketch = getSurveyDrawingSketchV1(String(req.params.sketchId));
  if (!sketch) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ sketch });
});

surveyV1Router.patch("/drawing-sketches/:sketchId", ...surveyV1Auth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  const body = req.body ?? {};
  const rawPatchSource = body.sourceType != null ? String(body.sourceType) : undefined;
  const patchSourceType =
    rawPatchSource && (SURVEY_DRAWING_SOURCE_TYPES as readonly string[]).includes(rawPatchSource)
      ? (rawPatchSource as (typeof SURVEY_DRAWING_SOURCE_TYPES)[number])
      : undefined;
  try {
    const sketch = updateSurveyDrawingSketchV1(String(req.params.sketchId), {
      title: body.title != null ? String(body.title) : undefined,
      sourceType: patchSourceType,
      layers: body.layers,
      notes: body.notes != null ? String(body.notes) : undefined,
    });
    if (body.layers) {
      try {
        syncFieldCheckAfterDrawingSaveV1(sketch.projectId, sketch.id);
      } catch {
        /* 材料同期失敗は図面保存を阻害しない */
      }
    }
    res.json({ sketch });
  } catch (e) {
    res.status(404).json({ error: String(e) });
  }
});

surveyV1Router.post(
  "/drawing-sketches/:sketchId/background",
  ...surveyV1Auth,
  (req: AuthedRequest, res) => {
    if (!assertSurveyRole(req, res)) return;
    const body = req.body ?? {};
    if (!body.imageBase64) {
      res.status(400).json({ error: "imageBase64 required" });
      return;
    }
    try {
      const sketch = saveSurveyDrawingSketchBackgroundV1({
        sketchId: String(req.params.sketchId),
        imageBase64: String(body.imageBase64),
        fileName: body.fileName != null ? String(body.fileName) : undefined,
        mimeType: body.mimeType != null ? String(body.mimeType) : undefined,
        canvasWidth:
          body.canvasWidth != null ? Number(body.canvasWidth) : undefined,
        canvasHeight:
          body.canvasHeight != null ? Number(body.canvasHeight) : undefined,
      });
      res.json({ sketch });
    } catch (e) {
      // String(Error) は "Error: …" になるため message のみ返す
      const msg = e instanceof Error ? e.message : String(e);
      const code = /sketch not found/i.test(msg) ? 404 : 400;
      res.status(code).json({ error: msg, code: /sketch not found/i.test(msg) ? "SKETCH_NOT_FOUND" : "BAD_REQUEST" });
    }
  }
);

/** FormData(file) / Base64 から間取り線を自動作図
 * 画像が届いたら必ず輪郭抽出を実行する */
surveyV1Router.post(
  "/drawing-sketches/:sketchId/auto-draw-lines",
  ...surveyV1Auth,
  async (req: AuthedRequest, res) => {
    if (!assertSurveyRole(req, res)) return;
    const sketchId = String(req.params.sketchId);
    const contentType = String(req.headers["content-type"] || "");
    const isMultipart = /multipart\/form-data/i.test(contentType);

    // multipart は JSON 未パースのため生ボディを読む
    let body: Record<string, unknown> = (req.body ?? {}) as Record<
      string,
      unknown
    >;
    let uploadBuffer: Buffer | null = null;
    let uploadFileName: string | null = null;

    if (isMultipart) {
      try {
        const raw = await readRequestBodyBufferV1(req);
        const parsed = parseMultipartBufferV1(raw, contentType);
        body = { ...parsed.fields };
        const part = pickMultipartImageV1(parsed);
        if (part) {
          uploadBuffer = part.data;
          uploadFileName = part.fileName || "sketch.jpg";
          // MIME 不正でも JPEG 名で解析継続
          if (
            !part.mimeType.startsWith("image/") &&
            part.data.length > 32
          ) {
            uploadFileName = uploadFileName.replace(/\.\w+$/, "") + ".jpg";
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        res.status(400).json({
          error: msg,
          code: "MULTIPART_PARSE_FAILED",
        });
        return;
      }
    }

    const sketch = getSurveyDrawingSketchV1(sketchId);
    const canvasW =
      Number(body.canvasWidth) ||
      sketch?.layers.canvasWidth ||
      800;
    const canvasH =
      Number(body.canvasHeight) ||
      sketch?.layers.canvasHeight ||
      600;
    const fileName =
      uploadFileName ??
      (body.fileName != null ? String(body.fileName) : null);
    const applyToCanvas = String(body.applyToCanvas ?? "true") !== "false";

    let lineResult;
    if (uploadBuffer && uploadBuffer.length > 32) {
      // FormData file 経路（本命）
      lineResult = await detectSketchLinesFromBufferV1({
        buffer: uploadBuffer,
        fileName: fileName ?? "sketch.jpg",
        canvasWidth: canvasW,
        canvasHeight: canvasH,
      });
    } else if (body.imageBase64) {
      // JSON Base64 互換経路
      lineResult = await detectSketchLinesFromBase64V1({
        imageBase64: String(body.imageBase64),
        fileName,
        canvasWidth: canvasW,
        canvasHeight: canvasH,
      });
    } else if (sketch?.backgroundImagePath) {
      const { detectSketchLinesFromImagePathV1 } = await import(
        "../../survey/survey-sketch-line-detect-v1.js"
      );
      lineResult = await detectSketchLinesFromImagePathV1({
        imagePath: sketch.backgroundImagePath,
        fileName:
          fileName ??
          sketch.backgroundImagePath.split("/").pop() ??
          null,
        canvasWidth: canvasW,
        canvasHeight: canvasH,
      });
    } else {
      // 画像未着のみ外枠（sketch 有無は問わない）
      const { buildFallbackOuterFramePathsV1 } = await import(
        "../../survey/survey-sketch-line-detect-v1.js"
      );
      lineResult = {
        schemaVersion: 1 as const,
        ok: true as const,
        usedFallback: true,
        reason: "empty_blob",
        fileName,
        paths: buildFallbackOuterFramePathsV1(canvasW, canvasH),
      };
    }

    let sketchAfter = sketch;
    if (sketch && applyToCanvas && lineResult.paths.length) {
      try {
        sketchAfter = mergeAutoPlotIntoSurveyDrawingV1(sketchId, {
          symbols: [],
          notes: [],
          paths: lineResult.paths,
        });
      } catch {
        // マージ失敗でも検出結果は返す
        sketchAfter = sketch;
      }
    }

    res.json({
      ok: true,
      lineDetect: lineResult,
      sketch: sketchAfter,
      // sketch 未登録でも 200（検出優先）
      sketchFound: Boolean(sketch),
    });
  }
);

surveyV1Router.get(
  "/drawing-sketches/:sketchId/ai-export",
  ...surveyV1Auth,
  (req: AuthedRequest, res) => {
    if (!assertSurveyRole(req, res)) return;
    try {
      const payload = exportSurveyDrawingAiJsonV1(String(req.params.sketchId));
      res.json({ export: payload });
    } catch (e) {
      res.status(404).json({ error: String(e) });
    }
  }
);

/** 現調 AI パイプライン v1 — 図面 + 音声ログ → 見積候補 · PDF ペイロード */
surveyV1Router.post(
  "/drawing-sketches/:sketchId/ai-pipeline",
  ...surveyV1Auth,
  async (req: AuthedRequest, res) => {
    if (!assertSurveyRole(req, res)) return;
    const result = await runSurveyAiPipelineV1SafeAsync({
      sketchId: String(req.params.sketchId),
      businessProjectId: req.body?.businessProjectId ?? null,
      voiceLog: Array.isArray(req.body?.voiceLog) ? req.body.voiceLog : [],
      runGridOcr: req.body?.runGridOcr !== false,
      applyOcrToSurveyNotes: req.body?.applyOcrToSurveyNotes !== false,
    });
    if (!result.ok) {
      res.status(503).json({
        error: result.error,
        userMessage: result.userMessage,
        code: result.code,
      });
      return;
    }
    res.json({ pipeline: result.pipeline });
  }
);

/** 方眼紙 OCR + 記号自動プロット v1 */
surveyV1Router.post(
  "/drawing-sketches/:sketchId/grid-ocr",
  ...surveyV1Auth,
  async (req: AuthedRequest, res) => {
    if (!assertSurveyRole(req, res)) return;
    const sketchId = String(req.params.sketchId);
    const sketch = getSurveyDrawingSketchV1(sketchId);
    if (!sketch) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const applyToCanvas = req.body?.applyToCanvas !== false;
    const applyToSurveyNotes = req.body?.applyToSurveyNotes !== false;

    const { ocr, autoPlot } = await runSurveyGridOcrWithLineDetectV1({
      imagePath: sketch.backgroundImagePath || null,
      fileName: sketch.backgroundImagePath
        ? sketch.backgroundImagePath.split("/").pop() ?? null
        : null,
      canvasWidth: sketch.layers.canvasWidth,
      canvasHeight: sketch.layers.canvasHeight,
      sketchNotes: sketch.notes,
      testHints:
        process.env.NODE_ENV === "test" && req.body?.testHints
          ? req.body.testHints
          : undefined,
    });

    let sketchAfter = sketch;
    if (
      applyToCanvas &&
      (autoPlot.symbols.length || autoPlot.paths.length)
    ) {
      try {
        sketchAfter = mergeAutoPlotIntoSurveyDrawingV1(sketchId, autoPlot);
      } catch (e) {
        // sketch not found でも OCR 結果は返す
        const msg = e instanceof Error ? e.message : String(e);
        if (!/sketch not found/i.test(msg)) throw e;
      }
    }

    let surveyNotesMapping = null;
    if (applyToSurveyNotes && ocr.marginMemos.length) {
      surveyNotesMapping = mapGridOcrMemosToSurveyNotesV1(sketch.projectId, ocr);
    }

    const allSymbols = [
      ...sketchAfter.layers.symbols,
      ...(sketchAfter.layers.editorV1?.symbols ?? []).map((s) => ({
        symbolType: s.symbolType,
        label: s.label,
        id: s.id,
      })),
    ];

    const symbolCountHandoff = allSymbols.length
      ? postSymbolCountsToAiEstimateEngineV2({
          sketchId,
          projectId: sketch.projectId,
          businessProjectId: sketch.businessProjectId,
          symbols: allSymbols,
          paths: sketchAfter.layers.paths,
        })
      : null;

    res.json({
      ocr,
      autoPlot,
      sketch: sketchAfter,
      surveyNotesMapping,
      symbolCountHandoff,
    });
  }
);

surveyV1Router.post(
  "/drawing-sketches/:sketchId/link-spec-photo",
  ...surveyV1Auth,
  (req: AuthedRequest, res) => {
    if (!assertSurveyRole(req, res)) return;
    const specPhotoSlotId = String(req.body?.specPhotoSlotId ?? "").trim();
    if (!specPhotoSlotId) {
      res.status(400).json({ error: "specPhotoSlotId required" });
      return;
    }
    try {
      const sketch = getSurveyDrawingSketchV1(String(req.params.sketchId));
      if (!sketch?.backgroundImagePath) {
        res.status(400).json({ error: "background photo not set" });
        return;
      }
      const businessProjectId = sketch.businessProjectId;
      if (!businessProjectId) {
        res.status(400).json({ error: "business project not linked" });
        return;
      }
      const ok = linkSurveyDrawingBackgroundToSpecSlotV1(
        businessProjectId,
        specPhotoSlotId,
        sketch.backgroundImagePath
      );
      if (!ok) {
        res.status(404).json({ error: "spec photo slot not found" });
        return;
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  }
);

surveyV1Router.delete("/drawing-sketches/:sketchId", ...surveyV1Auth, (req: AuthedRequest, res) => {
  if (!assertSurveyRole(req, res)) return;
  if (!deleteSurveyDrawingSketchV1(String(req.params.sketchId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});
