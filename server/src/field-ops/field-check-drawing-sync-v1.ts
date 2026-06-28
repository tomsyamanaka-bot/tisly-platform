/**
 * 図面プロット ➔ 材料チェック（field-check-v1）同期 v1
 * material-mapper-v1 の結果を
 * field_check_items へマージする
 */
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { findBusinessProjectIdForSurvey } from "../projects/project-pdf-auto-save.js";
import {
  listSurveyDrawingSketchesV1,
  getSurveyDrawingSketchV1,
} from "../survey/survey-drawing-v1-store.js";
import { buildSurveyDrawingAiExport } from "../survey/survey-drawing-v1-types.js";
import {
  mapSurveyDrawingExportToMaterialsV1,
  type MaterialMapperResultV1,
} from "../shared/utils/material-mapper-v1.js";
import type { FieldCheckItemV1, ProjectRefV1 } from "./field-ops-types.js";
import { listFieldCheckItemsV1 } from "./field-check-v1-store.js";

export const FIELD_CHECK_DRAWING_SYNC_V1_SCHEMA = "field-check-drawing-sync-v1" as const;

export interface FieldCheckDrawingSyncStateV1 {
  projectSource: ProjectRefV1["source"];
  projectId: string;
  sketchId: string | null;
  contentHash: string;
  symbolCount: number;
  lineCount: number;
  syncedAt: string;
}

export interface FieldCheckDrawingSyncResultV1 {
  schemaVersion: typeof FIELD_CHECK_DRAWING_SYNC_V1_SCHEMA;
  ref: ProjectRefV1;
  sketchId: string | null;
  mapper: MaterialMapperResultV1;
  inserted: number;
  updated: number;
  removed: number;
  items: FieldCheckItemV1[];
  syncState: FieldCheckDrawingSyncStateV1;
  /** 図面と DB の指紋が一致しない場合 true */
  needsResync: boolean;
}

function loadSyncState(ref: ProjectRefV1): FieldCheckDrawingSyncStateV1 | null {
  const row = getDatabase()
    .prepare(
      `SELECT * FROM field_check_drawing_sync_state
       WHERE project_source = ? AND project_id = ?`
    )
    .get(ref.source, ref.projectId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    projectSource: String(row.project_source) as ProjectRefV1["source"],
    projectId: String(row.project_id),
    sketchId: row.sketch_id != null ? String(row.sketch_id) : null,
    contentHash: String(row.content_hash ?? ""),
    symbolCount: Number(row.symbol_count ?? 0),
    lineCount: Number(row.line_count ?? 0),
    syncedAt: String(row.synced_at),
  };
}

