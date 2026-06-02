import { isBackupEnabled, runBackup } from "./backup-manager.js";

let timer: ReturnType<typeof setInterval> | null = null;

/** Daily backup scheduler — call from index.ts when BACKUP_SCHEDULER_ENABLED=true */
export function startBackupScheduler(): void {
  if (process.env.BACKUP_SCHEDULER_ENABLED !== "true") return;
  if (!isBackupEnabled()) return;
  if (timer) return;

  const intervalMs = Number(process.env.BACKUP_INTERVAL_HOURS ?? 24) * 60 * 60 * 1000;
  timer = setInterval(() => {
    runBackup(["sqlite", "events", "settings"]).catch((e) => {
      console.error("[backup-scheduler]", e);
    });
  }, intervalMs);

  console.log(`[backup-scheduler] enabled — every ${intervalMs / 3600000}h`);
}

export function stopBackupScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
