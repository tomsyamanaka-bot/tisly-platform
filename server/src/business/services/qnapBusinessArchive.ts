import fs from "fs";
import path from "path";
import type { BusinessProject, QnapSavePlan } from "../business-types.js";
import { logBusinessIntegration } from "../business-integration-log.js";
import {
  createQnapSavePlan,
  mockSaveToQnap,
  type QnapMockSaveResult,
} from "./qnapService.js";
import { QnapWebDavClient } from "./qnapWebDav.js";
import { enqueueIntegrationRetry } from "../integration-retry-queue.js";

export type QnapUploadMode = "mock" | "real";

export interface QnapUploadConfig {
  mode: QnapUploadMode;
  webdavUrl: string;
  username: string;
  password: string;
  basePath: string;
}

export function getQnapUploadConfig(): QnapUploadConfig {
  const mode =
    process.env.QNAP_UPLOAD_MODE === "real" &&
    Boolean(process.env.QNAP_WEBDAV_URL) &&
    Boolean(
      process.env.QNAP_USER ||
        process.env.QNAP_USERNAME ||
        process.env.QNAP_WEBDAV_USER
    )
      ? "real"
      : "mock";
  return {
    mode,
    webdavUrl: process.env.QNAP_WEBDAV_URL ?? "",
    username:
      process.env.QNAP_USER ||
      process.env.QNAP_WEBDAV_USER ||
      process.env.QNAP_USERNAME ||
      "tomsadmin",
    password: process.env.QNAP_PASSWORD || process.env.QNAP_WEBDAV_PASSWORD || "",
    basePath: process.env.QNAP_BASE_PATH ?? "/TOMS/business",
  };
}

export function qnapMockUploadRoot(): string {
  return path.join(process.cwd(), "uploads", "qnap-mock");
}

