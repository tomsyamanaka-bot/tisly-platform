import { getQnapStatus, listArchives, archiveEventsToFile } from "./event-archive.js";
import { runScheduledBackup, BACKUP_SCHEDULES } from "./backup-manager.js";
import {
  autoExport,
  exportAsExcelCompatible,
  generateCustomerReport,
} from "./auto-export.js";
import { buildQnapArchivePath } from "./archive-path-builder.js";
import { isQnapSmbConfigured } from "./smb-client.js";
import { runExportJob } from "./export-manager.js";

export function getQnapIntegrationOverview() {
  return {
    status: getQnapStatus(),
    smbConfigured: isQnapSmbConfigured(),
    pathTemplates: {
      events: buildQnapArchivePath("events", "tenant", "site"),
      reports: buildQnapArchivePath("reports", "tenant", "site"),
      cameras: buildQnapArchivePath("cameras", "tenant", "site"),
    },
    schedules: BACKUP_SCHEDULES,
    archives: listArchives(),
    futureIntegrations: [
      "OpenAI — 自然言語レポート強化",
      "Ollama — オンプレ LLM",
      "QNAP AI — NAS 内推論",
      "Camera AI — 動体・侵入画像解析",
      "Weather API — 誤報相関",
    ],
  };
}

export {
  getQnapStatus,
  listArchives,
  archiveEventsToFile,
  runScheduledBackup,
  autoExport,
  exportAsExcelCompatible,
  generateCustomerReport,
  buildQnapArchivePath,
  isQnapSmbConfigured,
  runExportJob,
};
