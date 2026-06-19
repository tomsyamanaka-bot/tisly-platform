import { config } from "../config.js";
import type { StorageProviderConfig, StorageProviderKind } from "./storage-provider.js";
import { getStorageSettingsV1 } from "./storage-settings-store.js";

export type QnapStorageModeV1 = "mock" | "webdav";

export interface QnapStorageHealthV1 {
  storageProvider: StorageProviderKind;
  qnapConfigured: boolean;
  qnapMode: QnapStorageModeV1;
  qnapLastTestAt: string | null;
  qnapLastError: string | null;
}

export interface QnapWebDavEnvConfig {
  webdavUrl: string;
  username: string;
  password: string;
  baseDir: string;
  configured: boolean;
}

export function getQnapWebDavEnvConfig(): QnapWebDavEnvConfig {
  const webdavUrl = config.qnapWebDav.url;
  const username = config.qnapWebDav.username;
  const password = config.qnapWebDav.password;
  const baseDir = config.qnapWebDav.baseDir || "/TiSLY";
  const configured = Boolean(webdavUrl && username && password);
  return { webdavUrl, username, password, baseDir, configured };
}

export function isQnapWebDavConfigured(): boolean {
  return getQnapWebDavEnvConfig().configured;
}

export function resolveQnapStorageProviderKind(): StorageProviderKind {
  const forced = (process.env.STORAGE_PROVIDER ?? "").trim().toLowerCase();
  if (forced === "mock" || forced === "local" || forced === "webdav" || forced === "qnap") {
    return forced;
  }
  if (process.env.STORAGE_PROVIDER_MOCK === "true") return "mock";
  if (process.env.NODE_ENV === "test") return "mock";
  if (!isQnapWebDavConfigured()) return "mock";
  return "webdav";
}

export function buildStorageProviderConfig(kind?: StorageProviderKind): StorageProviderConfig {
  const resolved = kind ?? resolveQnapStorageProviderKind();
  const env = getQnapWebDavEnvConfig();
  return {
    kind: resolved,
    webdavUrl: env.webdavUrl,
    username: env.username,
    password: env.password,
    basePath: env.baseDir,
  };
}

/** health API / 設定 UI 用 — secret は含めない */
export function getQnapStorageHealthV1(): QnapStorageHealthV1 {
  const env = getQnapWebDavEnvConfig();
  const providerKind = resolveQnapStorageProviderKind();
  const qnapMode: QnapStorageModeV1 =
    env.configured && providerKind === "webdav" ? "webdav" : "mock";

  let qnapLastTestAt: string | null = null;
  let qnapLastError: string | null = null;
  try {
    const settings = getStorageSettingsV1();
    if (settings.lastConnectionTest) {
      qnapLastTestAt = settings.lastConnectionTest.testedAt;
      if (!settings.lastConnectionTest.ok) {
        qnapLastError = settings.lastConnectionTest.message;
      }
    }
    if (!qnapLastError && settings.lastTestPdfSend && !settings.lastTestPdfSend.ok) {
      qnapLastError = settings.lastTestPdfSend.message;
      qnapLastTestAt = qnapLastTestAt ?? settings.lastTestPdfSend.sentAt;
    }
    if (!qnapLastError && settings.lastTestPdfDelete && !settings.lastTestPdfDelete.ok) {
      qnapLastError = settings.lastTestPdfDelete.message;
      qnapLastTestAt = qnapLastTestAt ?? settings.lastTestPdfDelete.deletedAt;
    }
  } catch {
    /* platform_settings 未初期化時 */
  }

  return {
    storageProvider: providerKind,
    qnapConfigured: env.configured,
    qnapMode,
    qnapLastTestAt,
    qnapLastError,
  };
}
