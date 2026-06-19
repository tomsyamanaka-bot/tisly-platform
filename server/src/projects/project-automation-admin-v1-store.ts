/** 案件自動化エンジン v1.5 — テンプレート管理 */

import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import {
  getProjectTemplateV1,
  listProjectTemplatesV1,
} from "./project-automation-v1-store.js";
import type {
  PhotoTemplateItemV1,
  ProjectTemplateAdminInputV1,
  ProjectTemplateDetailV1,
  ProjectTemplateV1,
  SpecPhotoTemplateItemV1,
  TaskTemplateItemV1,
  TemplateItemInputV1,
  ToolTemplateItemV1,
} from "./project-automation-types.js";
import { seedSpecPhotoTemplatesForTemplateV1 } from "./spec-photo-slots-v1-store.js";

function rowToTaskTemplate(r: Record<string, unknown>): TaskTemplateItemV1 {
  return {
    id: String(r.id),
    projectTemplateId: String(r.project_template_id),
    label: String(r.label),
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function rowToToolTemplate(r: Record<string, unknown>): ToolTemplateItemV1 {
  return {
    id: String(r.id),
    projectTemplateId: String(r.project_template_id),
    label: String(r.label),
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function rowToPhotoTemplate(r: Record<string, unknown>): PhotoTemplateItemV1 {
  return {
    id: String(r.id),
    projectTemplateId: String(r.project_template_id),
    label: String(r.label),
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function rowToSpecPhotoTemplate(r: Record<string, unknown>): SpecPhotoTemplateItemV1 {
  return {
    id: String(r.id),
    projectTemplateId: String(r.project_template_id),
    label: String(r.label),
    sortOrder: Number(r.sort_order ?? 0),
  };
}

export function listTemplateCategoriesV1(): string[] {
  const rows = getDatabase()
    .prepare(
      `SELECT DISTINCT category FROM project_templates_v1 WHERE category != '' ORDER BY category ASC`
    )
    .all() as Array<{ category: string }>;
  return rows.map((r) => r.category);
}

export function createProjectTemplateV1(input: ProjectTemplateAdminInputV1): ProjectTemplateDetailV1 {
  const db = getDatabase();
  const id = `ptpl-${uuid().slice(0, 8)}`;
  const now = new Date().toISOString();
  const maxOrder = db
    .prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM project_templates_v1`)
    .get() as { m: number };
  db.prepare(
    `INSERT INTO project_templates_v1 (id, name, category, sub_category, description, active, sort_order, use_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(
    id,
    input.name.trim(),
    (input.category ?? "").trim(),
    (input.subCategory ?? "").trim(),
    input.description ?? null,
    input.active === false ? 0 : 1,
    input.sortOrder ?? Number(maxOrder.m) + 1,
    now,
    now
  );
  const tpl = getProjectTemplateV1(id);
  if (!tpl) throw new Error("create failed");
  seedSpecPhotoTemplatesForTemplateV1(id);
  return getProjectTemplateV1(id)!;
}

export function patchProjectTemplateV1(
  id: string,
  input: Partial<ProjectTemplateAdminInputV1>
): ProjectTemplateV1 | null {
  const db = getDatabase();
  const existing = db
    .prepare(`SELECT * FROM project_templates_v1 WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!existing) return null;
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE project_templates_v1 SET
      name = ?, category = ?, sub_category = ?, description = ?, active = ?, sort_order = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    input.name !== undefined ? input.name.trim() : String(existing.name),
    input.category !== undefined ? input.category.trim() : String(existing.category ?? ""),
    input.subCategory !== undefined ? input.subCategory.trim() : String(existing.sub_category ?? ""),
    input.description !== undefined ? input.description : existing.description,
    input.active !== undefined ? (input.active ? 1 : 0) : Number(existing.active ?? 1),
    input.sortOrder !== undefined ? input.sortOrder : Number(existing.sort_order ?? 0),
    now,
    id
  );
  return listProjectTemplatesV1(false).find((t) => t.id === id) ?? null;
}

export function deleteProjectTemplateV1(id: string): boolean {
  const r = getDatabase().prepare(`DELETE FROM project_templates_v1 WHERE id = ?`).run(id);
  return r.changes > 0;
}

export function reorderProjectTemplatesV1(orderedIds: string[]): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `UPDATE project_templates_v1 SET sort_order = ?, updated_at = ? WHERE id = ?`
  );
  orderedIds.forEach((id, i) => stmt.run(i, now, id));
}

function nextItemSortOrder(table: string, templateId: string): number {
  const row = getDatabase()
    .prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM ${table} WHERE project_template_id = ?`)
    .get(templateId) as { m: number };
  return Number(row.m) + 1;
}

export function createTaskTemplateItemV1(
  templateId: string,
  input: TemplateItemInputV1
): TaskTemplateItemV1 {
  const db = getDatabase();
  const id = `${templateId}-task-${uuid().slice(0, 6)}`;
  const sortOrder = input.sortOrder ?? nextItemSortOrder("task_templates_v1", templateId);
  db.prepare(
    `INSERT INTO task_templates_v1 (id, project_template_id, label, sort_order, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  ).run(id, templateId, input.label.trim(), sortOrder);
  return rowToTaskTemplate(
    db.prepare(`SELECT * FROM task_templates_v1 WHERE id = ?`).get(id) as Record<string, unknown>
  );
}

export function patchTaskTemplateItemV1(
  templateId: string,
  itemId: string,
  input: Partial<TemplateItemInputV1>
): TaskTemplateItemV1 | null {
  const db = getDatabase();
  const existing = db
    .prepare(`SELECT * FROM task_templates_v1 WHERE id = ? AND project_template_id = ?`)
    .get(itemId, templateId) as Record<string, unknown> | undefined;
  if (!existing) return null;
  db.prepare(`UPDATE task_templates_v1 SET label = ?, sort_order = ? WHERE id = ?`).run(
    input.label !== undefined ? input.label.trim() : String(existing.label),
    input.sortOrder !== undefined ? input.sortOrder : Number(existing.sort_order ?? 0),
    itemId
  );
  return rowToTaskTemplate(
    db.prepare(`SELECT * FROM task_templates_v1 WHERE id = ?`).get(itemId) as Record<string, unknown>
  );
}

export function deleteTaskTemplateItemV1(templateId: string, itemId: string): boolean {
  const r = getDatabase()
    .prepare(`DELETE FROM task_templates_v1 WHERE id = ? AND project_template_id = ?`)
    .run(itemId, templateId);
  return r.changes > 0;
}

export function reorderTaskTemplateItemsV1(templateId: string, orderedIds: string[]): void {
  const db = getDatabase();
  const stmt = db.prepare(
    `UPDATE task_templates_v1 SET sort_order = ? WHERE id = ? AND project_template_id = ?`
  );
  orderedIds.forEach((id, i) => stmt.run(i, id, templateId));
}

export function createToolTemplateItemV1(
  templateId: string,
  input: TemplateItemInputV1
): ToolTemplateItemV1 {
  const db = getDatabase();
  const id = `${templateId}-tool-${uuid().slice(0, 6)}`;
  const sortOrder = input.sortOrder ?? nextItemSortOrder("tool_templates_v1", templateId);
  db.prepare(
    `INSERT INTO tool_templates_v1 (id, project_template_id, label, sort_order, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  ).run(id, templateId, input.label.trim(), sortOrder);
  return rowToToolTemplate(
    db.prepare(`SELECT * FROM tool_templates_v1 WHERE id = ?`).get(id) as Record<string, unknown>
  );
}

export function patchToolTemplateItemV1(
  templateId: string,
  itemId: string,
  input: Partial<TemplateItemInputV1>
): ToolTemplateItemV1 | null {
  const db = getDatabase();
  const existing = db
    .prepare(`SELECT * FROM tool_templates_v1 WHERE id = ? AND project_template_id = ?`)
    .get(itemId, templateId) as Record<string, unknown> | undefined;
  if (!existing) return null;
  db.prepare(`UPDATE tool_templates_v1 SET label = ?, sort_order = ? WHERE id = ?`).run(
    input.label !== undefined ? input.label.trim() : String(existing.label),
    input.sortOrder !== undefined ? input.sortOrder : Number(existing.sort_order ?? 0),
    itemId
  );
  return rowToToolTemplate(
    db.prepare(`SELECT * FROM tool_templates_v1 WHERE id = ?`).get(itemId) as Record<string, unknown>
  );
}

export function deleteToolTemplateItemV1(templateId: string, itemId: string): boolean {
  const r = getDatabase()
    .prepare(`DELETE FROM tool_templates_v1 WHERE id = ? AND project_template_id = ?`)
    .run(itemId, templateId);
  return r.changes > 0;
}

export function reorderToolTemplateItemsV1(templateId: string, orderedIds: string[]): void {
  const db = getDatabase();
  const stmt = db.prepare(
    `UPDATE tool_templates_v1 SET sort_order = ? WHERE id = ? AND project_template_id = ?`
  );
  orderedIds.forEach((id, i) => stmt.run(i, id, templateId));
}

export function createPhotoTemplateItemV1(
  templateId: string,
  input: TemplateItemInputV1
): PhotoTemplateItemV1 {
  const db = getDatabase();
  const id = `${templateId}-photo-${uuid().slice(0, 6)}`;
  const sortOrder = input.sortOrder ?? nextItemSortOrder("photo_templates_v1", templateId);
  db.prepare(
    `INSERT INTO photo_templates_v1 (id, project_template_id, label, sort_order, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  ).run(id, templateId, input.label.trim(), sortOrder);
  return rowToPhotoTemplate(
    db.prepare(`SELECT * FROM photo_templates_v1 WHERE id = ?`).get(id) as Record<string, unknown>
  );
}

export function patchPhotoTemplateItemV1(
  templateId: string,
  itemId: string,
  input: Partial<TemplateItemInputV1>
): PhotoTemplateItemV1 | null {
  const db = getDatabase();
  const existing = db
    .prepare(`SELECT * FROM photo_templates_v1 WHERE id = ? AND project_template_id = ?`)
    .get(itemId, templateId) as Record<string, unknown> | undefined;
  if (!existing) return null;
  db.prepare(`UPDATE photo_templates_v1 SET label = ?, sort_order = ? WHERE id = ?`).run(
    input.label !== undefined ? input.label.trim() : String(existing.label),
    input.sortOrder !== undefined ? input.sortOrder : Number(existing.sort_order ?? 0),
    itemId
  );
  return rowToPhotoTemplate(
    db.prepare(`SELECT * FROM photo_templates_v1 WHERE id = ?`).get(itemId) as Record<string, unknown>
  );
}

export function deletePhotoTemplateItemV1(templateId: string, itemId: string): boolean {
  const r = getDatabase()
    .prepare(`DELETE FROM photo_templates_v1 WHERE id = ? AND project_template_id = ?`)
    .run(itemId, templateId);
  return r.changes > 0;
}

export function reorderPhotoTemplateItemsV1(templateId: string, orderedIds: string[]): void {
  const db = getDatabase();
  const stmt = db.prepare(
    `UPDATE photo_templates_v1 SET sort_order = ? WHERE id = ? AND project_template_id = ?`
  );
  orderedIds.forEach((id, i) => stmt.run(i, id, templateId));
}

export function createSpecPhotoTemplateItemV1(
  templateId: string,
  input: TemplateItemInputV1
): SpecPhotoTemplateItemV1 {
  const db = getDatabase();
  const id = `${templateId}-spec-${uuid().slice(0, 6)}`;
  const sortOrder = input.sortOrder ?? nextItemSortOrder("spec_photo_templates_v1", templateId);
  db.prepare(
    `INSERT INTO spec_photo_templates_v1 (id, project_template_id, label, sort_order, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  ).run(id, templateId, input.label.trim(), sortOrder);
  return rowToSpecPhotoTemplate(
    db.prepare(`SELECT * FROM spec_photo_templates_v1 WHERE id = ?`).get(id) as Record<string, unknown>
  );
}

export function patchSpecPhotoTemplateItemV1(
  templateId: string,
  itemId: string,
  input: Partial<TemplateItemInputV1>
): SpecPhotoTemplateItemV1 | null {
  const db = getDatabase();
  const existing = db
    .prepare(`SELECT * FROM spec_photo_templates_v1 WHERE id = ? AND project_template_id = ?`)
    .get(itemId, templateId) as Record<string, unknown> | undefined;
  if (!existing) return null;
  db.prepare(`UPDATE spec_photo_templates_v1 SET label = ?, sort_order = ? WHERE id = ?`).run(
    input.label !== undefined ? input.label.trim() : String(existing.label),
    input.sortOrder !== undefined ? input.sortOrder : Number(existing.sort_order ?? 0),
    itemId
  );
  return rowToSpecPhotoTemplate(
    db.prepare(`SELECT * FROM spec_photo_templates_v1 WHERE id = ?`).get(itemId) as Record<string, unknown>
  );
}

export function deleteSpecPhotoTemplateItemV1(templateId: string, itemId: string): boolean {
  const r = getDatabase()
    .prepare(`DELETE FROM spec_photo_templates_v1 WHERE id = ? AND project_template_id = ?`)
    .run(itemId, templateId);
  return r.changes > 0;
}

export function reorderSpecPhotoTemplateItemsV1(templateId: string, orderedIds: string[]): void {
  const db = getDatabase();
  const stmt = db.prepare(
    `UPDATE spec_photo_templates_v1 SET sort_order = ? WHERE id = ? AND project_template_id = ?`
  );
  orderedIds.forEach((id, i) => stmt.run(i, id, templateId));
}
