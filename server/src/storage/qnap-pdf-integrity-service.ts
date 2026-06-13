import fs from "fs";
import path from "path";
import { getDatabase } from "../db/database.js";
import {
  isQnapPdfBackupConfigured,
  listQnapBackupQueue,
  resetQnapBackupForResync,
  type ProjectPdfMetaRow,
} from "../projects/project-pdf-qnap-store.js";
import type { ProjectPdfKind } from "../projects/project-pdf-store.js";
import { getStorageSettingsV1 } from "./storage-settings-store.js";
import { processQnapPdfBackupRow } from "./qnap-pdf-backup-service.js";

export interface QnapPdfIntegrityItemV1 {
  projectId: string;
  kind: ProjectPdfKind;
  fileName: string;
  localOk: boolean;
  qnapStatus: string | null;
}

export interface QnapPdfIntegrityReportV1 {
  checkedAt: string;
  qnapBackupEnabled: boolean;
  localPdfCount: number;
  qnapSuccessCount: number;
  qnapPendingCount: number;
  qnapFailedCount: number;
  mismatch: boolean;
  message: string;
  items: QnapPdfIntegrityItemV1[];
}

function resolveLocalPdf(localPath: string): boolean {
  if (!localPath?.trim()) return false;
  const full = path.join(process.cwd(), localPath.replace(/^\//, ""));
  return fs.existsSync(full);
}

function listActivePdfMeta(): ProjectPdfMetaRow[] {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM project_pdf_meta
       WHERE deleted_at IS NULL AND local_path != ''`
    )
    .all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    projectId: String(r.project_id),
    kind: String(r.kind) as ProjectPdfKind,
    localPath: String(r.local_path ?? ""),
    fileName: String(r.file_name ?? ""),
    qnapBackupEnabled: Number(r.qnap_backup_enabled) === 1,
    qnapBackupStatus: r.qnap_backup_status ? (String(r.qnap_backup_status) as ProjectPdfMetaRow["qnapBackupStatus"]) : null,
    qnapBackupPath: r.qnap_backup_path != null ? String(r.qnap_backup_path) : null,
    qnapBackupError: r.qnap_backup_error != null ? String(r.qnap_backup_error) : null,
    qnapBackupAttempts: Number(r.qnap_backup_attempts ?? 0),
    qnapBackupLastAttemptAt:
      r.qnap_backup_last_attempt_at != null ? String(r.qnap_backup_last_attempt_at) : null,
    qnapBackupCompletedAt:
      r.qnap_backup_completed_at != null ? String(r.qnap_backup_completed_at) : null,
    deletedAt: null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }));
}

export function runQnapPdfIntegrityCheckV1(): QnapPdfIntegrityReportV1 {
  const settings = getStorageSettingsV1();
  const qnapBackupEnabled = Boolean(settings.qnapBackupEnabled && isQnapPdfBackupConfigured());
  const rows = listActivePdfMeta();
  const localRows = rows.filter((r) => resolveLocalPdf(r.localPath));
  const backupRows = localRows.filter((r) => r.qnapBackupEnabled);
  const qnapSuccessCount = backupRows.filter((r) => r.qnapBackupStatus === "success").length;
  const qnapPendingCount = backupRows.filter(
    (r) => r.qnapBackupStatus === "pending" || r.qnapBackupStatus === "uploading"
  ).length;
  const qnapFailedCount = backupRows.filter((r) => r.qnapBackupStatus === "failed").length;
  const localPdfCount = localRows.length;
  const mismatch =
    qnapBackupEnabled && backupRows.length > 0 && qnapSuccessCount < backupRows.length;

  const problemRows = backupRows.filter((r) => r.qnapBackupStatus !== "success");
  const items: QnapPdfIntegrityItemV1[] = problemRows.slice(0, 50).map((r) => ({
    projectId: r.projectId,
    kind: r.kind,
    fileName: r.fileName,
    localOk: resolveLocalPdf(r.localPath),
    qnapStatus: r.qnapBackupStatus,
  }));

  let message = "整合性 OK";
  if (!qnapBackupEnabled) {
    message = "QNAPバックアップ未設定";
  } else if (mismatch) {
    message = `ローカル ${localPdfCount} 件 / QNAP成功 ${qnapSuccessCount} 件 — 差分あり`;
  }

  return {
    checkedAt: new Date().toISOString(),
    qnapBackupEnabled,
    localPdfCount,
    qnapSuccessCount,
    qnapPendingCount,
    qnapFailedCount,
    mismatch,
    message,
    items,
  };
}

export async function resyncAllQnapPdfMismatchesV1(): Promise<{
  queued: number;
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const report = runQnapPdfIntegrityCheckV1();
  let queued = 0;
  for (const item of report.items) {
    const row = resetQnapBackupForResync(item.projectId, item.kind);
    if (row) queued += 1;
  }
  const queue = listQnapBackupQueue(100);
  let succeeded = 0;
  let failed = 0;
  for (const row of queue) {
    const ok = await processQnapPdfBackupRow(row);
    if (ok) succeeded += 1;
    else failed += 1;
  }
  return { queued, processed: queue.length, succeeded, failed };
}
