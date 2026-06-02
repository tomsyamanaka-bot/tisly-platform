import { getDatabase } from "../db/database.js";

export interface BackupRunRecord {
  id: string;
  backupType: string;
  status: string;
  filePath: string | null;
  sizeBytes: number | null;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
}

export function getLatestBackupStatus(): BackupRunRecord | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT * FROM backup_runs ORDER BY started_at DESC LIMIT 1`
    )
    .get() as
    | {
        id: string;
        backup_type: string;
        status: string;
        file_path: string | null;
        size_bytes: number | null;
        started_at: string;
        finished_at: string | null;
        error_message: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    backupType: row.backup_type,
    status: row.status,
    filePath: row.file_path,
    sizeBytes: row.size_bytes,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    errorMessage: row.error_message,
  };
}

export function listRecentBackups(limit = 10): BackupRunRecord[] {
  const rows = getDatabase()
    .prepare(`SELECT * FROM backup_runs ORDER BY started_at DESC LIMIT ?`)
    .all(limit) as Array<{
    id: string;
    backup_type: string;
    status: string;
    file_path: string | null;
    size_bytes: number | null;
    started_at: string;
    finished_at: string | null;
    error_message: string | null;
  }>;
  return rows.map((row) => ({
    id: row.id,
    backupType: row.backup_type,
    status: row.status,
    filePath: row.file_path,
    sizeBytes: row.size_bytes,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    errorMessage: row.error_message,
  }));
}
