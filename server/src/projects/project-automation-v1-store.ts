/** 案件自動化エンジン v1 — テンプレート適用・進捗計算 */

import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getProjectDocumentsStatusV1 } from "./project-documents-v1.js";
import type {
  AutomationProgressV1,
  PhotoTemplateItemV1,
  ProjectAutomationBundleV1,
  ProjectPhotoSlotV1,
  ProjectTaskV1,
  ProjectTemplateDetailV1,
  ProjectTemplateV1,
  ProjectToolV1,
  SpecPhotoTemplateItemV1,
  TaskTemplateItemV1,
  ToolTemplateItemV1,
} from "./project-automation-types.js";
import {
  listSpecProjectPhotoSlotsV1,
  seedSpecProjectPhotosFromTemplateV1,
} from "./spec-photo-slots-v1-store.js";

function pct(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}

function rowToTemplate(r: Record<string, unknown>): ProjectTemplateV1 {
  return {
    id: String(r.id),
    name: String(r.name),
    category: String(r.category ?? ""),
    subCategory: String(r.sub_category ?? ""),
    description: r.description != null ? String(r.description) : null,
    active: Number(r.active ?? 1) === 1,
    sortOrder: Number(r.sort_order ?? 0),
    taskCount: Number(r.task_count ?? 0),
    toolCount: Number(r.tool_count ?? 0),
    photoCount: Number(r.photo_count ?? 0),
    useCount: Number(r.use_count ?? 0),
  };
}

export function listProjectTemplatesV1(
  activeOnly = true,
  opts?: { q?: string; category?: string; sort?: "order" | "popular" }
): ProjectTemplateV1[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (activeOnly) clauses.push("pt.active = 1");
  if (opts?.category) {
    clauses.push("pt.category = ?");
    params.push(opts.category);
  }
  if (opts?.q) {
    clauses.push("(pt.name LIKE ? OR pt.category LIKE ? OR pt.sub_category LIKE ?)");
    const like = `%${opts.q}%`;
    params.push(like, like, like);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const orderBy =
    opts?.sort === "popular"
      ? "pt.use_count DESC, pt.sort_order ASC, pt.name ASC"
      : "pt.sort_order ASC, pt.name ASC";
  const rows = getDatabase()
    .prepare(
      `SELECT pt.*,
        (SELECT COUNT(*) FROM task_templates_v1 t WHERE t.project_template_id = pt.id) AS task_count,
        (SELECT COUNT(*) FROM tool_templates_v1 t WHERE t.project_template_id = pt.id) AS tool_count,
        (SELECT COUNT(*) FROM photo_templates_v1 t WHERE t.project_template_id = pt.id) AS photo_count
       FROM project_templates_v1 pt
       ${where}
       ORDER BY ${orderBy}`
    )
    .all(...params) as Array<Record<string, unknown>>;
  return rows.map(rowToTemplate);
}

export function getProjectTemplateV1(id: string): ProjectTemplateDetailV1 | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM project_templates_v1 WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  const base = rowToTemplate(row);
  const tasks = getDatabase()
    .prepare(
      `SELECT * FROM task_templates_v1 WHERE project_template_id = ? ORDER BY sort_order ASC, label ASC`
    )
    .all(id) as Array<Record<string, unknown>>;
  const tools = getDatabase()
    .prepare(
      `SELECT * FROM tool_templates_v1 WHERE project_template_id = ? ORDER BY sort_order ASC, label ASC`
    )
    .all(id) as Array<Record<string, unknown>>;
  const photos = getDatabase()
    .prepare(
      `SELECT * FROM photo_templates_v1 WHERE project_template_id = ? ORDER BY sort_order ASC, label ASC`
    )
    .all(id) as Array<Record<string, unknown>>;
  const specPhotos = getDatabase()
    .prepare(
      `SELECT * FROM spec_photo_templates_v1 WHERE project_template_id = ? ORDER BY sort_order ASC, label ASC`
    )
    .all(id) as Array<Record<string, unknown>>;
  return {
    ...base,
    tasks: tasks.map(rowToTaskTemplate),
    tools: tools.map(rowToToolTemplate),
    photos: photos.map(rowToPhotoTemplate),
    specPhotos: specPhotos.map(rowToSpecPhotoTemplate),
  };
}

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

