import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { config } from "../config.js";
import { getDatabase, getDbPath } from "../db/database.js";
import { getPlatformSetting } from "../db/database.js";
import { logAudit } from "../provisioning/audit-log.js";

const BACKUP_ROOT = path.join(process.cwd(), "data", "backups");

export type BackupTarget = "sqlite" | "events" | "reports" | "settings";

function ensureBackupDir(): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const dir = path.join(BACKUP_ROOT, stamp);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function insertRun(
  id: string,
  backupType: string,
  status: string,
  filePath: string | null,
  sizeBytes: number | null,
  error?: string
): void {
  const db = getDatabase();
  db.prepare(
    `INSERT INTO backup_runs (id, backup_type, status, file_path, size_bytes, started_at, finished_at, error_message)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)`
  ).run(id, backupType, status, filePath, sizeBytes, error ?? null);
}

export async function runBackup(
  targets: BackupTarget[] = ["sqlite", "events", "reports", "settings"],
  actor?: { userId?: string; username?: string }
): Promise<{ ok: boolean; files: string[]; runIds: string[] }> {
  const dir = ensureBackupDir();
  const files: string[] = [];
  const runIds: string[] = [];

  if (targets.includes("sqlite")) {
    const id = uuid();
    const src = getDbPath();
    const dest = path.join(dir, `tisly-${Date.now()}.db`);
    try {
      fs.copyFileSync(src, dest);
      const size = fs.statSync(dest).size;
      insertRun(id, "sqlite", "ok", dest, size);
      files.push(dest);
      runIds.push(id);
    } catch (e) {
      insertRun(id, "sqlite", "error", null, null, e instanceof Error ? e.message : "copy failed");
      runIds.push(id);
    }
  }

  if (targets.includes("events")) {
    const id = uuid();
    const dest = path.join(dir, `events-export-${Date.now()}.json`);
    try {
      const rows = getDatabase()
        .prepare("SELECT * FROM events ORDER BY created_at DESC LIMIT 5000")
        .all();
      fs.writeFileSync(dest, JSON.stringify(rows, null, 2));
      const size = fs.statSync(dest).size;
      insertRun(id, "events", "ok", dest, size);
      files.push(dest);
      runIds.push(id);
    } catch (e) {
      insertRun(id, "events", "error", null, null, e instanceof Error ? e.message : "export failed");
      runIds.push(id);
    }
  }

  if (targets.includes("reports")) {
    const id = uuid();
    const dest = path.join(dir, `reports-meta-${Date.now()}.json`);
    try {
      const meta = {
        exportedAt: new Date().toISOString(),
        tenantId: config.defaultTenantId,
        note: "Full report bodies generated on demand via /api/reports",
      };
      fs.writeFileSync(dest, JSON.stringify(meta, null, 2));
      const size = fs.statSync(dest).size;
      insertRun(id, "reports", "ok", dest, size);
      files.push(dest);
      runIds.push(id);
    } catch (e) {
      insertRun(id, "reports", "error", null, null, e instanceof Error ? e.message : "export failed");
      runIds.push(id);
    }
  }

  if (targets.includes("settings")) {
    const id = uuid();
    const dest = path.join(dir, `settings-${Date.now()}.json`);
    try {
      const rows = getDatabase()
        .prepare("SELECT key, value_json, updated_at FROM platform_settings")
        .all();
      fs.writeFileSync(dest, JSON.stringify(rows, null, 2));
      const size = fs.statSync(dest).size;
      insertRun(id, "settings", "ok", dest, size);
      files.push(dest);
      runIds.push(id);
    } catch (e) {
      insertRun(id, "settings", "error", null, null, e instanceof Error ? e.message : "export failed");
      runIds.push(id);
    }
  }

  logAudit({
    userId: actor?.userId,
    actorLabel: actor?.username ?? "system",
    action: "backup.run",
    targetType: "platform",
    targetId: "backup",
    details: { targets, files: files.map((f) => path.basename(f)) },
  });

  return { ok: files.length > 0, files, runIds };
}

export function isBackupEnabled(): boolean {
  const s = getPlatformSetting<{ enabled?: boolean }>("backup");
  return s?.enabled !== false;
}
