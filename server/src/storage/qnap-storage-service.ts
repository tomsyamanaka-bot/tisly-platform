import fs from "fs";
import path from "path";
import { QnapWebDavClient } from "../business/services/qnapWebDav.js";
import type { QnapUploadConfig } from "../business/services/qnapBusinessArchive.js";
import {
  getStorageSettingsV1,
  updateStorageSettingsV1,
  type QnapConnectionTestResult,
  type QnapTestPdfDeleteResult,
  type QnapTestPdfSendResult,
  type StorageSettingsV1,
} from "./storage-settings-store.js";

export const QNAP_TEST_PDF_REMOTE = "Test/tisly-test.pdf";
export const QNAP_TEST_PDF_LOCAL = path.join(process.cwd(), "data", "tisly-test.pdf");

function webDavProtocol(port: number): "http" | "https" {
  // 5006/5001/443 = HTTPS WebDAV、5005 = nastoms HTTP WebDAV
  return port === 443 || port === 5001 || port === 5006 ? "https" : "http";
}

export function buildWebDavUrl(host: string, port: number, shareName: string): string {
  const share = shareName.replace(/^\/+|\/+$/g, "") || "TiSLY";
  return `${webDavProtocol(port)}://${host.trim()}:${port}/${share}`;
}

export function settingsToWebDavConfig(settings: StorageSettingsV1): QnapUploadConfig {
  const { qnap } = settings;
  return {
    mode: "real",
    webdavUrl: buildWebDavUrl(qnap.host, qnap.port, qnap.shareName),
    username: qnap.username,
    password: qnap.password,
    basePath: "/",
  };
}

export function isQnapStorageMockMode(settings: StorageSettingsV1): boolean {
  if (process.env.QNAP_STORAGE_FORCE_REAL === "true") return false;
  if (process.env.QNAP_STORAGE_MOCK === "true") return true;
  // dotenv override で NODE_ENV が上書きされても、テスト DB ならモック維持
  const dbPath = (process.env.TISLY_DB_PATH || "").replace(/\\/g, "/");
  if (process.env.NODE_ENV === "test" || /\/test[-_]|test[-_].*\.db$/i.test(dbPath)) {
    return true;
  }
  // 本番 .env に WebDAV がある場合はモックミラー禁止（実機通信）
  const envUrl = (process.env.QNAP_WEBDAV_URL || "").trim();
  const envUser = (
    process.env.QNAP_WEBDAV_USER ||
    process.env.QNAP_USERNAME ||
    ""
  ).trim();
  const envPass =
    process.env.QNAP_WEBDAV_PASSWORD || process.env.QNAP_PASSWORD || "";
  if (envUrl && envUser && envPass) return false;
  if (!settings.qnapBackupEnabled) return true;
  if (!settings.qnap.host.trim()) return true;
  if (!settings.qnap.username.trim() || !settings.qnap.password) return true;
  return false;
}

function mockMirrorRoot(): string {
  return path.join(process.cwd(), "uploads", "qnap-storage-mock");
}

function ensureTestPdfLocal(): string {
  if (fs.existsSync(QNAP_TEST_PDF_LOCAL)) return QNAP_TEST_PDF_LOCAL;
  const dir = path.dirname(QNAP_TEST_PDF_LOCAL);
  fs.mkdirSync(dir, { recursive: true });
  const minimalPdf = Buffer.from(
    `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 300 144]/Contents 4 0 R>>endobj
4 0 obj<</Length 44>>stream
BT /F1 14 Tf 40 100 Td (TiSLY Test PDF) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000010 00000 n 
0000000053 00000 n 
0000000102 00000 n 
0000000179 00000 n 
trailer<</Size 5/Root 1 0 R>>
startxref
273
%%EOF`,
    "utf8"
  );
  fs.writeFileSync(QNAP_TEST_PDF_LOCAL, minimalPdf);
  return QNAP_TEST_PDF_LOCAL;
}

function validateQnapSettings(settings: StorageSettingsV1): string | null {
  if (!settings.qnapBackupEnabled) {
    return "QNAPバックアップが無効です。有効にしてから実行してください。";
  }
  if (!settings.qnap.host.trim()) return "IPアドレスを入力してください。";
  if (!settings.qnap.shareName.trim()) return "共有フォルダ名を入力してください。";
  if (!settings.qnap.username.trim()) return "ユーザー名を入力してください。";
  if (!settings.qnap.password) return "パスワードを入力してください。";
  return null;
}

async function mockConnectionTest(settings: StorageSettingsV1): Promise<QnapConnectionTestResult> {
  const err = validateQnapSettings(settings);
  if (err) {
    return { ok: false, message: err, testedAt: new Date().toISOString(), mock: true };
  }
  const mirror = path.join(mockMirrorRoot(), settings.qnap.shareName);
  fs.mkdirSync(mirror, { recursive: true });
  return {
    ok: true,
    message: `モック接続成功 — 共有フォルダ ${settings.qnap.shareName} をローカルに確認 (${mirror})`,
    testedAt: new Date().toISOString(),
    mock: true,
  };
}

