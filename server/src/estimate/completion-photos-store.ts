import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { businessUploadsDir, getBusinessProject } from "../business/business-store.js";
import { markProjectPdfStaleV1 } from "../projects/project-pdf-stale-v1.js";

export interface CompletionPhotoV1 {
  id: string;
  businessProjectId: string;
  title: string;
  url: string;
  sortOrder: number;
  createdAt: string;
}

const MAX_COMPLETION_PHOTOS = 30;

function rowToCompletionPhoto(r: Record<string, unknown>): CompletionPhotoV1 {
  const businessProjectId = String(r.business_project_id);
  const photoPath = String(r.photo_path);
  const fileName = path.basename(photoPath);
  return {
    id: String(r.id),
    businessProjectId,
    title: r.title != null ? String(r.title) : "",
    url: `/uploads/business/${businessProjectId}/completion/${fileName}`,
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: String(r.created_at),
  };
}

function nextSortOrder(businessProjectId: string): number {
  const row = getDatabase()
    .prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 as n FROM completion_photos WHERE business_project_id = ?`)
    .get(businessProjectId) as { n: number };
  return row?.n ?? 0;
}

export function listCompletionPhotosV1(businessProjectId: string): CompletionPhotoV1[] {
  const rows = getDatabase()
    .prepare(
      `SELECT id, business_project_id, photo_path, title, sort_order, created_at
       FROM completion_photos WHERE business_project_id = ?
       ORDER BY sort_order ASC, created_at ASC, id ASC`
    )
    .all(businessProjectId) as Record<string, unknown>[];
  return rows.map(rowToCompletionPhoto);
}

export function addCompletionPhotoV1(
  businessProjectId: string,
  input: {
    imageBase64: string;
    fileName?: string;
    title?: string;
    uploadedBy?: string;
  }
): CompletionPhotoV1 {
  if (!getBusinessProject(businessProjectId)) throw new Error("project not found");
  const countRow = getDatabase()
    .prepare(`SELECT COUNT(*) as c FROM completion_photos WHERE business_project_id = ?`)
    .get(businessProjectId) as { c: number };
  if ((countRow?.c ?? 0) >= MAX_COMPLETION_PHOTOS) {
    throw new Error("photo limit reached (max 30)");
  }
  const id = uuid();
  const ext = path.extname(input.fileName ?? ".jpg") || ".jpg";
  const outName = `${id}${ext}`;
  const dir = businessUploadsDir(businessProjectId, "completion");
  fs.writeFileSync(path.join(dir, outName), Buffer.from(input.imageBase64, "base64"));
  const sortOrder = nextSortOrder(businessProjectId);
  const title = input.title?.trim() ?? "";
  getDatabase()
    .prepare(
      `INSERT INTO completion_photos (id, business_project_id, photo_path, title, sort_order, created_at, uploaded_by)
       VALUES (?, ?, ?, ?, ?, datetime('now'), ?)`
    )
    .run(id, businessProjectId, outName, title || null, sortOrder, input.uploadedBy ?? null);
  markProjectPdfStaleV1(businessProjectId, "completion");
  return rowToCompletionPhoto({
    id,
    business_project_id: businessProjectId,
    photo_path: outName,
    title,
    sort_order: sortOrder,
    created_at: new Date().toISOString(),
  });
}

export function updateCompletionPhotoV1(
  businessProjectId: string,
  photoId: string,
  patch: { title?: string; imageBase64?: string; fileName?: string }
): CompletionPhotoV1 | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM completion_photos WHERE id = ? AND business_project_id = ?`)
    .get(photoId, businessProjectId) as Record<string, unknown> | undefined;
  if (!row) return null;

  if (patch.imageBase64) {
    const ext = path.extname(patch.fileName ?? ".jpg") || ".jpg";
    const outName = `${photoId}${ext}`;
    const dir = businessUploadsDir(businessProjectId, "completion");
    const oldPath = String(row.photo_path);
    try {
      fs.unlinkSync(path.join(dir, oldPath));
    } catch {
      /* */
    }
    fs.writeFileSync(path.join(dir, outName), Buffer.from(patch.imageBase64, "base64"));
    getDatabase()
      .prepare(`UPDATE completion_photos SET photo_path = ? WHERE id = ?`)
      .run(outName, photoId);
  }
  if (patch.title !== undefined) {
    getDatabase()
      .prepare(`UPDATE completion_photos SET title = ? WHERE id = ?`)
      .run(patch.title.trim(), photoId);
  }

  const updated = getDatabase()
    .prepare(`SELECT * FROM completion_photos WHERE id = ?`)
    .get(photoId) as Record<string, unknown>;
  if (patch.imageBase64 || patch.title !== undefined) {
    markProjectPdfStaleV1(businessProjectId, "completion");
  }
  return rowToCompletionPhoto(updated);
}

export function moveCompletionPhotoV1(
  businessProjectId: string,
  photoId: string,
  direction: "up" | "down"
): CompletionPhotoV1[] | null {
  if (!getBusinessProject(businessProjectId)) return null;
  const photos = listCompletionPhotosV1(businessProjectId);
  const idx = photos.findIndex((p) => p.id === photoId);
  if (idx < 0) return null;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= photos.length) return photos;

  const current = photos[idx]!;
  const neighbor = photos[swapIdx]!;
  const db = getDatabase();
  db.prepare(`UPDATE completion_photos SET sort_order = ? WHERE id = ? AND business_project_id = ?`).run(
    neighbor.sortOrder,
    current.id,
    businessProjectId
  );
  db.prepare(`UPDATE completion_photos SET sort_order = ? WHERE id = ? AND business_project_id = ?`).run(
    current.sortOrder,
    neighbor.id,
    businessProjectId
  );
  markProjectPdfStaleV1(businessProjectId, "completion");
  return listCompletionPhotosV1(businessProjectId);
}

export function deleteCompletionPhotoV1(businessProjectId: string, photoId: string): boolean {
  const row = getDatabase()
    .prepare(`SELECT photo_path FROM completion_photos WHERE id = ? AND business_project_id = ?`)
    .get(photoId, businessProjectId) as { photo_path: string } | undefined;
  if (!row) return false;
  const dir = businessUploadsDir(businessProjectId, "completion");
  try {
    fs.unlinkSync(path.join(dir, row.photo_path));
  } catch {
    /* */
  }
  const r = getDatabase()
    .prepare(`DELETE FROM completion_photos WHERE id = ? AND business_project_id = ?`)
    .run(photoId, businessProjectId);
  if (r.changes > 0) markProjectPdfStaleV1(businessProjectId, "completion");
  return r.changes > 0;
}
