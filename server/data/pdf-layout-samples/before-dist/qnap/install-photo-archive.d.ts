/**
 * Install photo archive — local + QNAP/S3 migration path (Phase 381–400).
 */
export declare function installPhotosDir(customerCode: string): string;
export declare function resolveInstallPhotoPath(customerCode: string, fileName: string): string;
export interface ArchivePhotoResult {
    ok: boolean;
    localPath: string;
    qnapMode: string;
    s3Configured: boolean;
    archivePath: string | null;
    message: string;
}
export declare function archiveInstallPhotoToRemote(customerCode: string, relativePath: string): Promise<ArchivePhotoResult>;