async function mockTestPdfSend(settings: StorageSettingsV1): Promise<QnapTestPdfSendResult> {
  const err = validateQnapSettings(settings);
  if (err) {
    return { ok: false, message: err, sentAt: new Date().toISOString(), mock: true };
  }
  const localPdf = ensureTestPdfLocal();
  const remotePath = `${settings.qnap.shareName}/${QNAP_TEST_PDF_REMOTE}`.replace(/\\/g, "/");
  const dest = path.join(mockMirrorRoot(), remotePath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(localPdf, dest);
  return {
    ok: true,
    message: `モック送信成功 — ${dest}`,
    remotePath: `/${remotePath}`,
    sentAt: new Date().toISOString(),
    mock: true,
  };
}

export async function runQnapConnectionTest(
  settings?: StorageSettingsV1
): Promise<QnapConnectionTestResult> {
  const current = settings ?? getStorageSettingsV1();
  const validationError = validateQnapSettings(current);
  if (validationError) {
    const result: QnapConnectionTestResult = {
      ok: false,
      message: validationError,
      testedAt: new Date().toISOString(),
    };
    updateStorageSettingsV1({ lastConnectionTest: result });
    return result;
  }

  let result: QnapConnectionTestResult;
  if (isQnapStorageMockMode(current)) {
    result = await mockConnectionTest(current);
  } else {
    const cfg = settingsToWebDavConfig(current);
    const client = new QnapWebDavClient(cfg);
    const base = await client.testConnection();
    if (!base.ok) {
      result = { ok: false, message: base.message, testedAt: new Date().toISOString() };
    } else {
      const share = await client.verifyShareFolder();
      result = {
        ok: share.ok,
        message: share.ok
          ? `✅ 接続成功 — 共有フォルダ ${current.qnap.shareName} を確認`
          : share.message,
        testedAt: new Date().toISOString(),
      };
    }
  }

  updateStorageSettingsV1({ lastConnectionTest: result });
  return result;
}

export async function runQnapTestPdfSend(
  settings?: StorageSettingsV1
): Promise<QnapTestPdfSendResult> {
  const current = settings ?? getStorageSettingsV1();
  const validationError = validateQnapSettings(current);
  if (validationError) {
    const result: QnapTestPdfSendResult = {
      ok: false,
      message: validationError,
      sentAt: new Date().toISOString(),
    };
    updateStorageSettingsV1({ lastTestPdfSend: result });
    return result;
  }

  const localPdf = ensureTestPdfLocal();
  const remotePath = QNAP_TEST_PDF_REMOTE;

  let result: QnapTestPdfSendResult;
  if (isQnapStorageMockMode(current)) {
    result = await mockTestPdfSend(current);
  } else {
    try {
      const cfg = settingsToWebDavConfig(current);
      const client = new QnapWebDavClient(cfg);
      await client.mkcol("Test");
      await client.putFile(localPdf, remotePath);
      result = {
        ok: true,
        message: `✅ テストPDF送信成功 — /${current.qnap.shareName}/${remotePath}`,
        remotePath: `/${current.qnap.shareName}/${remotePath}`,
        sentAt: new Date().toISOString(),
      };
    } catch (e) {
      result = {
        ok: false,
        message: (e as Error).message,
        sentAt: new Date().toISOString(),
      };
    }
  }

  updateStorageSettingsV1({ lastTestPdfSend: result });
  return result;
}

async function mockTestPdfDelete(settings: StorageSettingsV1): Promise<QnapTestPdfDeleteResult> {
  const err = validateQnapSettings(settings);
  if (err) {
    return { ok: false, message: err, deletedAt: new Date().toISOString(), mock: true };
  }
  const remotePath = `${settings.qnap.shareName}/${QNAP_TEST_PDF_REMOTE}`.replace(/\\/g, "/");
  const dest = path.join(mockMirrorRoot(), remotePath);
  if (fs.existsSync(dest)) {
    fs.unlinkSync(dest);
    return {
      ok: true,
      message: `モック削除成功 — ${dest}`,
      remotePath: `/${remotePath}`,
      deletedAt: new Date().toISOString(),
      mock: true,
    };
  }
  return {
    ok: true,
    message: "テストファイルは存在しません（既に削除済み）",
    remotePath: `/${remotePath}`,
    deletedAt: new Date().toISOString(),
    mock: true,
  };
}

export async function runQnapTestPdfDelete(
  settings?: StorageSettingsV1
): Promise<QnapTestPdfDeleteResult> {
  const current = settings ?? getStorageSettingsV1();
  const validationError = validateQnapSettings(current);
  if (validationError) {
    const result: QnapTestPdfDeleteResult = {
      ok: false,
      message: validationError,
      deletedAt: new Date().toISOString(),
    };
    updateStorageSettingsV1({ lastTestPdfDelete: result });
    return result;
  }

  let result: QnapTestPdfDeleteResult;
  if (isQnapStorageMockMode(current)) {
    result = await mockTestPdfDelete(current);
  } else {
    try {
      const cfg = settingsToWebDavConfig(current);
      const client = new QnapWebDavClient(cfg);
      await client.deleteFile(QNAP_TEST_PDF_REMOTE);
      result = {
        ok: true,
        message: `✅ テストPDF削除成功 — /${current.qnap.shareName}/${QNAP_TEST_PDF_REMOTE}`,
        remotePath: `/${current.qnap.shareName}/${QNAP_TEST_PDF_REMOTE}`,
        deletedAt: new Date().toISOString(),
      };
    } catch (e) {
      result = {
        ok: false,
        message: (e as Error).message,
        deletedAt: new Date().toISOString(),
      };
    }
  }

  updateStorageSettingsV1({ lastTestPdfDelete: result });
  return result;
}