function rowToTask(r: Record<string, unknown>): ProjectTaskV1 {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    templateItemId: r.template_item_id != null ? String(r.template_item_id) : null,
    label: String(r.label),
    done: Number(r.done ?? 0) === 1,
    sortOrder: Number(r.sort_order ?? 0),
    doneAt: r.done_at != null ? String(r.done_at) : null,
    memo: r.memo != null ? String(r.memo) : null,
  };
}

function rowToTool(r: Record<string, unknown>): ProjectToolV1 {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    templateItemId: r.template_item_id != null ? String(r.template_item_id) : null,
    label: String(r.label),
    checked: Number(r.checked ?? 0) === 1,
    sortOrder: Number(r.sort_order ?? 0),
    checkedAt: r.checked_at != null ? String(r.checked_at) : null,
    memo: r.memo != null ? String(r.memo) : null,
    forgottenMemo: r.forgotten_memo != null ? String(r.forgotten_memo) : null,
  };
}

function rowToPhotoSlot(r: Record<string, unknown>): ProjectPhotoSlotV1 {
  const photoPath = r.photo_path != null ? String(r.photo_path) : null;
  const documentId = r.document_id != null ? String(r.document_id) : null;
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    templateItemId: r.template_item_id != null ? String(r.template_item_id) : null,
    label: String(r.label),
    photoPath,
    documentId,
    sortOrder: Number(r.sort_order ?? 0),
    shotAt: r.shot_at != null ? String(r.shot_at) : null,
    shot: Boolean(photoPath || documentId),
    caption: r.caption != null ? String(r.caption) : null,
  };
}

export function applyProjectTemplateV1(projectId: string, templateId: string): ProjectAutomationBundleV1 {
  const tpl = getProjectTemplateV1(templateId);
  if (!tpl) throw new Error("template not found");

  const db = getDatabase();
  const now = new Date().toISOString();

  db.prepare(`DELETE FROM project_tasks_v1 WHERE project_id = ?`).run(projectId);
  db.prepare(`DELETE FROM project_tools_v1 WHERE project_id = ?`).run(projectId);
  db.prepare(`DELETE FROM project_photos_v1 WHERE project_id = ?`).run(projectId);
  db.prepare(`DELETE FROM spec_project_photos_v1 WHERE project_id = ?`).run(projectId);

  const insertTask = db.prepare(
    `INSERT INTO project_tasks_v1 (id, project_id, template_item_id, label, done, sort_order, done_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, NULL, ?, ?)`
  );
  const insertTool = db.prepare(
    `INSERT INTO project_tools_v1 (id, project_id, template_item_id, label, checked, sort_order, checked_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, NULL, ?, ?)`
  );
  const insertPhoto = db.prepare(
    `INSERT INTO project_photos_v1 (id, project_id, template_item_id, label, photo_path, document_id, sort_order, shot_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, NULL, ?, ?)`
  );

  for (const task of tpl.tasks) {
    insertTask.run(uuid(), projectId, task.id, task.label, task.sortOrder, now, now);
  }
  for (const tool of tpl.tools) {
    insertTool.run(uuid(), projectId, tool.id, tool.label, tool.sortOrder, now, now);
  }
  for (const photo of tpl.photos) {
    insertPhoto.run(uuid(), projectId, photo.id, photo.label, photo.sortOrder, now, now);
  }
  seedSpecProjectPhotosFromTemplateV1(projectId, templateId);

  db.prepare(
    `UPDATE business_projects SET project_template_id = ?, updated_at = ? WHERE id = ?`
  ).run(templateId, now, projectId);

  db.prepare(
    `UPDATE project_templates_v1 SET use_count = COALESCE(use_count, 0) + 1, updated_at = ? WHERE id = ?`
  ).run(now, templateId);

  return getProjectAutomationBundleV1(projectId);
}

