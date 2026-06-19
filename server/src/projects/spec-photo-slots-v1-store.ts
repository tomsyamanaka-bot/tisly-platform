/** 仕様書 PDF v2 — 仕様書写真スロット（テンプレート・案件） */

import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import type { SpecPhotoTemplateItemV1, SpecProjectPhotoSlotV1 } from "./project-automation-types.js";

export const STANDARD_SPEC_PHOTO_LABELS_V1 = [
  "建物外観",
  "玄関",
  "設置予定位置",
  "配線ルート",
  "盤内",
  "ネットワーク機器",
  "問題箇所",
  "その他",
] as const;

function rowToSpecPhotoTemplate(r: Record<string, unknown>): SpecPhotoTemplateItemV1 {
  return {
    id: String(r.id),
    projectTemplateId: String(r.project_template_id),
    label: String(r.label),
    sortOrder: Number(r.sort_order ?? 0),
    required: Number(r.required ?? 0) === 1,
    memo: r.memo != null ? String(r.memo) : null,
    active: Number(r.active ?? 1) === 1,
  };
}

function rowToSpecPhotoSlot(r: Record<string, unknown>): SpecProjectPhotoSlotV1 {
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
    required: Number(r.required ?? 0) === 1,
    memo: r.memo != null ? String(r.memo) : null,
    active: Number(r.active ?? 1) === 1,
  };
}

export function listSpecPhotoTemplatesV1(projectTemplateId: string): SpecPhotoTemplateItemV1[] {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM spec_photo_templates_v1 WHERE project_template_id = ? ORDER BY sort_order ASC, label ASC`
    )
    .all(projectTemplateId) as Array<Record<string, unknown>>;
  return rows.map(rowToSpecPhotoTemplate);
}

export function listSpecProjectPhotoSlotsV1(
  projectId: string,
  opts?: { activeOnly?: boolean }
): SpecProjectPhotoSlotV1[] {
  const activeOnly = opts?.activeOnly ?? false;
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM spec_project_photos_v1 WHERE project_id = ? ORDER BY sort_order ASC, label ASC`
    )
    .all(projectId) as Array<Record<string, unknown>>;
  const slots = rows.map(rowToSpecPhotoSlot);
  return activeOnly ? slots.filter((s) => s.active) : slots;
}

export function seedSpecPhotoTemplatesForTemplateV1(projectTemplateId: string): void {
  const db = getDatabase();
  const existing = db
    .prepare(`SELECT COUNT(*) AS c FROM spec_photo_templates_v1 WHERE project_template_id = ?`)
    .get(projectTemplateId) as { c: number };
  if (existing.c > 0) return;
  const insert = db.prepare(
    `INSERT INTO spec_photo_templates_v1 (id, project_template_id, label, sort_order, required, memo, active, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, 1, datetime('now'))`
  );
  STANDARD_SPEC_PHOTO_LABELS_V1.forEach((label, i) => {
    const required = i < 4 ? 1 : 0;
    insert.run(`${projectTemplateId}-spec-${i}`, projectTemplateId, label, i, required);
  });
}

