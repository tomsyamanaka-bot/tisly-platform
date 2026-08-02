/** TiSLY ストレージ設定 v1 — ローカル PDF + QNAP バックアップ（管理者専用） */

import { getDatabase } from "../db/database.js";
import {
  DOCUMENT_NAS_DEFAULT_PORT,
  DOCUMENT_NAS_HOST,
  DOCUMENT_NAS_SHARE,
  resolveDocumentNasLocalHost,
  resolveDocumentNasLocalPort,
} from "./qnap-nas-hosts-v1.js";

export const STORAGE_SETTINGS_KEY = "storage_settings_v1";

/** QNAP 保存ルート: VPS経由 / ローカルWi-Fi直接 / 自動フォールバック */
export type QnapSaveRouteV1 = "auto" | "vps" | "local_wifi";

export interface QnapConnectionTestResult {
  ok: boolean;
  message: string;
  testedAt: string;
  mock?: boolean;
  steps?: Array<{ step: number; label: string; ok: boolean; message: string }>;
  latencyMs?: number | null;
  errorCode?: string | null;
  errorReason?: string | null;
  logs?: string[];
}

export interface QnapTestPdfSendResult {
  ok: boolean;
  message: string;
  remotePath?: string;
  sentAt: string;
  mock?: boolean;
}

export interface QnapTestPdfDeleteResult {
  ok: boolean;
  message: string;
  remotePath?: string;
  deletedAt: string;
  mock?: boolean;
}

export interface StorageQnapConfigV1 {
  host: string;
  port: number;
  shareName: string;
  username: string;
  password: string;
}

export interface StorageSettingsV1 {
  localStorageEnabled: boolean;
  qnapBackupEnabled: boolean;
  /** auto=VPS優先・失敗時ローカルWi-Fi / vps=VPSのみ / local_wifi=ブラウザ直接 */
  saveRoute: QnapSaveRouteV1;
  qnap: StorageQnapConfigV1;
  lastConnectionTest?: QnapConnectionTestResult;
  lastTestPdfSend?: QnapTestPdfSendResult;
  lastTestPdfDelete?: QnapTestPdfDeleteResult;
  updatedAt: string;
}

export interface StorageSettingsPublicV1 extends Omit<StorageSettingsV1, "qnap"> {
  qnap: Omit<StorageQnapConfigV1, "password"> & { hasPassword: boolean };
}

const DEFAULT_QNAP: StorageQnapConfigV1 = {
  /** 書類保存用 NAS (nastoms) — 未入力でもローカル Wi-Fi 保存の既定宛先 */
  host: DOCUMENT_NAS_HOST,
  port: DOCUMENT_NAS_DEFAULT_PORT,
  shareName: DOCUMENT_NAS_SHARE,
  username: "",
  password: "",
};

export const DEFAULT_STORAGE_SETTINGS: StorageSettingsV1 = {
  localStorageEnabled: true,
  qnapBackupEnabled: false,
  saveRoute: "auto",
  qnap: { ...DEFAULT_QNAP },
  updatedAt: new Date().toISOString(),
};

function parseSaveRoute(raw: unknown): QnapSaveRouteV1 {
  if (raw === "vps" || raw === "local_wifi" || raw === "auto") return raw;
  return "auto";
}