export function listProjectTasksV1(projectId: string): ProjectTaskV1[] {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM project_tasks_v1 WHERE project_id = ? ORDER BY sort_order ASC, label ASC`
    )
    .all(projectId) as Array<Record<string, unknown>>;
  return rows.map(rowToTask);
}

export function listProjectToolsV1(projectId: string): ProjectToolV1[] {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM project_tools_v1 WHERE project_id = ? ORDER BY sort_order ASC, label ASC`
    )
    .all(projectId) as Array<Record<string, unknown>>;
  return rows.map(rowToTool);
}

export function listProjectPhotoSlotsV1(projectId: string): ProjectPhotoSlotV1[] {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM project_photos_v1 WHERE project_id = ? ORDER BY sort_order ASC, label ASC`
    )
    .all(projectId) as Array<Record<string, unknown>>;
  return rows.map(rowToPhotoSlot);
}

export function computeAutomationProgressV1(
  projectId: string,
  tasks?: ProjectTaskV1[],
  tools?: ProjectToolV1[],
  photos?: ProjectPhotoSlotV1[]
): AutomationProgressV1 {
  const taskList = tasks ?? listProjectTasksV1(projectId);
  const toolList = tools ?? listProjectToolsV1(projectId);
  const photoList = photos ?? listProjectPhotoSlotsV1(projectId);
  const specPhotoList = listSpecProjectPhotoSlotsV1(projectId);

  const tasksDone = taskList.filter((t) => t.done).length;
  const toolsChecked = toolList.filter((t) => t.checked).length;
  const photosShot = photoList.filter((p) => p.shot).length;
  const specPhotosShot = specPhotoList.filter((p) => p.shot).length;

  const docStatus = getProjectDocumentsStatusV1(projectId);
  let docDone = 0;
  const docTotal = 4;
  if (docStatus?.documents?.length) {
    docDone = docStatus.documents.filter((d) => d.hasPdf).length;
  }

  return {
    tasks: { done: tasksDone, total: taskList.length, percent: pct(tasksDone, taskList.length) },
    tools: { checked: toolsChecked, total: toolList.length, percent: pct(toolsChecked, toolList.length) },
    photos: { shot: photosShot, total: photoList.length, percent: pct(photosShot, photoList.length) },
    specPhotos: {
      shot: specPhotosShot,
      total: specPhotoList.length,
      percent: pct(specPhotosShot, specPhotoList.length),
    },
    documents: { done: docDone, total: docTotal, percent: pct(docDone, docTotal) },
  };
}

export function getProjectAutomationBundleV1(projectId: string): ProjectAutomationBundleV1 {
  const row = getDatabase()
    .prepare(`SELECT project_template_id FROM business_projects WHERE id = ?`)
    .get(projectId) as { project_template_id?: string | null } | undefined;

  const templateId = row?.project_template_id ?? null;
  let templateName: string | null = null;
  if (templateId) {
    const tplRow = getDatabase()
      .prepare(`SELECT name FROM project_templates_v1 WHERE id = ?`)
      .get(templateId) as { name: string } | undefined;
    templateName = tplRow?.name ?? null;
  }

  const tasks = listProjectTasksV1(projectId);
  const tools = listProjectToolsV1(projectId);
  const photos = listProjectPhotoSlotsV1(projectId);
  const specPhotos = listSpecProjectPhotoSlotsV1(projectId);
  const progress = computeAutomationProgressV1(projectId, tasks, tools, photos);

  return {
    templateId,
    templateName,
    tasks,
    tools,
    photos,
    specPhotos,
    progress,
    unshotPhotos: photos.filter((p) => !p.shot),
    unshotSpecPhotos: specPhotos.filter((p) => !p.shot),
  };
}

export function patchProjectTaskV1(
  projectId: string,
  taskId: string,
  input: { done?: boolean; memo?: string | null; label?: string; sortOrder?: number }
): ProjectTaskV1 | null {
  const db = getDatabase();
  const existing = db
    .prepare(`SELECT * FROM project_tasks_v1 WHERE id = ? AND project_id = ?`)
    .get(taskId, projectId) as Record<string, unknown> | undefined;
  if (!existing) return null;
  const now = new Date().toISOString();
  const done = input.done !== undefined ? (input.done ? 1 : 0) : Number(existing.done ?? 0);
  const doneAt =
    input.done !== undefined ? (input.done ? now : null) : (existing.done_at as string | null);
  const memo = input.memo !== undefined ? input.memo : (existing.memo as string | null);
  const label = input.label !== undefined ? input.label : String(existing.label);
  const sortOrder =
    input.sortOrder !== undefined ? input.sortOrder : Number(existing.sort_order ?? 0);
  db.prepare(
    `UPDATE project_tasks_v1 SET done = ?, done_at = ?, memo = ?, label = ?, sort_order = ?, updated_at = ?
     WHERE id = ? AND project_id = ?`
  ).run(done, doneAt, memo ?? null, label, sortOrder, now, taskId, projectId);
  const row = db
    .prepare(`SELECT * FROM project_tasks_v1 WHERE id = ?`)
    .get(taskId) as Record<string, unknown>;
  return rowToTask(row);
}

export function addProjectTaskV1(projectId: string, label: string): ProjectTaskV1 {
  const db = getDatabase();
  const now = new Date().toISOString();
  const maxOrder = db
    .prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM project_tasks_v1 WHERE project_id = ?`)
    .get(projectId) as { m: number };
  const id = uuid();
  const sortOrder = Number(maxOrder.m) + 1;
  db.prepare(
    `INSERT INTO project_tasks_v1 (id, project_id, template_item_id, label, done, sort_order, done_at, memo, created_at, updated_at)
     VALUES (?, ?, NULL, ?, 0, ?, NULL, NULL, ?, ?)`
  ).run(id, projectId, label, sortOrder, now, now);
  return rowToTask(
    db.prepare(`SELECT * FROM project_tasks_v1 WHERE id = ?`).get(id) as Record<string, unknown>
  );
}

