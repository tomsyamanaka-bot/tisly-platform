import { archiveEventsToFile } from "./event-archive.js";
const SCHEDULE_DAYS = {
    daily: 1,
    weekly: 7,
    monthly: 30,
};
export function runScheduledBackup(schedule) {
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
export const BACKUP_SCHEDULES = ["daily", "weekly", "monthly"];
