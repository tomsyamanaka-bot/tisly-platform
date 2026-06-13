/** 現場チェックリスト — テンプレート CRUD + 月間集計 */

import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import type {
  FieldChecklistMonthlyStatsV1,
  FieldChecklistTemplateItemV1,
  FieldChecklistTemplateV1,
} from "./field-ops-types.js";

function rowToTemplateItem(r: Record<string, unknown>): FieldChecklistTemplateItemV1 {
  return {
    id: String(r.id),
    templateId: String(r.template_id),
    label: String(r.label),
    sortOrder: Number(r.sort_order ?? 0),
    photoRequired: Number(r.photo_required ?? 0) === 1,
  };
}

function listItemsForTemplate(templateId: string): FieldChecklistTemplateItemV1[] {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM field_checklist_template_items WHERE template_id = ? ORDER BY sort_order ASC, label ASC`
    )
    .all(templateId) as Array<Record<string, unknown>>;
  return rows.map(rowToTemplateItem);
}

function rowToTemplate(r: Record<string, unknown>, withItems: boolean): FieldChecklistTemplateV1 {
  const id = String(r.id);
  return {
    id,
    name: String(r.name),
    description: r.description != null ? String(r.description) : null,
    active: Number(r.active ?? 1) === 1,
    sortOrder: Number(r.sort_order ?? 0),
    items: withItems ? listItemsForTemplate(id) : [],
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function listFieldChecklistTemplatesV1(activeOnly = true): FieldChecklistTemplateV1[] {
  const where = activeOnly ? "WHERE active = 1" : "";
  const rows = getDatabase()
    .prepare(`SELECT * FROM field_checklist_templates ${where} ORDER BY sort_order ASC, name ASC`)
    .all() as Array<Record<string, unknown>>;
  return rows.map((r) => rowToTemplate(r, true));
}

export function getFieldChecklistTemplateV1(id: string): FieldChecklistTemplateV1 | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM field_checklist_templates WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToTemplate(row, true) : null;
}

export function getFieldChecklistTemplateByNameV1(name: string): FieldChecklistTemplateV1 | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM field_checklist_templates WHERE name = ? AND active = 1 LIMIT 1`)
    .get(name) as Record<string, unknown> | undefined;
  return row ? rowToTemplate(row, true) : null;
}

export function createFieldChecklistTemplateV1(input: {
  name: string;
  description?: string | null;
  active?: boolean;
  sortOrder?: number;
  items?: Array<{ label: string; photoRequired?: boolean }>;
}): FieldChecklistTemplateV1 {
  const db = getDatabase();
  const id = uuid();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO field_checklist_templates (id, name, description, active, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.name.trim(),
    input.description?.trim() ?? null,
    input.active !== false ? 1 : 0,
    input.sortOrder ?? 99,
    now,
    now
  );
  replaceTemplateItems(id, input.items ?? []);
  return getFieldChecklistTemplateV1(id)!;
}

function replaceTemplateItems(
  templateId: string,
  items: Array<{ label: string; photoRequired?: boolean }>
): void {
  const db = getDatabase();
  db.prepare(`DELETE FROM field_checklist_template_items WHERE template_id = ?`).run(templateId);
  const insert = db.prepare(
    `INSERT INTO field_checklist_template_items (id, template_id, label, sort_order, photo_required, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`
  );
  items.forEach((it, i) => {
    if (!it.label?.trim()) return;
    insert.run(uuid(), templateId, it.label.trim(), i, it.photoRequired ? 1 : 0);
  });
}

export function updateFieldChecklistTemplateV1(
  id: string,
  patch: {
    name?: string;
    description?: string | null;
    active?: boolean;
    sortOrder?: number;
    items?: Array<{ label: string; photoRequired?: boolean }>;
  }
): FieldChecklistTemplateV1 | null {
  const db = getDatabase();
  const existing = getFieldChecklistTemplateV1(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE field_checklist_templates SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      active = COALESCE(?, active),
      sort_order = COALESCE(?, sort_order),
      updated_at = ?
     WHERE id = ?`
  ).run(
    patch.name?.trim() ?? null,
    patch.description !== undefined ? patch.description : null,
    patch.active !== undefined ? (patch.active ? 1 : 0) : null,
    patch.sortOrder ?? null,
    now,
    id
  );
  if (patch.items) replaceTemplateItems(id, patch.items);
  return getFieldChecklistTemplateV1(id);
}

export function deleteFieldChecklistTemplateV1(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare(`DELETE FROM field_checklist_templates WHERE id = ?`).run(id);
  return (result.changes ?? 0) > 0;
}

export function duplicateFieldChecklistTemplateV1(id: string): FieldChecklistTemplateV1 | null {
  const src = getFieldChecklistTemplateV1(id);
  if (!src) return null;
  return createFieldChecklistTemplateV1({
    name: `${src.name}（コピー）`,
    description: src.description,
    active: src.active,
    sortOrder: src.sortOrder + 1,
    items: src.items.map((it) => ({ label: it.label, photoRequired: it.photoRequired })),
  });
}

export function getFieldChecklistMonthlyStatsV1(month?: string): FieldChecklistMonthlyStatsV1 {
  const m = month ?? new Date().toISOString().slice(0, 7);
  const prefix = `${m}%`;
  const db = getDatabase();

  const projectRow = db
    .prepare(
      `SELECT COUNT(DISTINCT project_source || ':' || project_id) as c
       FROM completion_checklist_items
       WHERE created_at LIKE ?`
    )
    .get(prefix) as { c: number };

  const itemRow = db
    .prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN checked = 1 THEN 1 ELSE 0 END) as checked
       FROM completion_checklist_items
       WHERE created_at LIKE ?`
    )
    .get(prefix) as { total: number; checked: number };

  const missedRow = db
    .prepare(
      `SELECT COUNT(*) as c FROM completion_checklist_items ci
       INNER JOIN project_work_sessions ws
         ON ws.project_source = ci.project_source AND ws.project_id = ci.project_id
       WHERE ci.checked = 0 AND ws.completion_time IS NOT NULL AND ws.work_date LIKE ?`
    )
    .get(prefix) as { c: number };

  const totalItems = Number(itemRow?.total ?? 0);
  const checkedItems = Number(itemRow?.checked ?? 0);
  const missedItems = Number(missedRow?.c ?? 0);
  const confirmationRate = totalItems ? Math.round((checkedItems / totalItems) * 1000) / 10 : 0;

  return {
    month: m,
    projectCount: Number(projectRow?.c ?? 0),
    totalItems,
    checkedItems,
    missedItems,
    confirmationRate,
  };
}
