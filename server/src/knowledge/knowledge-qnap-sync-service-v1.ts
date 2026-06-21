/** TiSLY Knowledge QNAP 同期サービス v1 — KnowledgeCards / Candidates / Assets / SearchIndex */

import fs from "fs";
import path from "path";
import { QnapWebDavClient } from "../business/services/qnapWebDav.js";
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

async function uploadItem(
  settings: StorageSettingsV1,
  item: KnowledgeQnapQueueItemV1
): Promise<{ ok: true } | { ok: false; error: string }> {
  return isQnapStorageMockMode(settings) ? mockUpload(settings, item) : realUpload(settings, item);
}

function updateCardQnapStatus(cardId: string, status: "pending" | "success" | "failed"): void {
  const card = getKnowledgeCardV1(cardId);
  if (!card) return;
  saveKnowledgeCardV1({ ...card, qnapSyncStatus: status }, { skipQnapQueue: true });
}

export function getKnowledgeQnapConnectionInfoV1(): {
  enabled: boolean;
  mockMode: boolean;
  host: string;
  shareName: string;
  connected: boolean;
  message: string;
} {
  const settings = getStorageSettingsV1();
  const mockMode = isQnapStorageMockMode(settings);
  const enabled = settings.qnapBackupEnabled;
  if (!enabled) {
    return {
      enabled: false,
      mockMode: true,
      host: settings.qnap.host,
      shareName: settings.qnap.shareName,
      connected: false,
      message: "QNAP backup disabled — local queue only",
    };
  }
  if (mockMode) {
    return {
      enabled: true,
      mockMode: true,
      host: settings.qnap.host,
      shareName: settings.qnap.shareName,
      connected: true,
      message: "Mock mode — files mirrored to uploads/qnap-storage-mock",
    };
  }
  return {
    enabled: true,
    mockMode: false,
    host: settings.qnap.host,
    shareName: settings.qnap.shareName,
    connected: true,
    message: "WebDAV configured — worker syncs on tick",
  };
}

export async function processKnowledgeQnapSyncItemV1(item: KnowledgeQnapQueueItemV1): Promise<boolean> {
  const settings = getStorageSettingsV1();
  if (!settings.qnapBackupEnabled) {
    markKnowledgeQnapFailedV1(item.id, "QNAP backup disabled");
    if (item.syncKind === "KnowledgeCards") {
      updateCardQnapStatus(item.resourceId, "failed");
    }
    return false;
  }

  markKnowledgeQnapUploadingV1(item.id);
  const result = await uploadItem(settings, item);

  if (result.ok) {
    markKnowledgeQnapSuccessV1(item.id);
    if (item.syncKind === "KnowledgeCards") {
      updateCardQnapStatus(item.resourceId, "success");
    }
    return true;
  }

  markKnowledgeQnapFailedV1(item.id, result.error);
  if (item.syncKind === "KnowledgeCards") {
    updateCardQnapStatus(item.resourceId, "failed");
  }
  return false;
}
