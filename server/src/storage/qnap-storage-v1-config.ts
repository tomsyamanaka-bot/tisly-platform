import { config } from "../config.js";
import type { StorageProviderConfig, StorageProviderKind } from "./storage-provider.js";
import { getStorageSettingsV1 } from "./storage-settings-store.js";
import { QNAP_DEFAULT_BASIC_USER } from "./qnap-basic-auth-v1.js";

export type QnapStorageModeV1 = "mock" | "webdav";

export interface QnapWebDavEnvConfig {
  webdavUrl: string;
  username: string;
  password: string;
  baseDir: string;
  configured: boolean;
}

export interface QnapWebDavEnvStatusV1 {
  ready: boolean;
  missingKeys: string[];
  urlPreview: string | null;
  baseDirPreview: string | null;
  userConfigured: boolean;
  passwordConfigured: boolean;
  baseDirIsDefault: boolean;
  setupGuide: string;
}

export interface QnapStorageHealthV1 {
  storageProvider: StorageProviderKind;
  qnapConfigured: boolean;
  qnapMode: QnapStorageModeV1;
  qnapLastTestAt: string | null;
  qnapLastError: string | null;
  qnapEnv: QnapWebDavEnvStatusV1;
}

const ENV_KEYS = {
  url: "QNAP_WEBDAV_URL",
  user: "QNAP_WEBDAV_USER",
  password: "QNAP_WEBDAV_PASSWORD",
  baseDir: "QNAP_BASE_DIR",
} as const;

/** secret を含めない URL マスク表示 */
export function maskWebDavUrlPreview(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed);
    const host = u.hostname.replace(/(\d+\.\d+\.\d+)\.\d+/, "$1.xxx");
    const port = u.port ? `:${u.port}` : "";
    const path = u.pathname.length > 1 ? u.pathname.slice(0, Math.min(8, u.pathname.length)) + "…" : "";
    return `${u.protocol}//${host}${port}${path}`;
  } catch {
    return trimmed.length > 16 ? `${trimmed.slice(0, 12)}…` : trimmed;
  }
}

export function maskBaseDirPreview(baseDir: string): string {
  const b = (baseDir || "/TiSLY").trim();
  if (b.length <= 8) return b;
  return `${b.slice(0, 6)}…`;
}

export function getQnapWebDavEnvConfig(): QnapWebDavEnvConfig {
  const webdavUrl = config.qnapWebDav.url;
  // QNAP_USER / QNAP_WEBDAV_USER / QNAP_USERNAME。URL があるのにユーザー未設定なら tomsadmin
  const username =
    (config.qnapWebDav.username || "").trim() ||
    (webdavUrl.trim() ? QNAP_DEFAULT_BASIC_USER : "");
  const password = config.qnapWebDav.password;
  const baseDir = config.qnapWebDav.baseDir || "/TiSLY";
  const configured = Boolean(webdavUrl && username && password);
  return { webdavUrl, username, password, baseDir, configured };
}

export function getQnapWebDavEnvStatus(): QnapWebDavEnvStatusV1 {
  const webdavUrl = config.qnapWebDav.url;
  const username = config.qnapWebDav.username;
  const password = config.qnapWebDav.password;
  const baseDir = config.qnapWebDav.baseDir || "/TiSLY";
  const baseDirIsDefault = !process.env.QNAP_BASE_DIR && !process.env.QNAP_BASE_PATH;

  const missingKeys: string[] = [];
  if (!webdavUrl.trim()) missingKeys.push(ENV_KEYS.url);
  if (!username.trim()) missingKeys.push(ENV_KEYS.user);
  if (!password) missingKeys.push(ENV_KEYS.password);
  if (!process.env.QNAP_BASE_DIR?.trim() && baseDirIsDefault) {
    missingKeys.push(`${ENV_KEYS.baseDir}（未設定 — デフォルト /TiSLY を使用）`);
  }

  const ready = missingKeys.filter((k) => !k.includes("デフォルト")).length === 0;
  let setupGuide = "VPS /opt/tisly/server/.env に QNAP WebDAV 設定を追加してください。";
  if (!ready) {
    setupGuide = `不足: ${missingKeys.join(", ")} — VPS /opt/tisly/server/.env を確認`;
  } else {
    setupGuide = "環境変数は設定済み。接続テストを実行して QNAP 実保存を有効化してください。";
  }

  return {
    ready,
    missingKeys,
    urlPreview: webdavUrl.trim() ? maskWebDavUrlPreview(webdavUrl) : null,
    baseDirPreview: maskBaseDirPreview(baseDir),
    userConfigured: Boolean(username.trim()),
    passwordConfigured: Boolean(password),
    baseDirIsDefault,
    setupGuide,
  };
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
  const envStatus = getQnapWebDavEnvStatus();
  const providerKind = resolveQnapStorageProviderKind();
  const qnapMode: QnapStorageModeV1 =
    env.configured && providerKind === "webdav" ? "webdav" : "mock";

  let qnapLastTestAt: string | null = null;
  let qnapLastError: string | null = null;
  let connectionOk = false;
  try {
    const settings = getStorageSettingsV1();
    if (settings.lastConnectionTest) {
      qnapLastTestAt = settings.lastConnectionTest.testedAt;
      connectionOk = settings.lastConnectionTest.ok;
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

  const qnapConfigured =
    qnapMode === "webdav" && env.configured && connectionOk;

  if (!envStatus.ready && envStatus.missingKeys.length) {
    qnapLastError = envStatus.setupGuide;
  }

  return {
    storageProvider: providerKind,
    qnapConfigured,
    qnapMode,
    qnapLastTestAt,
    qnapLastError: qnapConfigured ? null : qnapLastError,
    qnapEnv: envStatus,
  };
}
