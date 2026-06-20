/** TiSLY Knowledge QNAP 同期サービス v1 */

import fs from "fs";
import path from "path";
import { QnapWebDavClient } from "../business/services/qnapWebDav.js";
import { buildMothershipKnowledgeRelativePath } from "../storage/mothership-paths-v1.js";
import {
  getStorageSettingsV1,
  type StorageSettingsV1,
} from "../storage/storage-settings-store.js";
import { isQnapStorageMockMode, settingsToWebDavConfig } from "../storage/qnap-storage-service.js";
import {
  markKnowledgeQnapFailedV1,
  markKnowledgeQnapSuccessV1,
  markKnowledgeQnapUploadingV1,
  type KnowledgeQnapQueueItemV1,
} from "./knowledge-qnap-sync-store-v1.js";
import { getKnowledgeCardV1, saveKnowledgeCardV1 } from "./knowledge-store-v1.js";

function mockMirrorRoot(): string {
  return path.join(process.cwd(), "uploads", "qnap-storage-mock");
}

async function mockUpload(
  settings: StorageSettingsV1,
  item: KnowledgeQnapQueueItemV1
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!fs.existsSync(item.localPath)) {
    return { ok: false, error: "Local file not found" };
  }
  const dest = path.join(mockMirrorRoot(), settings.qnap.shareName, item.relativePath);
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(item.localPath, dest);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function realUpload(
  settings: StorageSettingsV1,
  item: KnowledgeQnapQueueItemV1
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!fs.existsSync(item.localPath)) {
    return { ok: false, error: "Local file not found" };
  }
  try {
    const cfg = settingsToWebDavConfig(settings);
    const client = new QnapWebDavClient(cfg);
    await client.uploadLocalFiles([{ localPath: item.localPath, remotePath: item.relativePath }]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function updateCardQnapStatus(cardId: string, status: "pending" | "success" | "failed"): void {
  const card = getKnowledgeCardV1(cardId);
  if (!card) return;
  saveKnowledgeCardV1({ ...card, qnapSyncStatus: status }, { skipQnapQueue: true });
}

export async function processKnowledgeQnapSyncItemV1(item: KnowledgeQnapQueueItemV1): Promise<boolean> {
  const settings = getStorageSettingsV1();
  if (!settings.qnapBackupEnabled) {
    markKnowledgeQnapFailedV1(item.id, "QNAP backup disabled");
    updateCardQnapStatus(item.cardId, "failed");
    return false;
  }

  markKnowledgeQnapUploadingV1(item.id);
  const result = isQnapStorageMockMode(settings)
    ? await mockUpload(settings, item)
    : await realUpload(settings, item);

  if (result.ok) {
    markKnowledgeQnapSuccessV1(item.id);
    updateCardQnapStatus(item.cardId, "success");

    const indexPath = path.join(
      process.cwd(),
      "data",
      "knowledge",
      "SearchIndex",
      "index.json"
    );
    if (fs.existsSync(indexPath)) {
      const indexRel = buildMothershipKnowledgeRelativePath("SearchIndex", "index.json");
      const indexUpload = isQnapStorageMockMode(settings)
        ? await mockUpload(settings, { ...item, relativePath: indexRel, localPath: indexPath })
        : await realUpload(settings, { ...item, relativePath: indexRel, localPath: indexPath });
      if (!indexUpload.ok) {
        /* index sync is best-effort */
      }
    }
    return true;
  }

  markKnowledgeQnapFailedV1(item.id, result.error);
  updateCardQnapStatus(item.cardId, "failed");
  return false;
}
