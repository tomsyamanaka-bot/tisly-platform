import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { findBusinessProjectIdForSurvey } from "../projects/project-pdf-auto-save.js";
import {
  buildSurveyDrawingAiExport,
  emptySurveyDrawingLayersV2,
  migrateLayersToV2,
  normalizeAiWallSvgV1,
  normalizePath,
  pathLengthPx,
  SURVEY_DRAWING_DRAWING_VERSION,
  SURVEY_DRAWING_SCHEMA_VERSION,
  type SurveyDrawingAiExportV1,
  type SurveyDrawingLayersV2,
  type SurveyDrawingSketchV1,
  type SurveyDrawingSourceType,
} from "./survey-drawing-v1-types.js";
import { surveyUploadsDir } from "./survey-store.js";

function parseLayers(raw: string | null | undefined): SurveyDrawingLayersV2 {
  if (!raw) return emptySurveyDrawingLayersV2();
  try {
    return migrateLayersToV2(JSON.parse(raw));
  } catch {
    return emptySurveyDrawingLayersV2();
  }
}

function normalizeLayersForSave(layers: SurveyDrawingLayersV2): SurveyDrawingLayersV2 {
  const aiWallSvg = normalizeAiWallSvgV1(layers.aiWallSvg);
  return {
    schemaVersion: SURVEY_DRAWING_SCHEMA_VERSION,
    drawingVersion: SURVEY_DRAWING_DRAWING_VERSION,
    canvasWidth: Number(layers.canvasWidth) || 800,
    canvasHeight: Number(layers.canvasHeight) || 600,
    paths: (layers.paths ?? []).map((p) =>
      normalizePath({
        ...p,
        lengthPx: pathLengthPx(p.points ?? []),
      })
    ),
    symbols: (layers.symbols ?? []).map((s) => ({
      ...s,
      rotation: Number(s.rotation) || 0,
      scale: Number(s.scale) || 1,
    })),
    notes: layers.notes ?? [],
    viewport: layers.viewport ?? { scale: 1, offsetX: 0, offsetY: 0 },
    editorV1: layers.editorV1 ?? undefined,
    // Gemini SVG 背景を PATCH 永続化
    aiWallSvg: aiWallSvg ?? null,
  };
}

function rowToSketch(row: Record<string, unknown>): SurveyDrawingSketchV1 {
  const bgPath = String(row.background_image_path ?? "");
  const layers = parseLayers(row.layers_json as string);
  const bgUrl = bgPath ? `/uploads/survey/${bgPath}` : "";
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    businessProjectId:
      row.business_project_id != null ? String(row.business_project_id) : null,
    title: String(row.title ?? "現調図面"),
    sourceType: String(row.source_type ?? "photo") as SurveyDrawingSourceType,
    backgroundImagePath: bgPath,
    backgroundImageUrl: bgUrl,
    backgroundImage: bgPath
      ? {
          path: bgPath,
          url: bgUrl,
          width: layers.canvasWidth,
          height: layers.canvasHeight,
        }
      : null,
    layers,
    notes: String(row.notes ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    schemaVersion: SURVEY_DRAWING_SCHEMA_VERSION,
    drawingVersion: SURVEY_DRAWING_DRAWING_VERSION,
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
  const layers = emptySurveyDrawingLayersV2();
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
    layers: SurveyDrawingLayersV2;
    notes: string;
  }>
): SurveyDrawingSketchV1 {
  const existing = getSurveyDrawingSketchV1(sketchId);
  if (!existing) throw new Error("sketch not found");
  const now = new Date().toISOString();
  const nextTitle = patch.title ?? existing.title;
  const nextSource = patch.sourceType ?? existing.sourceType;
  const nextLayers = normalizeLayersForSave(patch.layers ?? existing.layers);
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
  canvasWidth?: number;
  canvasHeight?: number;
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
  const layers = normalizeLayersForSave({
    ...sketch.layers,
    canvasWidth: input.canvasWidth ?? sketch.layers.canvasWidth,
    canvasHeight: input.canvasHeight ?? sketch.layers.canvasHeight,
  });
  getDatabase()
    .prepare(
      `UPDATE survey_drawing_sketches SET
        background_image_path = ?, source_type = 'photo', layers_json = ?, updated_at = ?
      WHERE id = ?`
    )
    .run(rel, JSON.stringify(layers), now, input.sketchId);
  return getSurveyDrawingSketchV1(input.sketchId)!;
}

export function exportSurveyDrawingAiJsonV1(sketchId: string): SurveyDrawingAiExportV1 {
  const sketch = getSurveyDrawingSketchV1(sketchId);
  if (!sketch) throw new Error("sketch not found");
  return buildSurveyDrawingAiExport(sketch);
}

/**
 * OCR 自動プロットを
 * 既存レイヤーへマージ（手動記号は保持）
 */
export function mergeAutoPlotIntoSurveyDrawingV1(
  sketchId: string,
  autoPlot: {
    symbols: SurveyDrawingLayersV2["symbols"];
    notes: SurveyDrawingLayersV2["notes"];
    /** 間取り線（自動作図） */
    paths?: SurveyDrawingLayersV2["paths"];
  }
): SurveyDrawingSketchV1 {
  const sketch = getSurveyDrawingSketchV1(sketchId);
  if (!sketch) throw new Error("sketch not found");

  const existingIds = new Set(sketch.layers.symbols.map((s) => s.id));
  const newSymbols = autoPlot.symbols.filter((s) => !existingIds.has(s.id));
  const existingNoteIds = new Set(sketch.layers.notes.map((n) => n.id));
  const newNotes = autoPlot.notes.filter((n) => !existingNoteIds.has(n.id));
  const existingPathIds = new Set(sketch.layers.paths.map((p) => p.id));
  const newPaths = (autoPlot.paths ?? []).filter(
    (p) => !existingPathIds.has(p.id)
  );

  const layers = normalizeLayersForSave({
    ...sketch.layers,
    symbols: [...sketch.layers.symbols, ...newSymbols],
    notes: [...sketch.layers.notes, ...newNotes],
    paths: [...sketch.layers.paths, ...newPaths],
  });

  return updateSurveyDrawingSketchV1(sketchId, { layers });
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