export function deleteProjectTaskV1(projectId: string, taskId: string): boolean {
  const r = getDatabase()
    .prepare(`DELETE FROM project_tasks_v1 WHERE id = ? AND project_id = ?`)
    .run(taskId, projectId);
  return r.changes > 0;
}

export function reorderProjectTasksV1(projectId: string, orderedIds: string[]): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `UPDATE project_tasks_v1 SET sort_order = ?, updated_at = ? WHERE id = ? AND project_id = ?`
  );
  orderedIds.forEach((id, i) => stmt.run(i, now, id, projectId));
}

export function patchProjectToolV1(
  projectId: string,
  toolId: string,
  input: {
    checked?: boolean;
    memo?: string | null;
    forgottenMemo?: string | null;
    label?: string;
    sortOrder?: number;
  }
): ProjectToolV1 | null {
  const db = getDatabase();
  const existing = db
    .prepare(`SELECT * FROM project_tools_v1 WHERE id = ? AND project_id = ?`)
    .get(toolId, projectId) as Record<string, unknown> | undefined;
  if (!existing) return null;
  const now = new Date().toISOString();
  const checked =
    input.checked !== undefined ? (input.checked ? 1 : 0) : Number(existing.checked ?? 0);
  const checkedAt =
    input.checked !== undefined
      ? input.checked
        ? now
        : null
      : (existing.checked_at as string | null);
  const memo = input.memo !== undefined ? input.memo : (existing.memo as string | null);
  const forgottenMemo =
    input.forgottenMemo !== undefined
      ? input.forgottenMemo
      : (existing.forgotten_memo as string | null);
  const label = input.label !== undefined ? input.label : String(existing.label);
  const sortOrder =
    input.sortOrder !== undefined ? input.sortOrder : Number(existing.sort_order ?? 0);
  db.prepare(
    `UPDATE project_tools_v1 SET checked = ?, checked_at = ?, memo = ?, forgotten_memo = ?, label = ?, sort_order = ?, updated_at = ?
     WHERE id = ? AND project_id = ?`
  ).run(
    checked,
    checkedAt,
    memo ?? null,
    forgottenMemo ?? null,
    label,
    sortOrder,
    now,
    toolId,
    projectId
  );
  const row = db
    .prepare(`SELECT * FROM project_tools_v1 WHERE id = ?`)
    .get(toolId) as Record<string, unknown>;
  return rowToTool(row);
}