function mirrorDirForProject(projectId: string): string {
  const dir = path.join(qnapMockUploadRoot(), projectId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export interface QnapWebDavUploader {
  upload(localPath: string, remotePath: string): Promise<void>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
}

export class QnapWebDavUploaderReal implements QnapWebDavUploader {
  private client: QnapWebDavClient;
  constructor(private readonly cfg: QnapUploadConfig) {
    this.client = new QnapWebDavClient(cfg);
  }
  async upload(localPath: string, remotePath: string): Promise<void> {
    await this.client.putFile(localPath, remotePath);
  }
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    return this.client.testConnection();
  }
}

export interface QnapUploadResult {
  mode: QnapUploadMode;
  planId: string;
  basePath: string;
  savedFiles: Array<{ label: string; path: string; localMirror?: string }>;
  status: "synced" | "failed";
}

export function uploadBusinessToQnap(
  project: BusinessProject,
  plan?: QnapSavePlan
): QnapUploadResult {
  const cfg = getQnapUploadConfig();
  const p = plan ?? createQnapSavePlan(project);

  if (cfg.mode === "mock") {
    const mirrorDir = mirrorDirForProject(project.id);
    const result = mockSaveToQnap(project, p);
    for (const f of result.savedFiles) {
      if (!f.localMirror) continue;
      const src = path.join(process.cwd(), f.localMirror.replace(/^\//, ""));
      const dest = path.join(mirrorDir, path.basename(f.path));
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      } else {
        fs.writeFileSync(dest, `QNAP mock\n${f.path}\n`);
      }
    }
    logBusinessIntegration({
      projectId: project.id,
      type: "qnap",
      provider: "mock",
      status: "success",
      request: { planId: p.id, basePath: p.basePath },
      response: { mirrorDir, saved: result.savedFiles.length },
    });
    return { mode: "mock", ...result, status: "synced" as const };
  }

  return {
    mode: "real",
    planId: p.id,
    basePath: p.basePath,
    savedFiles: [],
    status: "failed",
  };
}

export async function uploadBusinessToQnapReal(
  project: BusinessProject,
  plan?: QnapSavePlan
): Promise<QnapUploadResult> {
  const cfg = getQnapUploadConfig();
  const p = plan ?? createQnapSavePlan(project);
  if (cfg.mode !== "real") {
    return uploadBusinessToQnap(project, p);
  }
  const mockResult = mockSaveToQnap(project, p);
  const client = new QnapWebDavClient(cfg);
  const remoteBase = `${cfg.basePath.replace(/\/+$/, "")}/${project.id}`;
  try {
    await client.mkcol(remoteBase);
    const uploads: Array<{ localPath: string; remotePath: string }> = [];
    for (const f of mockResult.savedFiles) {
      if (!f.localMirror) continue;
      const localPath = path.join(process.cwd(), f.localMirror.replace(/^\//, ""));
      const remotePath = `${remoteBase}/${path.basename(f.path)}`;
      uploads.push({ localPath, remotePath });
    }
    const { count } = await client.uploadLocalFiles(uploads);
    logBusinessIntegration({
      projectId: project.id,
      type: "qnap",
      provider: "webdav",
      status: "success",
      request: { planId: p.id, basePath: remoteBase },
      response: { uploaded: count },
    });
    return {
      mode: "real",
      planId: p.id,
      basePath: remoteBase,
      savedFiles: mockResult.savedFiles,
      status: "synced",
    };
  } catch (e) {
    const errMsg = (e as Error).message;
    logBusinessIntegration({
      projectId: project.id,
      type: "qnap",
      provider: "webdav",
      status: "error",
      request: { planId: p.id, basePath: p.basePath },
      errorMessage: errMsg,
    });
    enqueueIntegrationRetry({
      projectId: project.id,
      channel: "qnap",
      sendMode: "realSend",
      errorMessage: errMsg,
      payload: { planId: p.id, basePath: p.basePath, pdfs: ["specification", "estimate", "completion_report"] },
    });
    return {
      mode: "real",
      planId: p.id,
      basePath: p.basePath,
      savedFiles: [],
      status: "failed",
    };
  }
}

/** 仕様書・見積・完了報告 PDF を WebDAV へ自動 PUT（real モード） */
export async function uploadQnapAutoPdfs(
  project: BusinessProject,
  files: Array<{ localPath: string; remoteSubfolder: string; label: string }>
): Promise<{ uploaded: number; failed: string[] }> {
  const cfg = getQnapUploadConfig();
  if (cfg.mode !== "real") {
    return { uploaded: 0, failed: ["QNAP_UPLOAD_MODE is not real"] };
  }
  const client = new QnapWebDavClient(cfg);
  const remoteBase = `${cfg.basePath.replace(/\/+$/, "")}/${project.id}`;
  const failed: string[] = [];
  let uploaded = 0;
  try {
    await client.mkcol(remoteBase);
    for (const f of files) {
      if (!fs.existsSync(f.localPath)) {
        failed.push(f.label);
        continue;
      }
      const remotePath = `${remoteBase}/${f.remoteSubfolder}/${path.basename(f.localPath)}`;
      try {
        await client.mkcol(`${remoteBase}/${f.remoteSubfolder}`);
        await client.putFile(f.localPath, remotePath);
        uploaded += 1;
      } catch {
        failed.push(f.label);
      }
    }
    if (failed.length) {
      enqueueIntegrationRetry({
        projectId: project.id,
        channel: "qnap",
        sendMode: "realSend",
        errorMessage: `partial upload failed: ${failed.join(", ")}`,
        payload: { failed },
      });
    }
  } catch (e) {
    enqueueIntegrationRetry({
      projectId: project.id,
      channel: "qnap",
      sendMode: "realSend",
      errorMessage: (e as Error).message,
    });
    return { uploaded, failed: files.map((f) => f.label) };
  }
  return { uploaded, failed };
}

export async function testQnapWebDavConnection(): Promise<{
  mode: QnapUploadMode;
  ok: boolean;
  message: string;
}> {
  const cfg = getQnapUploadConfig();
  if (cfg.mode === "mock") {
    return { mode: "mock", ok: true, message: "QNAP mock mode — no WebDAV test required" };
  }
  const client = new QnapWebDavClient(cfg);
  const result = await client.testConnection();
  logBusinessIntegration({
    type: "qnap",
    provider: "webdav",
    status: result.ok ? "success" : "error",
    request: { op: "test_connection" },
    response: result,
    errorMessage: result.ok ? undefined : result.message,
  });
  return { mode: "real", ...result };
}

export interface QnapProjectUploadStatus {
  projectId: string;
  mode: QnapUploadMode;
  lastUploadAt: string | null;
  mirrorPath: string | null;
  fileCount: number;
  plan: QnapSavePlan | null;
}

export function getQnapProjectUploadStatus(
  project: BusinessProject,
  plan: QnapSavePlan | null
): QnapProjectUploadStatus {
  const cfg = getQnapUploadConfig();
  const mirrorDir = path.join(qnapMockUploadRoot(), project.id);
  let fileCount = 0;
  let lastUploadAt: string | null = null;
  if (fs.existsSync(mirrorDir)) {
    const files = fs.readdirSync(mirrorDir);
    fileCount = files.length;
    if (files.length) {
      const stats = files.map((f) => fs.statSync(path.join(mirrorDir, f)).mtimeMs);
      lastUploadAt = new Date(Math.max(...stats)).toISOString();
    }
  }
  return {
    projectId: project.id,
    mode: cfg.mode,
    lastUploadAt,
    mirrorPath: fileCount ? `/uploads/qnap-mock/${project.id}` : null,
    fileCount,
    plan,
  };
}

export { createQnapSavePlan, mockSaveToQnap, type QnapMockSaveResult };
