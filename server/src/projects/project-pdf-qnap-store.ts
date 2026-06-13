/**
 * 案件 PDF — QNAP バックアップメタ（project_pdf_meta）
 */
import path from "path";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getStorageSettingsV1 } from "../storage/storage-settings-store.js";
import type { ProjectPdfKind } from "./project-pdf-store.js";

export type QnapBackupStatus = "pending" | "uploading" | "success" | "failed";

export interface ProjectPdfMetaRow {
  id: string;
  projectId: string;
  kind: ProjectPdfKind;
  localPath: string;
  fileName: string;
  qnapBackupEnabled: boolean;
  qnapBackupStatus: QnapBackupStatus | null;
  qnapBackupPath: string | null;
  qnapBackupError: string | null;
  qnapBackupAttempts: number;
  qnapBackupLastAttemptAt: string | null;
  qnapBackupCompletedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectPdfQnapPublicV1 {
  enabled: boolean;
  status: QnapBackupStatus | null;
  label: string;
  path: string | null;
  error: string | null;
  attempts: number;
  lastAttemptAt: string | null;
  completedAt: string | null;
}

const QNAP_STATUS_LABELS: Record<QnapBackupStatus, string> = {
  pending: "待機中",
  uploading: "送信中",
  success: "✅ バックアップ済み",
  failed: "⚠️ バックアップ失敗",
};

function rowFromDb(r: Record<string, unknown>): ProjectPdfMetaRow {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    kind: String(r.kind) as ProjectPdfKind,
    localPath: String(r.local_path ?? ""),
    fileName: String(r.file_name ?? ""),
    qnapBackupEnabled: Number(r.qnap_backup_enabled) === 1,
    qnapBackupStatus: r.qnap_backup_status ? (String(r.qnap_backup_status) as QnapBackupStatus) : null,
    qnapBackupPath: r.qnap_backup_path != null ? String(r.qnap_backup_path) : null,
    qnapBackupError: r.qnap_backup_error != null ? String(r.qnap_backup_error) : null,
    qnapBackupAttempts: Number(r.qnap_backup_attempts ?? 0),
    qnapBackupLastAttemptAt:
      r.qnap_backup_last_attempt_at != null ? String(r.qnap_backup_last_attempt_at) : null,
    qnapBackupCompletedAt:
      r.qnap_backup_completed_at != null ? String(r.qnap_backup_completed_at) : null,
    deletedAt: r.deleted_at != null ? String(r.deleted_at) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function buildQnapPdfRemotePath(projectId: string, fileName: string): string {
  return `projects/${projectId}/pdfs/${fileName}`;
}

export function buildQnapPdfDisplayPath(shareName: string, projectId: string, fileName: string): string {
  const share = shareName.replace(/^\/+|\/+$/g, "") || "TiSLY";
  return `/${share}/${buildQnapPdfRemotePath(projectId, fileName)}`;
}

export function isQnapPdfBackupConfigured(): boolean {
  const settings = getStorageSettingsV1();
  return Boolean(settings.qnapBackupEnabled && settings.qnap.host.trim() && settings.qnap.username.trim());
}

export function toQnapPublicMeta(
  row: ProjectPdfMetaRow | null | undefined,
  opts?: { includeError?: boolean; shareName?: string }
): ProjectPdfQnapPublicV1 {
  if (!row || row.deletedAt) {
    return {
      enabled: false,
      status: null,
      label: "未設定",
      path: null,
      error: null,
      attempts: 0,
      lastAttemptAt: null,
      completedAt: null,
    };
  }
  if (!row.qnapBackupEnabled) {
    return {
      enabled: false,
      status: null,
      label: "未設定",
      path: null,
      error: null,
      attempts: row.qnapBackupAttempts,
      lastAttemptAt: row.qnapBackupLastAttemptAt,
      completedAt: row.qnapBackupCompletedAt,
    };
  }
  const status = row.qnapBackupStatus;
  const label = status ? QNAP_STATUS_LABELS[status] : "未設定";
  const displayPath =
    row.qnapBackupPath ??
    (opts?.shareName && row.fileName
      ? buildQnapPdfDisplayPath(opts.shareName, row.projectId, row.fileName)
      : null);
  return {
    enabled: true,
    status,
    label,
    path: displayPath,
    error: opts?.includeError ? row.qnapBackupError : null,
    attempts: row.qnapBackupAttempts,
    lastAttemptAt: row.qnapBackupLastAttemptAt,
    completedAt: row.qnapBackupCompletedAt,
  };
}

export function getProjectPdfMeta(projectId: string, kind: ProjectPdfKind): ProjectPdfMetaRow | null {
  const row = getDatabase()
    .prepare(
      `SELECT * FROM project_pdf_meta
       WHERE project_id = ? AND kind = ? AND deleted_at IS NULL`
    )
    .get(projectId, kind) as Record<string, unknown> | undefined;
  return row ? rowFromDb(row) : null;
}

export function listProjectPdfMeta(projectId: string): ProjectPdfMetaRow[] {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM project_pdf_meta
       WHERE project_id = ? AND deleted_at IS NULL
       ORDER BY kind`
    )
    .all(projectId) as Array<Record<string, unknown>>;
  return rows.map(rowFromDb);
}

export function recordProjectPdfSavedV1(
  projectId: string,
  kind: ProjectPdfKind,
  pdfPath: string
): ProjectPdfMetaRow {
  const settings = getStorageSettingsV1();
  const enabled = Boolean(
    settings.qnapBackupEnabled && settings.qnap.host.trim() && settings.qnap.username.trim()
  );
  const fileName = path.basename(pdfPath);
  const now = new Date().toISOString();
  const existing = getProjectPdfMeta(projectId, kind);
  const db = getDatabase();

  if (existing) {
    db.prepare(
      `UPDATE project_pdf_meta SET
        local_path = ?,
        file_name = ?,
        qnap_backup_enabled = ?,
        qnap_backup_status = ?,
        qnap_backup_path = NULL,
        qnap_backup_error = NULL,
        qnap_backup_attempts = 0,
        qnap_backup_last_attempt_at = NULL,
        qnap_backup_completed_at = NULL,
        deleted_at = NULL,
        updated_at = ?
      WHERE id = ?`
    ).run(
      pdfPath,
      fileName,
      enabled ? 1 : 0,
      enabled ? "pending" : null,
      now,
      existing.id
    );
    return getProjectPdfMeta(projectId, kind)!;
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO project_pdf_meta (
      id, project_id, kind, local_path, file_name,
      qnap_backup_enabled, qnap_backup_status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    projectId,
    kind,
    pdfPath,
    fileName,
    enabled ? 1 : 0,
    enabled ? "pending" : null,
    now,
    now
  );
  return getProjectPdfMeta(projectId, kind)!;
}

export function softDeleteProjectPdfMeta(projectId: string, kind: ProjectPdfKind): void {
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `UPDATE project_pdf_meta SET deleted_at = ?, updated_at = ?
       WHERE project_id = ? AND kind = ? AND deleted_at IS NULL`
    )
    .run(now, now, projectId, kind);
}

export function softDeleteAllProjectPdfMeta(projectId: string): void {
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `UPDATE project_pdf_meta SET deleted_at = ?, updated_at = ?
       WHERE project_id = ? AND deleted_at IS NULL`
    )
    .run(now, now, projectId);
}

export function listQnapBackupQueue(limit = 20): ProjectPdfMetaRow[] {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM project_pdf_meta
       WHERE deleted_at IS NULL
         AND qnap_backup_enabled = 1
         AND local_path != ''
         AND (
           qnap_backup_status = 'pending'
           OR (qnap_backup_status = 'failed' AND qnap_backup_attempts < 3)
         )
       ORDER BY updated_at ASC
       LIMIT ?`
    )
    .all(limit) as Array<Record<string, unknown>>;
  return rows.map(rowFromDb);
}

export function markQnapBackupUploading(id: string): void {
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `UPDATE project_pdf_meta SET
        qnap_backup_status = 'uploading',
        qnap_backup_last_attempt_at = ?,
        updated_at = ?
      WHERE id = ? AND deleted_at IS NULL`
    )
    .run(now, now, id);
}

