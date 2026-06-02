import { archiveEventsToFile } from "./event-archive.js";

export type BackupSchedule = "daily" | "weekly" | "monthly";

const SCHEDULE_DAYS: Record<BackupSchedule, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

export interface BackupJobResult {
  schedule: BackupSchedule;
  jsonPath: string;
  csvPath: string;
  at: string;
}

export function runScheduledBackup(schedule: BackupSchedule): BackupJobResult {
  const days = SCHEDULE_DAYS[schedule];
  const jsonPath = archiveEventsToFile("json", days);
  const csvPath = archiveEventsToFile("csv", days);
  return {
    schedule,
    jsonPath,
    csvPath,
    at: new Date().toISOString(),
  };
}

export const BACKUP_SCHEDULES: BackupSchedule[] = ["daily", "weekly", "monthly"];
