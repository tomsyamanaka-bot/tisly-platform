import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { archiveInstallPhotoToRemote, installPhotosDir } from "../qnap/install-photo-archive.js";

/** Field install photo categories (Phase 401–420). */
export const INSTALL_PHOTO_TYPES = [
  "before",
  "after",
  "wiring",
  "device_label",
  "panel",
  "test_result",
  "install",
] as const;

export type InstallPhotoType = (typeof INSTALL_PHOTO_TYPES)[number];

export function isValidInstallPhotoType(t: string | undefined): t is InstallPhotoType {
  if (!t) return false;
  return (INSTALL_PHOTO_TYPES as readonly string[]).includes(t);
}

export interface InstallPhotoRow {
  id: string;
  customerId: string;
  deviceId: string | null;
  siteId: string | null;
  photoPath: string;
  photoType: string;
  uploadedBy: string | null;
  createdAt: string;
}

export function saveInstallPhoto(params: {
  customerId: string;
  customerCode: string;
  deviceId?: string;
  siteId?: string;
  photoType?: string;
  imageBase64: string;
  fileName?: string;
  uploadedBy?: string;
}): { id: string; photoPath: string; photoType: string; storage: string } {
  const photoType = isValidInstallPhotoType(params.photoType)
    ? params.photoType
    : params.photoType
      ? "install"
      : "install";
  const subdir = photoType;
  const fname = params.fileName ?? `${uuid()}.jpg`;
  const full = path.join(installPhotosDir(params.customerCode), subdir, fname);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const buf = Buffer.from(params.imageBase64, "base64");
  fs.writeFileSync(full, buf);
  const rel = path.join(params.customerCode, subdir, fname).replace(/\\/g, "/");
  const id = uuid();
  getDatabase()
    .prepare(
      `INSERT INTO install_photos (id, customer_id, device_id, site_id, photo_path, photo_type, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      params.customerId,
      params.deviceId ?? null,
      params.siteId ?? null,
      rel,
      photoType,
      params.uploadedBy ?? null
    );
  void archiveInstallPhotoToRemote(params.customerCode, rel);
  return { id, photoPath: rel, photoType, storage: "local" };
}

export function listInstallPhotos(customerId: string): InstallPhotoRow[] {
  const rows = getDatabase()
    .prepare(
      `SELECT id, customer_id, device_id, site_id, photo_path, photo_type, uploaded_by,
              datetime(uploaded_at) as created_at
       FROM install_photos WHERE customer_id = ? ORDER BY rowid DESC`
    )
    .all(customerId) as Array<{
    id: string;
    customer_id: string;
    device_id: string | null;
    site_id: string | null;
    photo_path: string;
    photo_type: string;
    uploaded_by: string | null;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    customerId: r.customer_id,
    deviceId: r.device_id,
    siteId: r.site_id,
    photoPath: r.photo_path,
    photoType: r.photo_type,
    uploadedBy: r.uploaded_by,
    createdAt: r.created_at,
  }));
}

export function deleteInstallPhoto(customerId: string, photoId: string): boolean {
  const row = getDatabase()
    .prepare(`SELECT photo_path FROM install_photos WHERE id = ? AND customer_id = ?`)
    .get(photoId, customerId) as { photo_path: string } | undefined;
  if (!row) return false;

  for (const base of ["install_photos", "install-photos"]) {
    const full = path.join(process.cwd(), "uploads", base, row.photo_path);
    try {
      if (fs.existsSync(full)) fs.unlinkSync(full);
    } catch {
      /* */
    }
  }
  getDatabase().prepare(`DELETE FROM install_photos WHERE id = ? AND customer_id = ?`).run(photoId, customerId);
  return true;
}

export function getInstallPhotoUrl(photoPath: string): string {
  return `/uploads/install_photos/${photoPath}`;
}
