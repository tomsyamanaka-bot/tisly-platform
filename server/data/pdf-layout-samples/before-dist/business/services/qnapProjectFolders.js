import fs from "fs";
import path from "path";
import { logBusinessIntegration } from "../business-integration-log.js";
import { QNAP_CASE_FOLDERS, generateQnapBusinessRoot, } from "./qnapService.js";
import { getQnapUploadConfig } from "./qnapBusinessArchive.js";
import { QnapWebDavClient } from "./qnapWebDav.js";
function mockMirrorDir(projectId) {
    const dir = path.join(process.cwd(), "uploads", "qnap-mock", projectId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}
export function buildProjectFolderList(project) {
    const base = generateQnapBusinessRoot(project);
    return QNAP_CASE_FOLDERS.map((f) => `${base}${f}/`);
}
export async function createQnapProjectFolders(project, opts) {
    const mode = opts.mode ?? (getQnapUploadConfig().mode === "real" ? "real" : "mock");
    const basePath = generateQnapBusinessRoot(project);
    const folders = buildProjectFolderList(project);
    const logReq = { op: "create-project-folders", mode, basePath, folderCount: folders.length };
    if (mode === "mock") {
        const mirror = mockMirrorDir(project.id);
        for (const f of folders) {
            const rel = f.replace(basePath, "").replace(/\//g, "_");
            fs.mkdirSync(path.join(mirror, rel || "root"), { recursive: true });
            fs.writeFileSync(path.join(mirror, `${rel || "root"}.txt`), `mock folder\n${f}\n`);
        }
        logBusinessIntegration({
            projectId: project.id,
            type: "qnap",
            provider: "mock",
            status: "success",
            request: logReq,
            response: { mirror, folders },
        });
        return {
            mode: "mock",
            basePath,
            folders,
            status: "created",
            message: "Mock: 案件フォルダ構造をローカルに作成しました",
        };
    }
    if (mode === "dryRun") {
        logBusinessIntegration({
            projectId: project.id,
            type: "qnap",
            provider: "qnap",
            status: "skipped",
            request: logReq,
            response: { dryRun: true, folders },
        });
        return {
            mode: "dryRun",
            basePath,
            folders,
            status: "dry_run",
            message: "Dry-run: フォルダ作成予定をログに記録（実MKCOLなし）",
        };
    }
    if (!opts.confirmed) {
        logBusinessIntegration({
            projectId: project.id,
            type: "qnap",
            provider: "qnap",
            status: "skipped",
            request: logReq,
            errorMessage: "confirmed=true required",
        });
        return {
            mode: "real",
            basePath,
            folders,
            status: "skipped",
            message: "confirmed=true が必要です",
        };
    }
    const cfg = getQnapUploadConfig();
    if (cfg.mode !== "real") {
        return {
            mode: "real",
            basePath,
            folders,
            status: "skipped",
            message: "QNAP_UPLOAD_MODE=real が必要です",
        };
    }
    const client = new QnapWebDavClient(cfg);
    try {
        await client.mkcol(basePath);
        for (const folder of folders) {
            await client.mkcol(folder);
        }
        logBusinessIntegration({
            projectId: project.id,
            type: "qnap",
            provider: "qnap",
            status: "success",
            request: logReq,
            response: { foldersCreated: folders.length },
        });
        return {
            mode: "real",
            basePath,
            folders,
            status: "created",
            message: "QNAP案件フォルダを作成しました",
        };
    }
    catch (e) {
        const msg = e.message;
        logBusinessIntegration({
            projectId: project.id,
            type: "qnap",
            provider: "qnap",
            status: "error",
            request: logReq,
            errorMessage: msg,
        });
        throw e;
    }
}
export async function uploadQnapFileReal(input) {
    const mode = input.mode ?? (getQnapUploadConfig().mode === "real" ? "real" : "mock");
    const remotePath = input.remotePath;
    if (mode === "mock") {
        const mirror = mockMirrorDir(input.project.id);
        const dest = path.join(mirror, path.basename(remotePath));
        if (fs.existsSync(input.localPath)) {
            fs.copyFileSync(input.localPath, dest);
        }
        else {
            fs.writeFileSync(dest, `mock upload\n${remotePath}\n`);
        }
        logBusinessIntegration({
            projectId: input.project.id,
            type: "qnap",
            provider: "mock",
            status: "success",
            request: { op: "upload-file-real", remotePath },
            response: { localMirror: dest },
        });
        return { mode: "mock", status: "synced", remotePath };
    }
    if (mode === "dryRun") {
        logBusinessIntegration({
            projectId: input.project.id,
            type: "qnap",
            provider: "qnap",
            status: "skipped",
            request: { op: "upload-file-real", remotePath, dryRun: true },
        });
        return { mode: "dryRun", status: "dry_run", remotePath };
    }
    if (!input.confirmed) {
        logBusinessIntegration({
            projectId: input.project.id,
            type: "qnap",
            provider: "qnap",
            status: "skipped",
            request: { op: "upload-file-real", remotePath },
            errorMessage: "confirmed=true required",
        });
        return { mode: "real", status: "skipped", remotePath };
    }
    const cfg = getQnapUploadConfig();
    if (cfg.mode !== "real") {
        return { mode: "real", status: "skipped", remotePath };
    }
    const client = new QnapWebDavClient(cfg);
    await client.putFile(input.localPath, remotePath);
    logBusinessIntegration({
        projectId: input.project.id,
        type: "qnap",
        provider: "qnap",
        status: "success",
        request: { op: "upload-file-real", remotePath },
        response: { uploaded: true },
    });
    return { mode: "real", status: "synced", remotePath };
}
