/**
 * QNAP 日次整合チェック v1 — storage_documents_v1 + spec_project_photos_v1
 */
import { getDatabase } from "../db/database.js";
import { getQnapStorageProvider } from "./storage-provider-factory.js";
import {
  getStorageDocumentByIdV1,
  listFailedStorageDocumentsV1,
  type StorageDocumentV1,
} from "./storage-documents-v1-store.js";
import { isQnapWebDavConfigured, getQnapWebDavEnvConfig } from "./qnap-storage-v1-config.js";
import {
  syncFailedDocumentsToQnapV1,
  syncPendingDocumentsToQnapV1,
  syncStorageDocumentToQnapV1,
} from "./qnap-storage-v1-service.js";
import { syncSpecPhotosToQnapV1 } from "./qnap-spec-photos-sync-service.js";
import { runQnapSpecPhotosIntegrityCheckV1 } from "./qnap-spec-photos-integrity-service.js";

const STALE_HOURS = 24;

export type QnapStorageIntegrityIssueKindV1 =
  | "db_synced_qnap_missing"
  | "qnap_exists_db_missing"
  | "stale_pending"
  | "stale_failed"
  | "duplicate_local_path"
  | "duplicate_qnap_path";

export interface QnapStorageIntegrityIssueV1 {
  kind: QnapStorageIntegrityIssueKindV1;
  documentId: string | null;
  projectId: string | null;
  fileName: string | null;
  qnapPath: string | null;
  message: string;
}

export interface QnapStorageIntegrityReportV1 {
  checkedAt: string;
  qnapConfigured: boolean;
  qnapMode: "mock" | "webdav";
  documentCount: number;
  issueCount: number;
  stalePendingCount: number;
  staleFailedCount: number;
  duplicateLocalPathCount: number;
  duplicateQnapPathCount: number;
  dbSyncedQnapMissingCount: number;
  message: string;
  issues: QnapStorageIntegrityIssueV1[];
  specPhotos: ReturnType<typeof runQnapSpecPhotosIntegrityCheckV1>;
}

function listAllStorageDocumentsV1(): StorageDocumentV1[] {
  const rows = getDatabase()
    .prepare(`SELECT * FROM storage_documents_v1 ORDER BY updated_at DESC`)
    .all() as Array<Record<string, unknown>>;
  return rows.map((r) => getStorageDocumentByIdV1(String(r.id))!);
}

function hoursSince(iso: string | null): number {
  if (!iso) return 999;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60);
}

function findDuplicateLocalPaths(): QnapStorageIntegrityIssueV1[] {
  const rows = getDatabase()
    .prepare(
      `SELECT project_id, local_path, COUNT(*) AS cnt, GROUP_CONCAT(id) AS ids
       FROM storage_documents_v1
       WHERE local_path != ''
       GROUP BY project_id, local_path
       HAVING cnt > 1`
    )
    .all() as Array<{ project_id: string; local_path: string; cnt: number; ids: string }>;

  return rows.map((r) => ({
    kind: "duplicate_local_path" as const,
    documentId: r.ids.split(",")[0] ?? null,
    projectId: r.project_id,
    fileName: null,
    qnapPath: null,
    message: `localPath 重複 (${r.cnt}件): ${r.local_path}`,
  }));
}

function findDuplicateQnapPaths(): QnapStorageIntegrityIssueV1[] {
  const rows = getDatabase()
    .prepare(
      `SELECT qnap_path, COUNT(*) AS cnt, GROUP_CONCAT(id) AS ids
       FROM storage_documents_v1
       WHERE qnap_path IS NOT NULL AND qnap_path != ''
       GROUP BY qnap_path
       HAVING cnt > 1`
    )
    .all() as Array<{ qnap_path: string; cnt: number; ids: string }>;

  return rows.map((r) => ({
    kind: "duplicate_qnap_path" as const,
    documentId: r.ids.split(",")[0] ?? null,
    projectId: null,
    fileName: null,
    qnapPath: r.qnap_path,
    message: `qnapPath 重複 (${r.cnt}件): ${r.qnap_path}`,
  }));
}

async function findDbSyncedQnapMissing(
  docs: StorageDocumentV1[]
): Promise<QnapStorageIntegrityIssueV1[]> {
  if (!isQnapWebDavConfigured()) return [];
  const provider = getQnapStorageProvider();
  const issues: QnapStorageIntegrityIssueV1[] = [];

  for (const doc of docs) {
    if (doc.status !== "qnap_synced" || !doc.qnapPath) continue;
    const remote = doc.qnapPath.replace(/^\/+/, "");
    const env = getQnapWebDavEnvConfig();
    const relative = remote.startsWith(env.baseDir.replace(/^\/+/, ""))
      ? remote.slice(env.baseDir.replace(/^\/+/, "").length).replace(/^\/+/, "")
      : remote;
    const exists = await provider.exists(relative);
    if (!exists) {
      issues.push({
        kind: "db_synced_qnap_missing",
        documentId: doc.id,
        projectId: doc.projectId,
        fileName: doc.fileName,
        qnapPath: doc.qnapPath,
        message: `DBは同期済みですがQNAPにファイルがありません: ${doc.qnapPath}`,
      });
    }
  }
  return issues;
}

