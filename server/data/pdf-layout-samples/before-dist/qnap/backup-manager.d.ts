export type BackupSchedule = "daily" | "weekly" | "monthly";
export interface BackupJobResult {
    schedule: BackupSchedule;
    jsonPath: string;
    csvPath: string;
    at: string;
}
export declare function runScheduledBackup(schedule: BackupSchedule): BackupJobResult;
export declare const BACKUP_SCHEDULES: BackupSchedule[];
