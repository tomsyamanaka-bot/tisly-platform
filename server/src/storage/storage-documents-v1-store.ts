/**
 * 保存分類テーブル storage_documents_v1 — QNAP 保存状態管理
 */
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getBusinessProject } from "../business/business-store.js";
import type { ProjectPdfKind } from "../projects/project-pdf-store.js";
import type { QnapBackupStatus } from "../projects/project-pdf-qnap-store.js";

export type StorageDocumentTypeV1 =
  | "project"
  | "estimate"
  | "invoice"
  | "survey"
  | "drawing"
  | "report"
  | "photos"
  | "pdf";

export type StorageDocumentStatusV1 =
  | "qnap_pending"
  | "qnap_syncing"
  | "qnap_synced"
  | "qnap_failed";

export interface StorageDocumentV1 {
  id: string;
  projectId: string;
  documentType: StorageDocumentTypeV1;
  title: string;
  fileName: string;
  localPath: string;
  qnapPath: string | null;
  mimeType: string;
  size: number;
  status: StorageDocumentStatusV1;
  customerName: string | null;
  siteName: string | null;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
  errorMessage: string | null;
}

const PDF_KIND_TO_DOC_TYPE: Record<ProjectPdfKind, StorageDocumentTypeV1> = {
  estimate: "estimate",
  invoice: "invoice",
  specification: "pdf",
  report: "report",
};

const PDF_KIND_TITLES: Record<ProjectPdfKind, string> = {
  estimate: "見積書",
  invoice: "請求書",
  specification: "仕様書",
  report: "完了報告書",
};

function rowFromDb(r: Record<string, unknown>): StorageDocumentV1 {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    documentType: String(r.document_type) as StorageDocumentTypeV1,
    title: String(r.title ?? ""),
    fileName: String(r.file_name ?? ""),
    localPath: String(r.local_path ?? ""),
    qnapPath: r.qnap_path != null ? String(r.qnap_path) : null,
    mimeType: String(r.mime_type ?? "application/pdf"),
    size: Number(r.size ?? 0),
    status: String(r.status ?? "qnap_pending") as StorageDocumentStatusV1,
    customerName: r.customer_name != null ? String(r.customer_name) : null,
    siteName: r.site_name != null ? String(r.site_name) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    syncedAt: r.synced_at != null ? String(r.synced_at) : null,
    errorMessage: r.error_message != null ? String(r.error_message) : null,
  };
}

function qnapStatusToStorageStatus(status: QnapBackupStatus | null): StorageDocumentStatusV1 {
  if (status === "success") return "qnap_synced";
  if (status === "failed") return "qnap_failed";
  return "qnap_pending";
}

export function storageStatusPresentation(
  status: StorageDocumentStatusV1,
  qnapConfigured = true
): {
  label: string;
  icon: string;
} {
  if (!qnapConfigured && status !== "qnap_synced") {
    return { label: "QNAP未設定", icon: "⚙️" };
  }
  switch (status) {
    case "qnap_synced":
      return { label: "QNAP保存済み", icon: "🟢" };
    case "qnap_failed":
      return { label: "保存失敗", icon: "🔴" };
    case "qnap_syncing":
      return { label: "保存中", icon: "🔵" };
    default:
      return { label: "QNAP未保存", icon: "🟡" };
  }
}

export function getStorageDocumentByIdV1(id: string): StorageDocumentV1 | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM storage_documents_v1 WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowFromDb(row) : null;
}

