import fs from "fs";
import path from "path";
import { config } from "../config.js";
import { buildQnapRemotePath } from "./archive-path-builder.js";
import { isQnapSmbConfigured, smbWritePlaceholder } from "./smb-client.js";
const LOCAL_FALLBACK = path.join(process.cwd(), "data", "qnap-archive");
export async function runExportJob(job) {
    const remotePath = buildQnapRemotePath(job.kind, job.tenantId, job.siteId, job.filename);
    const localDir = path.join(LOCAL_FALLBACK, job.tenantId, job.siteId, job.kind);
    fs.mkdirSync(localDir, { recursive: true });
    const localPath = path.join(localDir, job.filename);
    fs.writeFileSync(localPath, job.content, "utf-8");
    const smb = await smbWritePlaceholder({
        remotePath,
        content: job.content,
    });
    return {
        localPath,
        remotePath: isQnapSmbConfigured()
            ? `//${config.qnap.host}/${config.qnap.share}${remotePath}`
            : remotePath,
        smb,
    };
}
