import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";

export type DrawingVersionKind = "survey" | "construction" | "as_built";

export interface DrawingVersion {
  id: string;
  projectId: string;
  versionKind: DrawingVersionKind;
  versionNo: number;
  title: string;
  filePath: string;
  drawingPlanId: string | null;
  notes: string;
  createdAt: string;
}

export function createDrawingVersion(input: {
  projectId: string;
  versionKind: DrawingVersionKind;
  title: string;
  filePath?: string;
  drawingPlanId?: string;
  notes?: string;
}): DrawingVersion {
  const max = (
    getDatabase()
      .prepare(
        `SELECT COALESCE(MAX(version_no), 0) as m FROM business_drawing_versions
         WHERE project_id = ? AND version_kind = ?`
      )
      .get(input.projectId, input.versionKind) as { m: number }
  ).m;
  const id = `DV-${uuid().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  const versionNo = max + 1;
  getDatabase()
    .prepare(
      `INSERT INTO business_drawing_versions
       (id, project_id, version_kind, version_no, title, file_path, drawing_plan_id, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.projectId,
      input.versionKind,
      versionNo,
      input.title,
      input.filePath ?? "",
      input.drawingPlanId ?? null,
      input.notes ?? "",
      now
    );
  return getDrawingVersion(id)!;
}

export function getDrawingVersion(id: string): DrawingVersion | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM business_drawing_versions WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToVersion(row) : null;
}

export function listDrawingVersions(projectId: string): DrawingVersion[] {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM business_drawing_versions WHERE project_id = ?
       ORDER BY version_kind, version_no ASC`
    )
    .all(projectId) as Array<Record<string, unknown>>;
  return rows.map(rowToVersion);
}

function rowToVersion(r: Record<string, unknown>): DrawingVersion {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    versionKind: String(r.version_kind) as DrawingVersionKind,
    versionNo: Number(r.version_no),
    title: String(r.title),
    filePath: String(r.file_path ?? ""),
    drawingPlanId: r.drawing_plan_id != null ? String(r.drawing_plan_id) : null,
    notes: String(r.notes ?? ""),
    createdAt: String(r.created_at),
  };
}