function parseSettings(raw: string | undefined): StorageSettingsV1 {
  if (!raw) return { ...DEFAULT_STORAGE_SETTINGS, qnap: { ...DEFAULT_QNAP } };
  try {
    const parsed = JSON.parse(raw) as Partial<StorageSettingsV1>;
    const qnap: Partial<StorageSettingsV1["qnap"]> = parsed.qnap ?? {};
    return {
      localStorageEnabled: parsed.localStorageEnabled !== false,
      qnapBackupEnabled: Boolean(parsed.qnapBackupEnabled),
      saveRoute: parseSaveRoute(parsed.saveRoute),
      qnap: {
        host: resolveDocumentNasLocalHost(String(qnap.host ?? "").trim()),
        port: resolveDocumentNasLocalPort(
          Number(qnap.port) > 0 ? Number(qnap.port) : null
        ),
        shareName:
          String(qnap.shareName ?? DOCUMENT_NAS_SHARE).trim() || DOCUMENT_NAS_SHARE,
        username: String(qnap.username ?? "").trim(),
        password: String(qnap.password ?? ""),
      },
      lastConnectionTest: parsed.lastConnectionTest,
      lastTestPdfSend: parsed.lastTestPdfSend,
      lastTestPdfDelete: parsed.lastTestPdfDelete,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { ...DEFAULT_STORAGE_SETTINGS, qnap: { ...DEFAULT_QNAP } };
  }
}

export function getStorageSettingsV1(): StorageSettingsV1 {
  const row = getDatabase()
    .prepare(`SELECT value_json FROM platform_settings WHERE key = ?`)
    .get(STORAGE_SETTINGS_KEY) as { value_json: string } | undefined;
  return parseSettings(row?.value_json);
}

export function toPublicStorageSettings(settings: StorageSettingsV1): StorageSettingsPublicV1 {
  const { password, ...qnapPublic } = settings.qnap;
  return {
    ...settings,
    qnap: {
      ...qnapPublic,
      hasPassword: Boolean(password),
    },
  };
}

function saveRouteLabel(route: QnapSaveRouteV1): string {
  if (route === "vps") return "VPS（Tailscale）経由";
  if (route === "local_wifi") return "ローカルWi-Fi経由";
  return "自動（推奨）";
}

export function getStorageStatusSummary(settings: StorageSettingsV1): {
  localLabel: string;
  qnapLabel: string;
  qnapDetail: string;
  lastCheckedAt: string | null;
  saveRoute: QnapSaveRouteV1;
  saveRouteLabel: string;
} {
  const localLabel = settings.localStorageEnabled ? "✅ 有効" : "—";
  let qnapLabel = "未設定";
  let qnapDetail = "QNAPバックアップが無効です";
  let lastCheckedAt: string | null = null;
  const route = parseSaveRoute(settings.saveRoute);

  if (settings.qnapBackupEnabled) {
    const hasCreds =
      Boolean(settings.qnap.host) &&
      Boolean(settings.qnap.shareName) &&
      Boolean(settings.qnap.username) &&
      Boolean(settings.qnap.password);
    if (!hasCreds) {
      qnapLabel = "未設定";
      qnapDetail = "接続情報が不足しています";
    } else if (settings.lastConnectionTest?.ok) {
      qnapLabel = "接続成功";
      qnapDetail = settings.lastConnectionTest.message;
      lastCheckedAt = settings.lastConnectionTest.testedAt;
    } else if (settings.lastConnectionTest && !settings.lastConnectionTest.ok) {
      qnapLabel = "接続失敗";
      const code = settings.lastConnectionTest.errorCode;
      qnapDetail = code
        ? `${code}: ${settings.lastConnectionTest.errorReason || settings.lastConnectionTest.message}`
        : settings.lastConnectionTest.message;
      lastCheckedAt = settings.lastConnectionTest.testedAt;
    } else {
      qnapLabel = "未確認";
      qnapDetail = "接続確認を実行してください";
    }
  }

  return {
    localLabel,
    qnapLabel,
    qnapDetail,
    lastCheckedAt,
    saveRoute: route,
    saveRouteLabel: saveRouteLabel(route),
  };
}

export function updateStorageSettingsV1(
  patch: Partial<
    Pick<StorageSettingsV1, "localStorageEnabled" | "qnapBackupEnabled" | "saveRoute" | "qnap"> & {
      lastConnectionTest?: QnapConnectionTestResult | null;
      lastTestPdfSend?: QnapTestPdfSendResult | null;
      lastTestPdfDelete?: QnapTestPdfDeleteResult | null;
    }
  >
): StorageSettingsV1 {
  const current = getStorageSettingsV1();
  const qnapPatch: Partial<StorageSettingsV1["qnap"]> = patch.qnap ?? {};
  const passwordIncoming = qnapPatch.password;
  const nextPassword =
    passwordIncoming === undefined
      ? current.qnap.password
      : String(passwordIncoming).trim()
        ? String(passwordIncoming)
        : current.qnap.password;

  const next: StorageSettingsV1 = {
    localStorageEnabled:
      patch.localStorageEnabled !== undefined
        ? Boolean(patch.localStorageEnabled)
        : current.localStorageEnabled,
    qnapBackupEnabled:
      patch.qnapBackupEnabled !== undefined
        ? Boolean(patch.qnapBackupEnabled)
        : current.qnapBackupEnabled,
    saveRoute:
      patch.saveRoute !== undefined ? parseSaveRoute(patch.saveRoute) : current.saveRoute,
    qnap: {
      host:
        qnapPatch.host !== undefined ? String(qnapPatch.host).trim() : current.qnap.host,
      port:
        qnapPatch.port !== undefined && Number(qnapPatch.port) > 0
          ? Number(qnapPatch.port)
          : current.qnap.port,
      shareName:
        qnapPatch.shareName !== undefined
          ? String(qnapPatch.shareName).trim() || DOCUMENT_NAS_SHARE
          : current.qnap.shareName,
      username:
        qnapPatch.username !== undefined
          ? String(qnapPatch.username).trim()
          : current.qnap.username,
      password: nextPassword,
    },
    lastConnectionTest:
      patch.lastConnectionTest === null
        ? undefined
        : patch.lastConnectionTest ?? current.lastConnectionTest,
    lastTestPdfSend:
      patch.lastTestPdfSend === null
        ? undefined
        : patch.lastTestPdfSend ?? current.lastTestPdfSend,
    lastTestPdfDelete:
      patch.lastTestPdfDelete === null
        ? undefined
        : patch.lastTestPdfDelete ?? current.lastTestPdfDelete,
    updatedAt: new Date().toISOString(),
  };

  getDatabase()
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
    )
    .run(STORAGE_SETTINGS_KEY, JSON.stringify(next));

  return next;
}
