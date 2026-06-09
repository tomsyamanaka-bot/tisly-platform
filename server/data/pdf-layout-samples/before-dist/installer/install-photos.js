import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { archiveInstallPhotoToRemote } from "../qnap/install-photo-archive.js";
const ALLOWED_PHOTO_EXTS = new Set([".jpg", ".jpeg", ".png"]);
export function customerFilesDir(customerCode) {
    const dir = path.join(process.cwd(), "customer-files", customerCode);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}
export function isAllowedInstallPhotoFile(fileName) {
    if (!fileName)
        return true;
    const ext = path.extname(fileName).toLowerCase();
    return ALLOWED_PHOTO_EXTS.has(ext);
}
/** Field install photo categories (Phase 401–420). */
export const INSTALL_PHOTO_TYPES = [
    "before",
    "after",
    "wiring",
    "device_label",
    "panel",
    "test_result",
    "install",
    "construction",
];
export function isValidInstallPhotoType(t) {
    if (!t)
        return false;
    return INSTALL_PHOTO_TYPES.includes(t);
}
export function saveInstallPhoto(params) {
    const photoType = isValidInstallPhotoType(params.photoType)
        ? params.photoType
        : params.photoType
            ? "install"
            : "install";
    if (params.fileName && !isAllowedInstallPhotoFile(params.fileName)) {
        throw new Error("Only jpg and png images are allowed");
    }
    const subdir = photoType;
    const ext = path.extname(params.fileName ?? ".jpg").toLowerCase() || ".jpg";
    const safeExt = ALLOWED_PHOTO_EXTS.has(ext) ? ext : ".jpg";
    const fname = params.fileName ? path.basename(params.fileName) : `${uuid()}${safeExt}`;
    const full = path.join(customerFilesDir(params.customerCode), subdir, fname);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    const buf = Buffer.from(params.imageBase64, "base64");
    fs.writeFileSync(full, buf);
    const rel = path.join(params.customerCode, subdir, fname).replace(/\\/g, "/");
    const id = uuid();
    getDatabase()
        .prepare(`INSERT INTO install_photos (id, customer_id, device_id, site_id, photo_path, photo_type, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, params.customerId, params.deviceId ?? null, params.siteId ?? null, rel, photoType, params.uploadedBy ?? null);
    void archiveInstallPhotoToRemote(params.customerCode, rel);
    return { id, photoPath: rel, photoType, storage: "local" };
}
export function listInstallPhotos(customerId) {
    const rows = getDatabase()
        .prepare(`SELECT id, customer_id, device_id, site_id, photo_path, photo_type, uploaded_by,
              datetime(uploaded_at) as created_at
       FROM install_photos WHERE customer_id = ? ORDER BY rowid DESC`)
        .all(customerId);
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
export function deleteInstallPhoto(customerId, photoId) {
    const row = getDatabase()
        .prepare(`SELECT photo_path FROM install_photos WHERE id = ? AND customer_id = ?`)
        .get(photoId, customerId);
    if (!row)
        return false;
    const paths = [
        path.join(process.cwd(), "customer-files", row.photo_path),
        path.join(process.cwd(), "uploads", "install_photos", row.photo_path),
        path.join(process.cwd(), "uploads", "install-photos", row.photo_path),
    ];
    for (const full of paths) {
        try {
            if (fs.existsSync(full))
                fs.unlinkSync(full);
        }
        catch {
            /* */
        }
    }
    getDatabase().prepare(`DELETE FROM install_photos WHERE id = ? AND customer_id = ?`).run(photoId, customerId);
    return true;
}
export function getInstallPhotoUrl(photoPath) {
    if (photoPath.startsWith("/customer-files/"))
        return photoPath;
    if (fs.existsSync(path.join(process.cwd(), "customer-files", photoPath))) {
        return `/customer-files/${photoPath}`;
    }
    return `/uploads/install_photos/${photoPath}`;
}
