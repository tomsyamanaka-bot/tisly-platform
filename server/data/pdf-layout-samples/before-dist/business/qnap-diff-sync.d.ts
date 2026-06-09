export interface QnapFileFingerprint {
    localPath: string;
    remotePath: string;
    checksum: string;
    size: number;
    modifiedAt: string;
}
export interface QnapDiffSyncResult {
    mode: "mock" | "real";
    skipped: number;
    uploaded: number;
    failed: number;
    files: Array<{
        remotePath: string;
        action: "skip" | "upload" | "failed";
        error?: string;
    }>;
}
export declare function buildFingerprints(files: Array<{
    localPath: string;
    remotePath: string;
}>): QnapFileFingerprint[];
export declare function syncQnapDiff(projectId: string, files: Array<{
    localPath: string;
    remotePath: string;
}>): Promise<QnapDiffSyncResult>;
