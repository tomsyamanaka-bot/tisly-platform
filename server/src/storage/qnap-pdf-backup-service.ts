import fs from "fs";
import path from "path";
import { QnapWebDavClient } from "../business/services/qnapWebDav.js";
import {
  buildQnapPdfDisplayPath,
  buildQnapPdfRemotePath,
  markQnapBackupFailed,
  markQnapBackupSuccess,
  markQnapBackupUploading,
  type ProjectPdfMetaRow,
} from "../projects/project-pdf-qnap-store.js";
import {
  getStorageSettingsV1,
  type StorageSettingsV1,
} from "./storage-settings-store.js";
import { isQnapStorageMockMode, settingsToWebDavConfig } from "./qnap-storage-service.js";

function mockMirrorRoot(): string {
  return path.join(process.cwd(), "uploads", "qnap-storage-mock");
}

function resolveLocalPdf(localPath: string): string | null {
  if (!localPath?.trim()) return null;
  const full = path.join(process.cwd(), localPath.replace(/^\//, ""));
  return fs.existsSync(full) ? full : null;
}

async function mockUploadPdf(
  settings: StorageSettingsV1,
  row: ProjectPdfMetaRow,
  localFile: string
): Promise<{ ok: true; displayPath: string } | { ok: false; error: string }> {
  const remoteRel = buildQnapPdfRemotePath(row.projectId, row.fileName);
  const dest = path.join(mockMirrorRoot(), settings.qnap.shareName, remoteRel);
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(localFile, dest);
    const displayPath = buildQnapPdfDisplayPath(settings.qnap.shareName, row.projectId, row.fileName);
    return { ok: true, displayPath };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function realUploadPdf(
  settings: StorageSettingsV1,
  row: ProjectPdfMetaRow,
  localFile: string
): Promise<{ ok: true; displayPath: string } | { ok: false; error: string }> {
  try {
    const cfg = settingsToWebDavConfig(settings);
    const client = new QnapWebDavClient(cfg);
    const remoteRel = buildQnapPdfRemotePath(row.projectId, row.fileName);
    await client.uploadLocalFiles([{ localPath: localFile, remotePath: remoteRel }]);
    const displayPath = buildQnapPdfDisplayPath(settings.qnap.shareName, row.projectId, row.fileName);
    return { ok: true, displayPath };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function uploadProjectPdfMetaToQnap(row: ProjectPdfMetaRow): Promise<{
  ok: boolean;
  displayPath?: string;
  error?: string;
}> {
  if (!row.qnapBackupEnabled || row.deletedAt) {
    return { ok: false, error: "QNAP backup not enabled" };
  }
  const localFile = resolveLocalPdf(row.localPath);
  if (!localFile) {
    return { ok: false, error: "Local PDF not found" };
  }

  const settings = getStorageSettingsV1();
  markQnapBackupUploading(row.id);

  const result = isQnapStorageMockMode(settings)
    ? await mockUploadPdf(settings, row, localFile)
    : await realUploadPdf(settings, row, localFile);

  if (result.ok) {
    markQnapBackupSuccess(row.id, result.displayPath);
    return { ok: true, displayPath: result.displayPath };
  }

  markQnapBackupFailed(row.id, result.error);
  return { ok: false, error: result.error };
}

export async function processQnapPdfBackupRow(row: ProjectPdfMetaRow): Promise<boolean> {
  const result = await uploadProjectPdfMetaToQnap(row);
  return result.ok;
}