export function markQnapBackupSuccess(id: string, qnapPath: string): void {
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `UPDATE project_pdf_meta SET
        qnap_backup_status = 'success',
        qnap_backup_path = ?,
        qnap_backup_error = NULL,
        qnap_backup_completed_at = ?,
        updated_at = ?
      WHERE id = ? AND deleted_at IS NULL`
    )
    .run(qnapPath, now, now, id);
}

export function markQnapBackupFailed(id: string, error: string): void {
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `UPDATE project_pdf_meta SET
        qnap_backup_status = 'failed',
        qnap_backup_error = ?,
        qnap_backup_attempts = qnap_backup_attempts + 1,
        updated_at = ?
      WHERE id = ? AND deleted_at IS NULL`
    )
    .run(error.slice(0, 2000), now, id);
}

export function resetQnapBackupForResync(projectId: string, kind: ProjectPdfKind): ProjectPdfMetaRow | null {
  const row = getProjectPdfMeta(projectId, kind);
  if (!row || !row.localPath) return null;
  if (!isQnapPdfBackupConfigured()) return row;
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `UPDATE project_pdf_meta SET
        qnap_backup_enabled = 1,
        qnap_backup_status = 'pending',
        qnap_backup_error = NULL,
        qnap_backup_attempts = 0,
        qnap_backup_path = NULL,
        qnap_backup_completed_at = NULL,
        updated_at = ?
      WHERE id = ?`
    )
    .run(now, row.id);
  return getProjectPdfMeta(projectId, kind);
}
