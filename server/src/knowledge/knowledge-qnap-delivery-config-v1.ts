/** Knowledge Field UX V4 — QNAP WebDAV 本番接続モード設定（mock / webdav 切替） */

import { getQnapWebDavEnvConfig, isQnapWebDavConfigured } from "../storage/qnap-storage-v1-config.js";
import { MOTHERSHIP_HOST, MOTHERSHIP_UNC } from "../storage/mothership-paths-v1.js";

export type KnowledgeQnapDeliveryModeV1 = "mock" | "webdav";

export interface KnowledgeQnapDeliveryConfigV1 {
  qnapMode: KnowledgeQnapDeliveryModeV1;
  effectiveMode: KnowledgeQnapDeliveryModeV1;
  webdavConfigured: boolean;
  fallbackReason?: string;
  webdavBaseUrl: string;
  fileStationBaseUrl: string;
  shareRoot: string;
  smbRoot: string;
}

function env(key: string, fallback = ""): string {
  return (process.env[key] ?? fallback).trim();
}

/** Knowledge Field 用 QNAP_MODE — mock | webdav（未設定時 mock） */
export function resolveKnowledgeQnapModeV1(): KnowledgeQnapDeliveryModeV1 {
  const raw = env("QNAP_MODE", "mock").toLowerCase();
  if (raw === "webdav" || raw === "real") return "webdav";
  return "mock";
}

export function getKnowledgeQnapDeliveryConfigV1(): KnowledgeQnapDeliveryConfigV1 {
  const requested = resolveKnowledgeQnapModeV1();
  const webdavEnv = getQnapWebDavEnvConfig();
  const webdavBaseUrl =
    env("QNAP_WEBDAV_BASE_URL") ||
    env("QNAP_WEBDAV_URL") ||
    webdavEnv.webdavUrl;
  const shareRoot = env("QNAP_SHARE_ROOT") || env("QNAP_SHARE", "TiSLY");
  const smbRoot = env("QNAP_SMB_ROOT") || MOTHERSHIP_UNC;
  const fileStationBaseUrl =
    env("QNAP_FILESTATION_BASE_URL") ||
    `http://${env("QNAP_HOST") || MOTHERSHIP_HOST}/cgi-bin/filemanager/`;

  const webdavConfigured = Boolean(webdavBaseUrl && webdavEnv.username && webdavEnv.password);

  let effectiveMode: KnowledgeQnapDeliveryModeV1 = "mock";
  let fallbackReason: string | undefined;

  if (requested === "webdav") {
    if (webdavConfigured) {
      effectiveMode = "webdav";
    } else {
      effectiveMode = "mock";
      fallbackReason = "WebDAV 設定不足 — mock/local に自動 fallback";
    }
  } else {
    effectiveMode = "mock";
  }

  return {
    qnapMode: requested,
    effectiveMode,
    webdavConfigured: isQnapWebDavConfigured() || webdavConfigured,
    fallbackReason,
    webdavBaseUrl,
    fileStationBaseUrl,
    shareRoot,
    smbRoot,
  };
}

export function isKnowledgeWebDavDeliveryActiveV1(): boolean {
  return getKnowledgeQnapDeliveryConfigV1().effectiveMode === "webdav";
}