export function findStorageDocumentByLocalPathV1(
  projectId: string,
  documentType: StorageDocumentTypeV1,
  localPath: string
): StorageDocumentV1 | null {
  const row = getDatabase()
    .prepare(
      `SELECT * FROM storage_documents_v1
       WHERE project_id = ? AND document_type = ? AND local_path = ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(projectId, documentType, localPath) as Record<string, unknown> | undefined;
  return row ? rowFromDb(row) : null;
}

export function listPendingStorageDocumentsForProjectV1(projectId: string): StorageDocumentV1[] {
  return listStorageDocumentsForProjectV1(projectId).filter(
    (d) => d.status === "qnap_pending" || d.status === "qnap_failed"
  );
}

export function listFailedStorageDocumentsV1(projectId?: string): StorageDocumentV1[] {
  const db = getDatabase();
  if (projectId) {
    const rows = db
      .prepare(
        `SELECT * FROM storage_documents_v1
         WHERE project_id = ? AND status = 'qnap_failed'
         ORDER BY updated_at ASC`
      )
      .all(projectId) as Array<Record<string, unknown>>;
    return rows.map(rowFromDb);
  }
  const rows = db
    .prepare(
      `SELECT * FROM storage_documents_v1 WHERE status = 'qnap_failed' ORDER BY updated_at ASC`
    )
    .all() as Array<Record<string, unknown>>;
  return rows.map(rowFromDb);
}

export function markStorageDocumentQnapSyncingV1(id: string): void {
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `UPDATE storage_documents_v1 SET status = 'qnap_syncing', updated_at = ?, error_message = NULL WHERE id = ?`
    )
    .run(now, id);
}

export function markStorageDocumentQnapSyncedV1(id: string, qnapPath: string): void {
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `UPDATE storage_documents_v1 SET
        status = 'qnap_synced', qnap_path = ?, synced_at = ?, error_message = NULL, updated_at = ?
       WHERE id = ?`
    )
    .run(qnapPath, now, now, id);
}

export function markStorageDocumentQnapFailedV1(id: string, errorMessage: string): void {
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `UPDATE storage_documents_v1 SET
        status = 'qnap_failed', error_message = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(errorMessage.slice(0, 2000), now, id);
}

export function listStorageDocumentsForProjectV1(projectId: string): StorageDocumentV1[] {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM storage_documents_v1 WHERE project_id = ? ORDER BY created_at DESC`
    )
    .all(projectId) as Array<Record<string, unknown>>;
  return rows.map(rowFromDb);
}

export function getLatestStorageDocumentForKindV1(
  projectId: string,
  documentType: StorageDocumentTypeV1
): StorageDocumentV1 | null {
  const row = getDatabase()
    .prepare(
      `SELECT * FROM storage_documents_v1
       WHERE project_id = ? AND document_type = ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(projectId, documentType) as Record<string, unknown> | undefined;
  return row ? rowFromDb(row) : null;
}

export interface RegisterProjectPdfDocumentInputV1 {
  projectId: string;
  kind: ProjectPdfKind;
  localPath: string;
  qnapPath?: string | null;
  qnapStatus?: QnapBackupStatus | null;
  errorMessage?: string | null;
}

/** PDF 保存時に storage_documents_v1 へ履歴登録（同一 local_path は重複しない） */
export function registerProjectPdfDocumentV1(input: RegisterProjectPdfDocumentInputV1): StorageDocumentV1 {
  const project = getBusinessProject(input.projectId);
  const documentType = PDF_KIND_TO_DOC_TYPE[input.kind];
  const title = PDF_KIND_TITLES[input.kind];
  const fileName = path.basename(input.localPath);

  const existing = findStorageDocumentByLocalPathV1(input.projectId, documentType, input.localPath);
  if (existing) {
    return existing;
  }

  const absPath = path.join(process.cwd(), input.localPath.replace(/^\//, ""));
  let size = 0;
  try {
    if (fs.existsSync(absPath)) size = fs.statSync(absPath).size;
  } catch {
    /* */
  }

  const status = qnapStatusToStorageStatus(input.qnapStatus ?? null);
  const now = new Date().toISOString();
  const id = uuid();

  getDatabase()
    .prepare(
      `INSERT INTO storage_documents_v1 (
        id, project_id, document_type, title, file_name, local_path, qnap_path,
        mime_type, size, status, customer_name, site_name,
        created_at, updated_at, synced_at, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.projectId,
      documentType,
      title,
      fileName,
      input.localPath,
      input.qnapPath ?? null,
      "application/pdf",
      size,
      status,
      project?.customerName ?? null,
      project?.title ?? null,
      now,
      now,
      status === "qnap_synced" ? now : null,
      input.errorMessage ?? null
    );

  return rowFromDb(
    getDatabase().prepare(`SELECT * FROM storage_documents_v1 WHERE id = ?`).get(id) as Record<
      string,
      unknown
    >
  );
}

export function syncStorageDocumentQnapStatusV1(
  projectId: string,
  documentType: StorageDocumentTypeV1,
  qnapStatus: QnapBackupStatus | null,
  opts?: { qnapPath?: string | null; errorMessage?: string | null }
): void {
  const doc = getLatestStorageDocumentForKindV1(projectId, documentType);
  if (!doc) return;
  const status = qnapStatusToStorageStatus(qnapStatus);
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `UPDATE storage_documents_v1 SET
        status = ?, qnap_path = COALESCE(?, qnap_path), error_message = ?,
        synced_at = CASE WHEN ? = 'qnap_synced' THEN ? ELSE synced_at END,
        updated_at = ?
       WHERE id = ?`
    )
    .run(
      status,
      opts?.qnapPath ?? null,
      opts?.errorMessage ?? null,
      status,
      now,
      now,
      doc.id
    );
}

export function mapPracticalKindToDocumentType(
  kind: "estimate" | "invoice" | "specification" | "completion"
): StorageDocumentTypeV1 {
  if (kind === "estimate") return "estimate";
  if (kind === "invoice") return "invoice";
  if (kind === "completion") return "report";
  return "pdf";
}
