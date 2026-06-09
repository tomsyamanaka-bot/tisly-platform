import type { BusinessProject, QnapSavePlan } from "../business-types.js";
import { createQnapSavePlan, mockSaveToQnap, type QnapMockSaveResult } from "./qnapService.js";
export type QnapUploadMode = "mock" | "real";
export interface QnapUploadConfig {
    mode: QnapUploadMode;
    webdavUrl: string;
    username: string;
    password: string;
    basePath: string;
}
export declare function getQnapUploadConfig(): QnapUploadConfig;
export declare function qnapMockUploadRoot(): string;
export interface QnapWebDavUploader {
    upload(localPath: string, remotePath: string): Promise<void>;
    testConnection(): Promise<{
        ok: boolean;
        message: string;
    }>;
}
export declare class QnapWebDavUploaderReal implements QnapWebDavUploader {
    private readonly cfg;
    private client;
    constructor(cfg: QnapUploadConfig);
    upload(localPath: string, remotePath: string): Promise<void>;
    testConnection(): Promise<{
        ok: boolean;
        message: string;
    }>;
}
export interface QnapUploadResult {
    mode: QnapUploadMode;
    planId: string;
    basePath: string;
    savedFiles: Array<{
        label: string;
        path: string;
        localMirror?: string;
    }>;
    status: "synced" | "failed";
}
export declare function uploadBusinessToQnap(project: BusinessProject, plan?: QnapSavePlan): QnapUploadResult;
export declare function uploadBusinessToQnapReal(project: BusinessProject, plan?: QnapSavePlan): Promise<QnapUploadResult>;
/** 仕様書・見積・完了報告 PDF を WebDAV へ自動 PUT（real モード） */
export declare function uploadQnapAutoPdfs(project: BusinessProject, files: Array<{
    localPath: string;
    remoteSubfolder: string;
    label: string;
}>): Promise<{
    uploaded: number;
    failed: string[];
}>;
export declare function testQnapWebDavConnection(): Promise<{
    mode: QnapUploadMode;
    ok: boolean;
    message: string;
}>;
export interface QnapProjectUploadStatus {
    projectId: string;
    mode: QnapUploadMode;
    lastUploadAt: string | null;
    mirrorPath: string | null;
    fileCount: number;
    plan: QnapSavePlan | null;
}
export declare function getQnapProjectUploadStatus(project: BusinessProject, plan: QnapSavePlan | null): QnapProjectUploadStatus;
export { createQnapSavePlan, mockSaveToQnap, type QnapMockSaveResult };
