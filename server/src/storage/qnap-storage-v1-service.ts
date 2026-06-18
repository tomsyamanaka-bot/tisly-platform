/**
 * QNAP 保存 v1 — storage_documents_v1 実保存サービス
 */
import fs from "fs";
import path from "path";
import { getBusinessProject } from "../business/business-store.js";
import { getQnapStorageProvider } from "./storage-provider-factory.js";
import {
  buildQnapRemotePath,
  buildQnapProjectRelativeDir,
} from "./qnap-path-builder-v1.js";
import {
  getQnapWebDavEnvConfig,
  isQnapWebDavConfigured,
  resolveQnapStorageProviderKind,
} from "./qnap-storage-v1-config.js";
import {
  getStorageDocumentByIdV1,
  listStorageDocumentsForProjectV1,
  listFailedStorageDocumentsV1,
  listPendingStorageDocumentsForProjectV1,
  markStorageDocumentQnapFailedV1,
  markStorageDocumentQnapSyncedV1,
  markStorageDocumentQnapSyncingV1,
  storageStatusPresentation,
  type StorageDocumentV1,
} from "./storage-documents-v1-store.js";

export interface QnapStorageStatusV1 {
  projectId: string;
  qnapConfigured: boolean;
  providerKind: string;
  baseDir: string;
  projectFolder: string | null;
  documents: Array<{
    id: string;
    documentType: string;
    title: string;
    fileName: string;
    status: string;
    statusLabel: string;
    statusIcon: string;
    qnapPath: string | null;
    syncedAt: string | null;
    errorMessage: string | null;
  }>;
  summary: {
    pending: number;
    syncing: number;
    synced: number;
    failed: number;
  };
}

export interface QnapSyncResultV1 {
  ok: boolean;
  documentId: string;
  status: string;
  qnapPath?: string | null;
  errorMessage?: string | null;
  mock?: boolean;
}