function saveSyncState(
  ref: ProjectRefV1,
  sketchId: string | null,
  mapper: MaterialMapperResultV1
): FieldCheckDrawingSyncStateV1 {
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO field_check_drawing_sync_state (
        project_source, project_id, sketch_id, content_hash,
        symbol_count, line_count, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_source, project_id) DO UPDATE SET
        sketch_id = excluded.sketch_id,
        content_hash = excluded.content_hash,
        symbol_count = excluded.symbol_count,
        line_count = excluded.line_count,
        synced_at = excluded.synced_at`
    )
    .run(
      ref.source,
      ref.projectId,
      sketchId,
      mapper.contentHash,
      mapper.totalSymbols,
      mapper.lines.length,
      now
    );
  return {
    projectSource: ref.source,
    projectId: ref.projectId,
    sketchId,
    contentHash: mapper.contentHash,
    symbolCount: mapper.totalSymbols,
    lineCount: mapper.lines.length,
    syncedAt: now,
  };
}

function resolveSurveyProjectId(ref: ProjectRefV1): string | null {
  if (ref.source === "survey") return ref.projectId;
  const bp = getDatabase()
    .prepare(
      `SELECT survey_project_id FROM business_projects
       WHERE id = ? AND deleted_at IS NULL LIMIT 1`
    )
    .get(ref.projectId) as { survey_project_id?: string | null } | undefined;
  const fromBp = bp?.survey_project_id?.trim();
  if (fromBp) return fromBp;
  const link = getDatabase()
    .prepare(
      `SELECT project_id FROM survey_drawing_sketches
       WHERE business_project_id = ?
       ORDER BY updated_at DESC LIMIT 1`
    )
    .get(ref.projectId) as { project_id?: string } | undefined;
  return link?.project_id ? String(link.project_id) : null;
}

function resolveSketchForRef(ref: ProjectRefV1, sketchId?: string | null) {
  if (sketchId) {
    const sketch = getSurveyDrawingSketchV1(sketchId);
    if (sketch) return sketch;
  }
  const surveyProjectId = resolveSurveyProjectId(ref);
  if (!surveyProjectId) return null;
  const sketches = listSurveyDrawingSketchesV1(surveyProjectId);
  return sketches[0] ?? null;
}

function enrichItemsWithSyncMeta(
  items: FieldCheckItemV1[],
  syncState: FieldCheckDrawingSyncStateV1 | null,
  currentHash: string | null
): FieldCheckItemV1[] {
  const stale = !!syncState && !!currentHash && syncState.contentHash !== currentHash;
  return items.map((item) => ({
    ...item,
    drawingSync:
      item.source === "auto" && item.syncKey
        ? stale
          ? "stale"
          : "synced"
        : null,
  }));
}

/**
 * 図面から算出した部材を
 * field_check_items へ upsert
 */
export function syncFieldCheckFromDrawingV1(input: {
  ref: ProjectRefV1;
  sketchId?: string | null;
  checkDate?: string;
}): FieldCheckDrawingSyncResultV1 {
  const sketch = resolveSketchForRef(input.ref, input.sketchId);
  if (!sketch) {
    throw new Error("drawing sketch not found for project");
  }

  const exportData = buildSurveyDrawingAiExport(sketch);
  const mapper = mapSurveyDrawingExportToMaterialsV1(exportData);
  const db = getDatabase();
  const now = new Date().toISOString();

  const existingRows = db
    .prepare(
      `SELECT id, sync_key, quantity, checked, source FROM field_check_items
       WHERE project_source = ? AND project_id = ? AND source = 'auto'`
    )
    .all(input.ref.source, input.ref.projectId) as Array<Record<string, unknown>>;

  const existingByKey = new Map<string, Record<string, unknown>>();
  for (const row of existingRows) {
    const key = row.sync_key != null ? String(row.sync_key) : "";
    if (key) existingByKey.set(key, row);
  }

  let inserted = 0;
  let updated = 0;
  const nextKeys = new Set<string>();
  let sortOrder = Number(
    (
      db
        .prepare(
          `SELECT COALESCE(MAX(sort_order), -1) as n FROM field_check_items
           WHERE project_source = ? AND project_id = ?`
        )
        .get(input.ref.source, input.ref.projectId) as { n: number }
    ).n
  );

  const upsert = db.prepare(
    `INSERT INTO field_check_items (
      id, project_source, project_id, label, category, quantity, unit,
      material_id, source, sync_key, checked, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'auto', ?, 0, ?, ?, ?)`
  );
  const updateQty = db.prepare(
    `UPDATE field_check_items SET
      label = ?, category = ?, quantity = ?, unit = ?, material_id = ?,
      updated_at = ?
     WHERE id = ?`
  );

  for (const line of mapper.lines) {
    nextKeys.add(line.syncKey);
    const prev = existingByKey.get(line.syncKey);
    if (prev) {
      updateQty.run(
        line.label,
        line.category,
        line.quantity,
        line.unit,
        line.materialId,
        now,
        String(prev.id)
      );
      updated += 1;
    } else {
      sortOrder += 1;
      upsert.run(
        uuid(),
        input.ref.source,
        input.ref.projectId,
        line.label,
        line.category,
        line.quantity,
        line.unit,
        line.materialId,
        line.syncKey,
        sortOrder,
        now,
        now
      );
      inserted += 1;
    }
  }

  let removed = 0;
  const deleteStale = db.prepare(`DELETE FROM field_check_items WHERE id = ?`);
  for (const row of existingRows) {
    const key = row.sync_key != null ? String(row.sync_key) : "";
    if (key && !nextKeys.has(key)) {
      deleteStale.run(String(row.id));
      removed += 1;
    }
  }

  const syncState = saveSyncState(input.ref, sketch.id, mapper);
  const items = enrichItemsWithSyncMeta(
    listFieldCheckItemsV1(input.ref, input.checkDate),
    syncState,
    mapper.contentHash
  );

  return {
    schemaVersion: FIELD_CHECK_DRAWING_SYNC_V1_SCHEMA,
    ref: input.ref,
    sketchId: sketch.id,
    mapper,
    inserted,
    updated,
    removed,
    items,
    syncState,
    needsResync: false,
  };
}

/** 同期状態のみ取得（書き込みなし） */
export function getFieldCheckDrawingSyncStatusV1(input: {
  ref: ProjectRefV1;
  sketchId?: string | null;
  checkDate?: string;
}): {
  syncState: FieldCheckDrawingSyncStateV1 | null;
  mapper: MaterialMapperResultV1 | null;
  items: FieldCheckItemV1[];
  needsResync: boolean;
} {
  const syncState = loadSyncState(input.ref);
  const sketch = resolveSketchForRef(input.ref, input.sketchId);
  let mapper: MaterialMapperResultV1 | null = null;
  if (sketch) {
    mapper = mapSurveyDrawingExportToMaterialsV1(buildSurveyDrawingAiExport(sketch));
  }
  const needsResync =
    !!mapper && !!syncState && syncState.contentHash !== mapper.contentHash;
  const items = enrichItemsWithSyncMeta(
    listFieldCheckItemsV1(input.ref, input.checkDate),
    syncState,
    mapper?.contentHash ?? null
  );
  return { syncState, mapper, items, needsResync };
}

/** 図面保存後 — survey / business 両方へ同期 */
export function syncFieldCheckAfterDrawingSaveV1(surveyProjectId: string, sketchId: string): void {
  const refs: ProjectRefV1[] = [{ source: "survey", projectId: surveyProjectId }];
  const businessId = findBusinessProjectIdForSurvey(surveyProjectId);
  if (businessId) {
    refs.push({ source: "business", projectId: businessId });
  }
  for (const ref of refs) {
    try {
      syncFieldCheckFromDrawingV1({ ref, sketchId });
    } catch {
      /* 初回は部材ゼロでも続行 */
    }
  }
}