export function seedSpecProjectPhotosFromTemplateV1(projectId: string, projectTemplateId: string): void {
  const db = getDatabase();
  const existing = db
    .prepare(`SELECT COUNT(*) AS c FROM spec_project_photos_v1 WHERE project_id = ?`)
    .get(projectId) as { c: number };
  if (existing.c > 0) return;
  const templates = listSpecPhotoTemplatesV1(projectTemplateId);
  if (!templates.length) return;
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO spec_project_photos_v1 (id, project_id, template_item_id, label, photo_path, document_id, sort_order, shot_at, caption, required, memo, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, NULL, NULL, ?, ?, ?, ?, ?)`
  );
  for (const tpl of templates) {
    insert.run(
      uuid(),
      projectId,
      tpl.id,
      tpl.label,
      tpl.sortOrder,
      tpl.required ? 1 : 0,
      tpl.memo,
      tpl.active ? 1 : 0,
      now,
      now
    );
  }
}

export function linkSpecProjectPhotoSlotV1(
  projectId: string,
  photoSlotId: string,
  input: { documentId?: string | null; photoPath?: string | null; caption?: string | null }
): SpecProjectPhotoSlotV1 | null {
  const db = getDatabase();
  const existing = db
    .prepare(`SELECT * FROM spec_project_photos_v1 WHERE id = ? AND project_id = ?`)
    .get(photoSlotId, projectId) as Record<string, unknown> | undefined;
  if (!existing) return null;
  const now = new Date().toISOString();
  const documentId = input.documentId !== undefined ? input.documentId : existing.document_id;
  const photoPath = input.photoPath !== undefined ? input.photoPath : existing.photo_path;
  const caption = input.caption !== undefined ? input.caption : existing.caption;
  const shot = Boolean(documentId || photoPath);
  db.prepare(
    `UPDATE spec_project_photos_v1 SET document_id = ?, photo_path = ?, caption = ?, shot_at = ?, updated_at = ?
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
    .prepare(`SELECT * FROM spec_project_photos_v1 WHERE id = ?`)
    .get(photoSlotId) as Record<string, unknown>;
  return rowToSpecPhotoSlot(row);
}

export function reorderSpecProjectPhotosV1(projectId: string, orderedIds: string[]): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `UPDATE spec_project_photos_v1 SET sort_order = ?, updated_at = ? WHERE id = ? AND project_id = ?`
  );
  orderedIds.forEach((id, i) => stmt.run(i, now, id, projectId));
}

export function updateSpecProjectPhotoSlotV1(
  projectId: string,
  photoSlotId: string,
  patch: {
    label?: string;
    required?: boolean;
    memo?: string | null;
    active?: boolean;
    sortOrder?: number;
  }
): SpecProjectPhotoSlotV1 | null {
  const db = getDatabase();
  const existing = db
    .prepare(`SELECT * FROM spec_project_photos_v1 WHERE id = ? AND project_id = ?`)
    .get(photoSlotId, projectId) as Record<string, unknown> | undefined;
  if (!existing) return null;

  const label = patch.label !== undefined ? String(patch.label).trim() || String(existing.label) : String(existing.label);
  const required = patch.required !== undefined ? (patch.required ? 1 : 0) : Number(existing.required ?? 0);
  const memo = patch.memo !== undefined ? patch.memo : existing.memo;
  const active = patch.active !== undefined ? (patch.active ? 1 : 0) : Number(existing.active ?? 1);
  const sortOrder =
    patch.sortOrder !== undefined ? Number(patch.sortOrder) : Number(existing.sort_order ?? 0);
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE spec_project_photos_v1 SET label = ?, required = ?, memo = ?, active = ?, sort_order = ?, updated_at = ?
     WHERE id = ? AND project_id = ?`
  ).run(label, required, memo ?? null, active, sortOrder, now, photoSlotId, projectId);

  const row = db
    .prepare(`SELECT * FROM spec_project_photos_v1 WHERE id = ?`)
    .get(photoSlotId) as Record<string, unknown>;
  return rowToSpecPhotoSlot(row);
}

export function listUnshotSpecProjectPhotosV1(projectId: string): SpecProjectPhotoSlotV1[] {
  return listSpecProjectPhotoSlotsV1(projectId, { activeOnly: true }).filter((p) => !p.shot);
}

export function computeSpecPhotoProgressV1(projectId: string): {
  shot: number;
  total: number;
  percent: number;
} {
  const photos = listSpecProjectPhotoSlotsV1(projectId, { activeOnly: true });
  const shot = photos.filter((p) => p.shot).length;
  const total = photos.length;
  const percent = total <= 0 ? 0 : Math.round((shot / total) * 100);
  return { shot, total, percent };
}
