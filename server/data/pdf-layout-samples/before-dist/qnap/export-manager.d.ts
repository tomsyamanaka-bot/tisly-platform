import { smbWritePlaceholder } from "./smb-client.js";
export interface ExportJob {
    tenantId: string;
    siteId: string;
    filename: string;
    content: string;
    kind: "events" | "reports" | "cameras";
}
export declare function runExportJob(job: ExportJob): Promise<{
    localPath: string;
    remotePath: string;
    smb: Awaited<ReturnType<typeof smbWritePlaceholder>>;
}>;
