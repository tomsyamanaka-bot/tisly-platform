import type { BusinessProject } from "../business-types.js";
import { type QnapMockSaveResult } from "./qnapService.js";
import { type QnapUploadMode } from "./qnapBusinessArchive.js";
export type QnapFolderOpMode = "mock" | "dryRun" | "real";
export interface QnapCreateFoldersResult {
    mode: QnapFolderOpMode;
    basePath: string;
    folders: string[];
    status: "created" | "dry_run" | "skipped";
    message: string;
}
export declare function buildProjectFolderList(project: BusinessProject): string[];
export declare function createQnapProjectFolders(project: BusinessProject, opts: {
    mode?: QnapFolderOpMode;
    confirmed?: boolean;
}): Promise<QnapCreateFoldersResult>;
export interface QnapFileUploadRealInput {
    project: BusinessProject;
    localPath: string;
    remotePath: string;
    mode?: QnapFolderOpMode;
    confirmed?: boolean;
}
export declare function uploadQnapFileReal(input: QnapFileUploadRealInput): Promise<{
    mode: QnapUploadMode | QnapFolderOpMode;
    status: string;
    remotePath: string;
}>;
export type { QnapMockSaveResult };
