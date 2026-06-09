import type { QnapUploadConfig } from "./qnapBusinessArchive.js";
export declare class QnapWebDavClient {
    private readonly cfg;
    constructor(cfg: QnapUploadConfig);
    private headers;
    testConnection(): Promise<{
        ok: boolean;
        message: string;
    }>;
    mkcol(remoteDir: string): Promise<void>;
    putFile(localPath: string, remotePath: string): Promise<void>;
    uploadLocalFiles(files: Array<{
        localPath: string;
        remotePath: string;
    }>): Promise<number>;
}
