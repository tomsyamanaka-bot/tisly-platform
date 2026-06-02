import { getQnapStatus, listArchives, archiveEventsToFile } from "./event-archive.js";
import { runScheduledBackup, BACKUP_SCHEDULES } from "./backup-manager.js";
import {
  autoExport,
  exportAsExcelCompatible,
  generateCustomerReport,
} from "./auto-export.js";

export function getQnapIntegrationOverview() {
  return {
    status: getQnapStatus(),
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
};
