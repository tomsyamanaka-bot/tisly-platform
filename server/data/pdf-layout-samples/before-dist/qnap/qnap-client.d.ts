import { getQnapStatus, listArchives, archiveEventsToFile } from "./event-archive.js";
import { runScheduledBackup } from "./backup-manager.js";
import { autoExport, exportAsExcelCompatible, generateCustomerReport } from "./auto-export.js";
import { buildQnapArchivePath } from "./archive-path-builder.js";
import { isQnapSmbConfigured } from "./smb-client.js";
import { runExportJob } from "./export-manager.js";
export declare function getQnapIntegrationOverview(): {
    status: {
        connected: boolean;
        host: any;
        archiveDir: any;
        publicUrl: string;
        cameraArchive: {
            providers: string[];
            storage: string;
            retentionDays: number;
            formats: string[];
            status: string;
            qnapPath: string;
        };
        message: string;
    };
    smbConfigured: boolean;
    pathTemplates: {
        events: string;
        reports: string;
        cameras: string;
    };
    schedules: import("./backup-manager.js").BackupSchedule[];
    archives: {
        id: string;
        archiveType: string;
        format: string;
        filePath: string;
        recordCount: number;
        createdAt: string;
    }[];
    futureIntegrations: string[];
};
export { getQnapStatus, listArchives, archiveEventsToFile, runScheduledBackup, autoExport, exportAsExcelCompatible, generateCustomerReport, buildQnapArchivePath, isQnapSmbConfigured, runExportJob, };
