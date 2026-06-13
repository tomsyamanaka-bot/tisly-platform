/** TiSLY ストレージ設定 v1 — ローカル PDF + QNAP バックアップ（管理者専用） */

import { getDatabase } from "../db/database.js";

export const STORAGE_SETTINGS_KEY = "storage_settings_v1";

export interface QnapConnectionTestResult {
  ok: boolean;
  message: string;
  testedAt: string;
  mock?: boolean;
}

export interface QnapTestPdfSendResult {
  ok: boolean;
  message: string;
  remotePath?: string;
  sentAt: string;
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
  qnap: StorageQnapConfigV1;
  lastConnectionTest?: QnapConnectionTestResult;
  lastTestPdfSend?: QnapTestPdfSendResult;
  updatedAt: string;
}

export interface StorageSettingsPublicV1 extends Omit<StorageSettingsV1, "qnap"> {
  qnap: Omit<StorageQnapConfigV1, "password"> & { hasPassword: boolean };
}

const DEFAULT_QNAP: StorageQnapConfigV1 = {
  host: "",
  port: 8080,
  shareName: "TiSLY",
  username: "",
  password: "",
};

export const DEFAULT_STORAGE_SETTINGS: StorageSettingsV1 = {
  localStorageEnabled: true,
  qnapBackupEnabled: false,
  qnap: { ...DEFAULT_QNAP },
  updatedAt: new Date().toISOString(),
};

function parseSettings(raw: string | undefined): StorageSettingsV1 {
  if (!raw) return { ...DEFAULT_STORAGE_SETTINGS, qnap: { ...DEFAULT_QNAP } };
  try {
    const parsed = JSON.parse(raw) as Partial<StorageSettingsV1>;
    const qnap: Partial<StorageSettingsV1["qnap"]> = parsed.qnap ?? {};
    return {
      localStorageEnabled: parsed.localStorageEnabled !== false,
      qnapBackupEnabled: Boolean(parsed.qnapBackupEnabled),
      qnap: {
        host: String(qnap.host ?? "").trim(),
        port: Number(qnap.port) > 0 ? Number(qnap.port) : 8080,
        shareName: String(qnap.shareName ?? "TiSLY").trim() || "TiSLY",
        username: String(qnap.username ?? "").trim(),
        password: String(qnap.password ?? ""),
      },
      lastConnectionTest: parsed.lastConnectionTest,
      lastTestPdfSend: parsed.lastTestPdfSend,
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

export function getStorageStatusSummary(settings: StorageSettingsV1): {
  localLabel: string;
  qnapLabel: string;
  qnapDetail: string;
  lastCheckedAt: string | null;
} {
  const localLabel = settings.localStorageEnabled ? "✅ 有効" : "—";
  let qnapLabel = "未設定";
  let qnapDetail = "QNAPバックアップが無効です";
  let lastCheckedAt: string | null = null;

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
      qnapDetail = settings.lastConnectionTest.message;
      lastCheckedAt = settings.lastConnectionTest.testedAt;
    } else {
      qnapLabel = "未確認";
      qnapDetail = "接続確認を実行してください";
    }
  }

  return { localLabel, qnapLabel, qnapDetail, lastCheckedAt };
}

export function updateStorageSettingsV1(
  patch: Partial<
    Pick<StorageSettingsV1, "localStorageEnabled" | "qnapBackupEnabled" | "qnap"> & {
      lastConnectionTest?: QnapConnectionTestResult | null;
      lastTestPdfSend?: QnapTestPdfSendResult | null;
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
    qnap: {
      host:
        qnapPatch.host !== undefined ? String(qnapPatch.host).trim() : current.qnap.host,
      port:
        qnapPatch.port !== undefined && Number(qnapPatch.port) > 0
          ? Number(qnapPatch.port)
          : current.qnap.port,
      shareName:
        qnapPatch.shareName !== undefined
          ? String(qnapPatch.shareName).trim() || "TiSLY"
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
