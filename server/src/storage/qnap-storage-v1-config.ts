import { config } from "../config.js";
import type { StorageProviderConfig, StorageProviderKind } from "./storage-provider.js";

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
