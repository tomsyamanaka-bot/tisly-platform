import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import type { FieldCheckItemV1, FieldCheckSessionV1, ProjectRefV1 } from "./field-ops-types.js";
import { aggregateNeedsFromTemplates, listProjectWorkTemplateIds } from "./work-templates-store.js";

function rowToItem(r: Record<string, unknown>): FieldCheckItemV1 {
  return {
    id: String(r.id),
    projectSource: String(r.project_source) as ProjectRefV1["source"],
    projectId: String(r.project_id),
    label: String(r.label),
    category: String(r.category ?? ""),
    quantity: Number(r.quantity ?? 1),
    unit: r.unit != null ? String(r.unit) : null,
    materialId: r.material_id != null ? String(r.material_id) : null,
    source: String(r.source) === "manual" ? "manual" : "auto",
    checked: Number(r.checked ?? 0) === 1,
    checkedAt: r.checked_at != null ? String(r.checked_at) : null,
    checkedBy: r.checked_by != null ? String(r.checked_by) : null,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function rowToSession(r: Record<string, unknown>): FieldCheckSessionV1 {
  return {
    id: String(r.id),
    projectSource: String(r.project_source) as ProjectRefV1["source"],
    projectId: String(r.project_id),
    checkedCount: Number(r.checked_count ?? 0),
    totalCount: Number(r.total_count ?? 0),
    allChecked: Number(r.all_checked ?? 0) === 1,
    completedBy: r.completed_by != null ? String(r.completed_by) : null,
    completedAt: String(r.completed_at),
    memo: r.memo != null ? String(r.memo) : null,
  };
}

export function listFieldCheckItemsV1(ref: ProjectRefV1): FieldCheckItemV1[] {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM field_check_items
       WHERE project_source = ? AND project_id = ?
       ORDER BY sort_order ASC, label ASC`
    )
    .all(ref.source, ref.projectId) as Array<Record<string, unknown>>;
  return rows.map(rowToItem);
}

export function generateFieldCheckItemsV1(ref: ProjectRefV1): FieldCheckItemV1[] {
  const db = getDatabase();
  const templateIds = listProjectWorkTemplateIds(ref);
  const needs = aggregateNeedsFromTemplates(templateIds);
  db.prepare(
    `DELETE FROM field_check_items WHERE project_source = ? AND project_id = ? AND source = 'auto'`
  ).run(ref.source, ref.projectId);
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO field_check_items (
      id, project_source, project_id, label, category, quantity, unit,
      material_id, source, checked, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'auto', 0, ?, ?, ?)`
  );
  let order = 0;
  for (const n of needs) {
    insert.run(
      uuid(),
      ref.source,
      ref.projectId,
      n.label,
      n.category ?? (n.itemType === "tool" ? "工具" : "部材"),
      n.qty,
      n.unit,
      n.materialId,
      order++,
      now,
      now
    );
  }
  return listFieldCheckItemsV1(ref);
}

export function addManualFieldCheckItemV1(
  ref: ProjectRefV1,
  input: { label: string; quantity?: number; unit?: string; category?: string }
): FieldCheckItemV1 {
  const id = uuid();
  const now = new Date().toISOString();
  const maxOrder = getDatabase()
    .prepare(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 as n FROM field_check_items
       WHERE project_source = ? AND project_id = ?`
    )
    .get(ref.source, ref.projectId) as { n: number };
  getDatabase()
    .prepare(
      `INSERT INTO field_check_items (
        id, project_source, project_id, label, category, quantity, unit,
        material_id, source, checked, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'manual', 0, ?, ?, ?)`
    )
    .run(
      id,
      ref.source,
      ref.projectId,
      input.label,
      input.category ?? "その他",
      input.quantity ?? 1,
      input.unit ?? null,
      maxOrder.n,
      now,
      now
    );
  return listFieldCheckItemsV1(ref).find((i) => i.id === id)!;
}

export function updateFieldCheckItemV1(
  itemId: string,
  patch: { checked?: boolean; checkedBy?: string | null; label?: string; quantity?: number }
): FieldCheckItemV1 | null {
  const now = new Date().toISOString();
  const row = getDatabase()
    .prepare(`SELECT * FROM field_check_items WHERE id = ?`)
    .get(itemId) as Record<string, unknown> | undefined;
  if (!row) return null;
  const checked = patch.checked !== undefined ? (patch.checked ? 1 : 0) : Number(row.checked ?? 0);
  const checkedAt =
    patch.checked !== undefined ? (patch.checked ? now : null) : row.checked_at != null ? String(row.checked_at) : null;
  const checkedBy =
    patch.checkedBy !== undefined
      ? patch.checkedBy
      : row.checked_by != null
        ? String(row.checked_by)
        : null;
  getDatabase()
    .prepare(
      `UPDATE field_check_items SET
        checked = ?,
        checked_at = ?,
        checked_by = ?,
        label = COALESCE(?, label),
        quantity = COALESCE(?, quantity),
        updated_at = ?
      WHERE id = ?`
    )
    .run(
      checked,
      checkedAt,
      checkedBy,
      patch.label ?? null,
      patch.quantity ?? null,
      now,
      itemId
    );
  const updated = getDatabase()
    .prepare(`SELECT * FROM field_check_items WHERE id = ?`)
    .get(itemId) as Record<string, unknown>;
  return rowToItem(updated);
}

export function completeFieldCheckSessionV1(
  ref: ProjectRefV1,
  completedBy: string | null,
  memo?: string | null
): FieldCheckSessionV1 {
  const items = listFieldCheckItemsV1(ref);
  const checkedCount = items.filter((i) => i.checked).length;
  const totalCount = items.length;
  const allChecked = totalCount > 0 && checkedCount === totalCount;
  const id = uuid();
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO field_check_sessions (
        id, project_source, project_id, checked_count, total_count,
        all_checked, completed_by, completed_at, memo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      ref.source,
      ref.projectId,
      checkedCount,
      totalCount,
      allChecked ? 1 : 0,
      completedBy,
      now,
      memo ?? null
    );
  return rowToSession(
    getDatabase().prepare(`SELECT * FROM field_check_sessions WHERE id = ?`).get(id) as Record<string, unknown>
  );
}

export function listFieldCheckSessionsV1(ref: ProjectRefV1): FieldCheckSessionV1[] {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM field_check_sessions
       WHERE project_source = ? AND project_id = ?
       ORDER BY completed_at DESC`
    )
    .all(ref.source, ref.projectId) as Array<Record<string, unknown>>;
  return rows.map(rowToSession);
}