export async function runQnapStorageIntegrityCheckV1(
  projectId?: string
): Promise<QnapStorageIntegrityReportV1> {
  const env = getQnapWebDavEnvConfig();
  const qnapMode = isQnapWebDavConfigured() ? ("webdav" as const) : ("mock" as const);
  const allDocs = listAllStorageDocumentsV1().filter((d) =>
    projectId ? d.projectId === projectId : true
  );

  const issues: QnapStorageIntegrityIssueV1[] = [];

  for (const doc of allDocs) {
    if (doc.status === "qnap_pending" && hoursSince(doc.updatedAt) >= STALE_HOURS) {
      issues.push({
        kind: "stale_pending",
        documentId: doc.id,
        projectId: doc.projectId,
        fileName: doc.fileName,
        qnapPath: doc.qnapPath,
        message: `pending のまま ${Math.floor(hoursSince(doc.updatedAt))}時間経過`,
      });
    }
    if (doc.status === "qnap_failed" && hoursSince(doc.updatedAt) >= STALE_HOURS) {
      issues.push({
        kind: "stale_failed",
        documentId: doc.id,
        projectId: doc.projectId,
        fileName: doc.fileName,
        qnapPath: doc.qnapPath,
        message: `failed のまま ${Math.floor(hoursSince(doc.updatedAt))}時間経過 — ${doc.errorMessage ?? ""}`,
      });
    }
  }

  issues.push(...findDuplicateLocalPaths().filter((i) => !projectId || i.projectId === projectId));
  issues.push(...findDuplicateQnapPaths());

  const missingOnQnap = await findDbSyncedQnapMissing(allDocs);
  issues.push(...missingOnQnap);

  const specPhotos = runQnapSpecPhotosIntegrityCheckV1(projectId);

  const stalePendingCount = issues.filter((i) => i.kind === "stale_pending").length;
  const staleFailedCount = issues.filter((i) => i.kind === "stale_failed").length;
  const duplicateLocalPathCount = issues.filter((i) => i.kind === "duplicate_local_path").length;
  const duplicateQnapPathCount = issues.filter((i) => i.kind === "duplicate_qnap_path").length;
  const dbSyncedQnapMissingCount = issues.filter((i) => i.kind === "db_synced_qnap_missing").length;
  const issueCount = issues.length + specPhotos.mismatchCount;

  let message = "整合性 OK";
  if (issueCount > 0) {
    message = `要確認 ${issueCount}件（書類 ${issues.length} / 仕様書写真 ${specPhotos.mismatchCount}）`;
  } else if (!env.configured) {
    message = "QNAP WebDAV 未設定（Mock モード）";
  }

  return {
    checkedAt: new Date().toISOString(),
    qnapConfigured: env.configured,
    qnapMode,
    documentCount: allDocs.length,
    issueCount,
    stalePendingCount,
    staleFailedCount,
    duplicateLocalPathCount,
    duplicateQnapPathCount,
    dbSyncedQnapMissingCount,
    message,
    issues: issues.slice(0, 100),
    specPhotos,
  };
}

export async function runQnapStorageIntegrityResyncV1(opts?: {
  mode?: "pending" | "failed" | "all";
  projectId?: string;
}): Promise<{
  integrityBefore: QnapStorageIntegrityReportV1;
  documents: { synced: string[]; failed: Array<{ documentId: string; error: string }> };
  specPhotos: Array<{ projectId: string; synced: number; failed: number }>;
  integrityAfter: QnapStorageIntegrityReportV1;
}> {
  const mode = opts?.mode ?? "all";
  const projectId = opts?.projectId;
  const integrityBefore = await runQnapStorageIntegrityCheckV1(projectId);

  const synced: string[] = [];
  const failed: Array<{ documentId: string; error: string }> = [];

  const projectIds = projectId
    ? [projectId]
    : (
        getDatabase()
          .prepare(`SELECT DISTINCT project_id FROM storage_documents_v1`)
          .all() as Array<{ project_id: string }>
      ).map((r) => r.project_id);

  for (const pid of projectIds) {
    if (mode === "pending" || mode === "all") {
      const pending = await syncPendingDocumentsToQnapV1(pid);
      synced.push(...pending.synced);
      failed.push(...pending.failed);
    }
    if (mode === "failed" || mode === "all") {
      const failRes = await syncFailedDocumentsToQnapV1(pid);
      synced.push(...failRes.synced);
      failed.push(...failRes.failed);
    }
  }

  const specPhotos: Array<{ projectId: string; synced: number; failed: number }> = [];
  const photoProjectIds = projectId
    ? [projectId]
    : (
        getDatabase()
          .prepare(`SELECT DISTINCT project_id FROM spec_project_photos_v1`)
          .all() as Array<{ project_id: string }>
      ).map((r) => r.project_id);

  for (const pid of photoProjectIds) {
    const result = await syncSpecPhotosToQnapV1(pid);
    specPhotos.push({
      projectId: pid,
      synced: result.synced.length,
      failed: result.failed.length,
    });
  }

  const integrityAfter = await runQnapStorageIntegrityCheckV1(projectId);
  return { integrityBefore, documents: { synced, failed }, specPhotos, integrityAfter };
}

export async function resyncAllPendingQnapStorageV1(projectId?: string): Promise<{
  synced: string[];
  failed: Array<{ documentId: string; error: string }>;
}> {
  const synced: string[] = [];
  const failed: Array<{ documentId: string; error: string }> = [];
  const projectIds = projectId
    ? [projectId]
    : (
        getDatabase()
          .prepare(
            `SELECT DISTINCT project_id FROM storage_documents_v1 WHERE status = 'qnap_pending'`
          )
          .all() as Array<{ project_id: string }>
      ).map((r) => r.project_id);

  for (const pid of projectIds) {
    const result = await syncPendingDocumentsToQnapV1(pid);
    synced.push(...result.synced);
    failed.push(...result.failed);
  }
  return { synced, failed };
}

export async function resyncAllFailedQnapStorageV1(projectId?: string): Promise<{
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
  return { synced, failed };
}