function readLocalFile(localPath: string): Buffer | null {
  const abs = path.join(process.cwd(), localPath.replace(/^\//, ""));
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs);
}

export async function runQnapStorageConnectionTestV1(): Promise<{
  ok: boolean;
  message: string;
  configured: boolean;
  providerKind: string;
  mock?: boolean;
  testedAt: string;
}> {
  const env = getQnapWebDavEnvConfig();
  const providerKind = resolveQnapStorageProviderKind();
  if (!env.configured && providerKind === "mock") {
    const provider = getQnapStorageProvider();
    const result = await provider.testConnection();
    return {
      ok: result.ok,
      message: result.message,
      configured: false,
      providerKind,
      mock: true,
      testedAt: result.testedAt,
    };
  }
  const provider = getQnapStorageProvider();
  const result = await provider.testConnection();
  return {
    ok: result.ok,
    message: result.message,
    configured: env.configured,
    providerKind,
    mock: result.mock,
    testedAt: result.testedAt,
  };
}

export async function syncStorageDocumentToQnapV1(
  documentId: string,
  opts?: { forceMockFail?: boolean }
): Promise<QnapSyncResultV1> {
  const doc = getStorageDocumentByIdV1(documentId);
  if (!doc) {
    return { ok: false, documentId, status: "not_found", errorMessage: "document not found" };
  }
  if (doc.status === "qnap_synced" && doc.qnapPath && !opts?.forceMockFail) {
    return {
      ok: true,
      documentId,
      status: doc.status,
      qnapPath: doc.qnapPath,
    };
  }

  const env = getQnapWebDavEnvConfig();
  const providerKind = resolveQnapStorageProviderKind();
  if (!env.configured && providerKind !== "mock") {
    return {
      ok: false,
      documentId,
      status: "qnap_unconfigured",
      errorMessage: "QNAP未設定",
    };
  }

  const buffer = readLocalFile(doc.localPath);
  if (!buffer) {
    markStorageDocumentQnapFailedV1(documentId, "ローカルファイルが見つかりません");
    return {
      ok: false,
      documentId,
      status: "qnap_failed",
      errorMessage: "ローカルファイルが見つかりません",
    };
  }

  markStorageDocumentQnapSyncingV1(documentId);

  if (opts?.forceMockFail) {
    markStorageDocumentQnapFailedV1(documentId, "Mock 保存失敗（テスト用）");
    return {
      ok: false,
      documentId,
      status: "qnap_failed",
      errorMessage: "Mock 保存失敗（テスト用）",
      mock: true,
    };
  }

  const remotePath = buildQnapRemotePath(env.baseDir, doc.projectId, doc.documentType, doc.fileName);
  const provider = getQnapStorageProvider();
  const put = await provider.put(buffer, { remotePath, contentType: doc.mimeType });

  if (!put.ok) {
    markStorageDocumentQnapFailedV1(documentId, put.message ?? "QNAP保存失敗");
    return {
      ok: false,
      documentId,
      status: "qnap_failed",
      errorMessage: put.message ?? "QNAP保存失敗",
      mock: put.mock,
    };
  }

  const displayPath = `/${remotePath.replace(/^\/+/, "")}`;
  markStorageDocumentQnapSyncedV1(documentId, displayPath);
  return {
    ok: true,
    documentId,
    status: "qnap_synced",
    qnapPath: displayPath,
    mock: put.mock,
  };
}

export async function syncProjectDocumentsToQnapV1(projectId: string): Promise<{
  projectId: string;
  synced: string[];
  skipped: string[];
  failed: Array<{ documentId: string; error: string }>;
}> {
  if (!getBusinessProject(projectId)) {
    throw new Error("project not found");
  }
  const pending = listPendingStorageDocumentsForProjectV1(projectId);
  const synced: string[] = [];
  const skipped: string[] = [];
  const failed: Array<{ documentId: string; error: string }> = [];

  for (const doc of pending) {
    const result = await syncStorageDocumentToQnapV1(doc.id);
    if (result.ok) synced.push(doc.id);
    else if (result.status === "qnap_synced") skipped.push(doc.id);
    else failed.push({ documentId: doc.id, error: result.errorMessage ?? "sync failed" });
  }

  return { projectId, synced, skipped, failed };
}

export async function retryFailedQnapStorageV1(projectId?: string): Promise<{
  retried: number;
  synced: string[];
  failed: Array<{ documentId: string; error: string }>;
}> {
  const docs = listFailedStorageDocumentsV1(projectId);
  const synced: string[] = [];
  const failed: Array<{ documentId: string; error: string }> = [];

  for (const doc of docs) {
    const result = await syncStorageDocumentToQnapV1(doc.id);
    if (result.ok) synced.push(doc.id);
    else failed.push({ documentId: doc.id, error: result.errorMessage ?? "retry failed" });
  }

  return { retried: docs.length, synced, failed };
}

export function getQnapStorageStatusForProjectV1(projectId: string): QnapStorageStatusV1 | null {
  const project = getBusinessProject(projectId);
  if (!project) return null;

  const env = getQnapWebDavEnvConfig();
  const docs = listStorageDocumentsForProjectV1(projectId);
  const projectFolder = buildQnapProjectRelativeDir(
    env.baseDir,
    project.projectNo,
    project.title ?? project.customerName ?? "現場"
  );

  let pending = 0;
  let syncing = 0;
  let synced = 0;
  let failed = 0;

  const mapped = docs.map((doc: StorageDocumentV1) => {
    if (doc.status === "qnap_pending") pending += 1;
    else if (doc.status === "qnap_syncing") syncing += 1;
    else if (doc.status === "qnap_synced") synced += 1;
    else if (doc.status === "qnap_failed") failed += 1;
    const pres = storageStatusPresentation(doc.status, env.configured);
    return {
      id: doc.id,
      documentType: doc.documentType,
      title: doc.title,
      fileName: doc.fileName,
      status: doc.status,
      statusLabel: pres.label,
      statusIcon: pres.icon,
      qnapPath: doc.qnapPath,
      syncedAt: doc.syncedAt,
      errorMessage: doc.errorMessage,
    };
  });

  return {
    projectId,
    qnapConfigured: env.configured,
    providerKind: resolveQnapStorageProviderKind(),
    baseDir: env.baseDir,
    projectFolder: `/${projectFolder}`,
    documents: mapped,
    summary: { pending, syncing, synced, failed },
  };
}

export { isQnapWebDavConfigured };
