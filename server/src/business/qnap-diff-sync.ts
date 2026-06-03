import crypto from "crypto";
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { logBusinessIntegration } from "./business-integration-log.js";
import { enqueueIntegrationRetry } from "./integration-retry-queue.js";
import {
  getQnapUploadConfig,
  qnapMockUploadRoot,
  type QnapUploadConfig,
} from "./services/qnapBusinessArchive.js";
import { QnapWebDavClient } from "./services/qnapWebDav.js";

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
  files: Array<{ remotePath: string; action: "skip" | "upload" | "failed"; error?: string }>;
}

function sha256File(filePath: string): string {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function getManifestRow(projectId: string, remotePath: string) {
  return getDatabase()
    .prepare(
      `SELECT checksum, size, modified_at FROM qnap_upload_manifest
       WHERE project_id = ? AND remote_path = ?`
    )
    .get(projectId, remotePath) as
    | { checksum: string; size: number; modified_at: string }
    | undefined;
}

function upsertManifest(projectId: string, fp: QnapFileFingerprint): void {
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO qnap_upload_manifest (project_id, remote_path, local_path, checksum, size, modified_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id, remote_path) DO UPDATE SET
         local_path = excluded.local_path,
         checksum = excluded.checksum,
         size = excluded.size,
         modified_at = excluded.modified_at,
         updated_at = excluded.updated_at`
    )
    .run(
      projectId,
      fp.remotePath,
      fp.localPath,
      fp.checksum,
      fp.size,
      fp.modifiedAt,
      now
    );
}

function needsUpload(projectId: string, fp: QnapFileFingerprint): boolean {
  const row = getManifestRow(projectId, fp.remotePath);
  if (!row) return true;
  return row.checksum !== fp.checksum || row.size !== fp.size || row.modified_at !== fp.modifiedAt;
}

async function uploadOne(
  cfg: QnapUploadConfig,
  projectId: string,
  fp: QnapFileFingerprint
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (cfg.mode === "mock") {
      const dest = path.join(qnapMockUploadRoot(), projectId, path.basename(fp.remotePath));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(fp.localPath, dest);
    } else {
      const client = new QnapWebDavClient(cfg);
      await client.putFile(fp.localPath, fp.remotePath);
    }
    upsertManifest(projectId, fp);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function buildFingerprints(
  files: Array<{ localPath: string; remotePath: string }>
): QnapFileFingerprint[] {
  return files
    .filter((f) => fs.existsSync(f.localPath))
    .map((f) => {
      const stat = fs.statSync(f.localPath);
      return {
        localPath: f.localPath,
        remotePath: f.remotePath,
        checksum: sha256File(f.localPath),
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
    });
}

export async function syncQnapDiff(
  projectId: string,
  files: Array<{ localPath: string; remotePath: string }>
): Promise<QnapDiffSyncResult> {
  const cfg = getQnapUploadConfig();
  const fingerprints = buildFingerprints(files);
  const result: QnapDiffSyncResult = {
    mode: cfg.mode,
    skipped: 0,
    uploaded: 0,
    failed: 0,
    files: [],
  };

  for (const fp of fingerprints) {
    if (!needsUpload(projectId, fp)) {
      result.skipped += 1;
      result.files.push({ remotePath: fp.remotePath, action: "skip" });
      continue;
    }
    const up = await uploadOne(cfg, projectId, fp);
    if (up.ok) {
      result.uploaded += 1;
      result.files.push({ remotePath: fp.remotePath, action: "upload" });
      logBusinessIntegration({
        projectId,
        type: "qnap",
        provider: cfg.mode === "mock" ? "mock" : "webdav",
        status: "success",
        request: { op: "sync-diff", remotePath: fp.remotePath, checksum: fp.checksum },
      });
    } else {
      result.failed += 1;
      result.files.push({ remotePath: fp.remotePath, action: "failed", error: up.error });
      logBusinessIntegration({
        projectId,
        type: "qnap",
        provider: cfg.mode === "mock" ? "mock" : "webdav",
        status: "error",
        request: { op: "sync-diff", remotePath: fp.remotePath },
        errorMessage: up.error,
      });
      enqueueIntegrationRetry({
        projectId,
        channel: "qnap",
        payload: { remotePath: fp.remotePath, localPath: fp.localPath, retryId: uuid().slice(0, 8) },
        sendMode: cfg.mode === "real" ? "realSend" : "mockOnly",
        errorMessage: up.error,
      });
    }
  }

  return result;
}
