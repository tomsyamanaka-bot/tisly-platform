/**
 * Install photo archive — local + QNAP/S3 migration path (Phase 381–400).
 */
import fs from "fs";
import path from "path";
import { config } from "../config.js";
import { putObjectPlaceholder, isS3Configured } from "../storage/s3-client.js";
export function installPhotosDir(customerCode) {
    return path.join(process.cwd(), "uploads", "install_photos", customerCode);
}
export function resolveInstallPhotoPath(customerCode, fileName) {
    const dir = installPhotosDir(customerCode);
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, fileName);
}
export async function archiveInstallPhotoToRemote(customerCode, relativePath) {
    const localFull = path.join(process.cwd(), "uploads", "install_photos", relativePath);
    const legacyFull = path.join(process.cwd(), "uploads", "install-photos", relativePath);
    const exists = fs.existsSync(localFull) || fs.existsSync(legacyFull);
    const qnapMode = config.qnap.mode;
    let archivePath = null;
    if (qnapMode === "real" && config.qnap.host) {
        archivePath = `${config.qnap.basePath}/install-photos/${customerCode}/${path.basename(relativePath)}`;
    }
    if (isS3Configured()) {
        const buf = fs.existsSync(localFull)
            ? fs.readFileSync(localFull)
            : fs.existsSync(legacyFull)
                ? fs.readFileSync(legacyFull)
                : Buffer.alloc(0);
        const s3 = await putObjectPlaceholder(`install-photos/${relativePath}`, buf);
        return {
            ok: exists,
            localPath: relativePath,
            qnapMode,
            s3Configured: true,
            archivePath: s3.key,
            message: s3.message,
        };
    }
    return {
        ok: exists,
        localPath: relativePath,
        qnapMode,
        s3Configured: false,
        archivePath,
        message: exists
            ? "Local storage — QNAP/S3 archive TODO when credentials set"
            : "Photo file not found on disk",
    };
}