export function addProjectToolV1(projectId: string, label: string): ProjectToolV1 {
  const db = getDatabase();
  const now = new Date().toISOString();
  const maxOrder = db
    .prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM project_tools_v1 WHERE project_id = ?`)
    .get(projectId) as { m: number };
  const id = uuid();
  const sortOrder = Number(maxOrder.m) + 1;
  db.prepare(
    `INSERT INTO project_tools_v1 (id, project_id, template_item_id, label, checked, sort_order, checked_at, memo, forgotten_memo, created_at, updated_at)
     VALUES (?, ?, NULL, ?, 0, ?, NULL, NULL, NULL, ?, ?)`
  ).run(id, projectId, label, sortOrder, now, now);
  return rowToTool(
    db.prepare(`SELECT * FROM project_tools_v1 WHERE id = ?`).get(id) as Record<string, unknown>
  );
}

export function deleteProjectToolV1(projectId: string, toolId: string): boolean {
  const r = getDatabase()
    .prepare(`DELETE FROM project_tools_v1 WHERE id = ? AND project_id = ?`)
    .run(toolId, projectId);
  return r.changes > 0;
}

export function reorderProjectToolsV1(projectId: string, orderedIds: string[]): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `UPDATE project_tools_v1 SET sort_order = ?, updated_at = ? WHERE id = ? AND project_id = ?`
  );
  orderedIds.forEach((id, i) => stmt.run(i, now, id, projectId));
}

export function linkProjectPhotoSlotV1(
  projectId: string,
  photoSlotId: string,
  input: { documentId?: string | null; photoPath?: string | null; caption?: string | null }
): ProjectPhotoSlotV1 | null {
  const db = getDatabase();
  const existing = db
    .prepare(`SELECT * FROM project_photos_v1 WHERE id = ? AND project_id = ?`)
    .get(photoSlotId, projectId) as Record<string, unknown> | undefined;
  if (!existing) return null;
  const now = new Date().toISOString();
  const documentId = input.documentId !== undefined ? input.documentId : existing.document_id;
  const photoPath = input.photoPath !== undefined ? input.photoPath : existing.photo_path;
  const caption = input.caption !== undefined ? input.caption : existing.caption;
  const shot = Boolean(documentId || photoPath);
  db.prepare(
    `UPDATE project_photos_v1 SET document_id = ?, photo_path = ?, caption = ?, shot_at = ?, updated_at = ?
     WHERE id = ? AND project_id = ?`
  ).run(
    documentId ?? null,
    photoPath ?? null,
    caption ?? null,
    shot ? now : null,
    now,
    photoSlotId,
    projectId
  );
  const row = db
    .prepare(`SELECT * FROM project_photos_v1 WHERE id = ?`)
    .get(photoSlotId) as Record<string, unknown>;
  return rowToPhotoSlot(row);
}

export function listUnshotProjectPhotosV1(projectId: string): ProjectPhotoSlotV1[] {
  return getProjectAutomationBundleV1(projectId).unshotPhotos;
}
