import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { findBusinessProjectIdForSurvey } from "../projects/project-pdf-auto-save.js";
import {
  emptySurveyDrawingLayersV1,
  type SurveyDrawingLayersV1,
  type SurveyDrawingSketchV1,
  type SurveyDrawingSourceType,
} from "./survey-drawing-v1-types.js";
import { surveyUploadsDir } from "./survey-store.js";

function parseLayers(raw: string | null | undefined): SurveyDrawingLayersV1 {
  if (!raw) return emptySurveyDrawingLayersV1();
  try {
    const parsed = JSON.parse(raw) as SurveyDrawingLayersV1;
    if (parsed?.version === 1) return parsed;
  } catch {
    /* fallback */
  }
  return emptySurveyDrawingLayersV1();
}

function rowToSketch(row: Record<string, unknown>): SurveyDrawingSketchV1 {
  const bgPath = String(row.background_image_path ?? "");
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    businessProjectId:
      row.business_project_id != null ? String(row.business_project_id) : null,
    title: String(row.title ?? "現調図面"),
    sourceType: String(row.source_type ?? "photo") as SurveyDrawingSourceType,
    backgroundImagePath: bgPath,
    backgroundImageUrl: bgPath ? `/uploads/survey/${bgPath}` : "",
    layers: parseLayers(row.layers_json as string),
    notes: String(row.notes ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function assertSurveyProject(projectId: string): void {
  const row = getDatabase()
    .prepare(`SELECT project_id FROM survey_projects WHERE project_id = ?`)
    .get(projectId);
  if (!row) throw new Error("survey project not found");
}

export function listSurveyDrawingSketchesV1(projectId: string): SurveyDrawingSketchV1[] {
  return getDatabase()
    .prepare(
      `SELECT * FROM survey_drawing_sketches WHERE project_id = ? ORDER BY updated_at DESC`
    )
    .all(projectId)
    .map((r) => rowToSketch(r as Record<string, unknown>));
}

export function getSurveyDrawingSketchV1(sketchId: string): SurveyDrawingSketchV1 | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM survey_drawing_sketches WHERE id = ?`)
    .get(sketchId) as Record<string, unknown> | undefined;
  return row ? rowToSketch(row) : null;
}

export function createSurveyDrawingSketchV1(input: {
  projectId: string;
  title?: string;
  sourceType?: SurveyDrawingSourceType;
  notes?: string;
}): SurveyDrawingSketchV1 {
  assertSurveyProject(input.projectId);
  const id = uuid();
  const now = new Date().toISOString();
  const businessProjectId = findBusinessProjectIdForSurvey(input.projectId);
  const layers = emptySurveyDrawingLayersV1();
  getDatabase()
    .prepare(
      `INSERT INTO survey_drawing_sketches (
        id, project_id, business_project_id, title, source_type,
        background_image_path, layers_json, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?)`
    )
    .run(
      id,
      input.projectId,
      businessProjectId,
      input.title ?? "現調図面",
      input.sourceType ?? "photo",
      JSON.stringify(layers),
      input.notes ?? "",
      now,
      now
    );
  return getSurveyDrawingSketchV1(id)!;
}

export function updateSurveyDrawingSketchV1(
  sketchId: string,
  patch: Partial<{
    title: string;
    sourceType: SurveyDrawingSourceType;
    layers: SurveyDrawingLayersV1;
    notes: string;
  }>
): SurveyDrawingSketchV1 {
  const existing = getSurveyDrawingSketchV1(sketchId);
  if (!existing) throw new Error("sketch not found");
  const now = new Date().toISOString();
  const nextTitle = patch.title ?? existing.title;
  const nextSource = patch.sourceType ?? existing.sourceType;
  const nextLayers = patch.layers ?? existing.layers;
  const nextNotes = patch.notes ?? existing.notes;
  getDatabase()
    .prepare(
      `UPDATE survey_drawing_sketches SET
        title = ?, source_type = ?, layers_json = ?, notes = ?, updated_at = ?
      WHERE id = ?`
    )
    .run(nextTitle, nextSource, JSON.stringify(nextLayers), nextNotes, now, sketchId);
  return getSurveyDrawingSketchV1(sketchId)!;
}

export function saveSurveyDrawingSketchBackgroundV1(input: {
  sketchId: string;
  imageBase64: string;
  fileName?: string;
  mimeType?: string;
}): SurveyDrawingSketchV1 {
  const sketch = getSurveyDrawingSketchV1(input.sketchId);
  if (!sketch) throw new Error("sketch not found");
  const mime = input.mimeType || "image/jpeg";
  const ext =
    mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const fname = `${input.sketchId}-bg-${Date.now()}.${ext}`;
  const dir = surveyUploadsDir(sketch.projectId, "drawings");
  fs.mkdirSync(dir, { recursive: true });
  const buf = Buffer.from(
    input.imageBase64.replace(/^data:[^;]+;base64,/, ""),
    "base64"
  );
  fs.writeFileSync(path.join(dir, fname), buf);
  const rel = `${sketch.projectId}/drawings/${fname}`;
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `UPDATE survey_drawing_sketches SET
        background_image_path = ?, source_type = 'photo', updated_at = ?
      WHERE id = ?`
    )
    .run(rel, now, input.sketchId);
  return getSurveyDrawingSketchV1(input.sketchId)!;
}

export function deleteSurveyDrawingSketchV1(sketchId: string): boolean {
  const sketch = getSurveyDrawingSketchV1(sketchId);
  if (!sketch) return false;
  if (sketch.backgroundImagePath) {
    const full = path.join(
      process.env.TISLY_UPLOADS_DIR || path.join(process.cwd(), "uploads"),
      "survey",
      sketch.backgroundImagePath
    );
    try {
      fs.unlinkSync(full);
    } catch {
      /* */
    }
  }
  getDatabase().prepare(`DELETE FROM survey_drawing_sketches WHERE id = ?`).run(sketchId);
  return true;
}
