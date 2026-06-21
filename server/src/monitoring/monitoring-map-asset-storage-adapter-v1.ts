/** TiSLY Monitoring mapAsset V3.3 — ファイル保存 adapter（local / qnap-webdav / mock） */

import fs from "fs";
import path from "path";

export type MonitoringMapAssetStorageModeV1 = "local" | "qnap-webdav" | "mock";

export interface MonitoringMapAssetStorageSaveInputV1 {
  siteId: string;
  safeFileName: string;
  buffer: Buffer;
}

export interface MonitoringMapAssetStorageSaveResultV1 {
  ok: boolean;
  mode: MonitoringMapAssetStorageModeV1;
  fileUrl: string;
  previewUrl: string;
  message?: string;
}

export interface MonitoringMapAssetBackupStatusV1 {
  mode: MonitoringMapAssetStorageModeV1;
  localOk: boolean;
  qnapAvailable: boolean;
  qnapMockReady: boolean;
  message: string;
}

export function resolveMonitoringMapAssetStorageModeV1(): MonitoringMapAssetStorageModeV1 {
  const raw = String(process.env.TISLY_MONITORING_MAP_ASSET_STORAGE ?? "local").toLowerCase();
  if (raw === "qnap-webdav" || raw === "mock") return raw;
  return "local";
}

export function getMonitoringMapAssetUploadRootV1(): string {
  const override = process.env.TISLY_MONITORING_MAP_ASSET_UPLOAD_ROOT;
  if (override) {
    return path.isAbsolute(override) ? override : path.join(process.cwd(), override);
  }
  return path.join(process.cwd(), "uploads", "monitoring");
}

/** @alias buildMonitoringMapAssetPublicUrlV1 */
export function getAssetPublicUrl(siteId: string, safeFileName: string): string {
  return buildMonitoringMapAssetPublicUrlV1(siteId, safeFileName);
}

export function buildMonitoringMapAssetPublicUrlV1(siteId: string, safeFileName: string): string {
  return `/uploads/monitoring/${siteId}/${safeFileName}`;
}

function resolveLocalPath(siteId: string, safeFileName: string): string {
  const siteDir = path.join(getMonitoringMapAssetUploadRootV1(), siteId);
  const resolved = path.resolve(siteDir, safeFileName);
  if (!resolved.startsWith(path.resolve(siteDir))) {
    throw new Error("invalid path");
  }
  return resolved;
}

/** local 本体保存 */
export function saveLocalAsset(input: MonitoringMapAssetStorageSaveInputV1): MonitoringMapAssetStorageSaveResultV1 {
  const siteDir = path.join(getMonitoringMapAssetUploadRootV1(), input.siteId);
  fs.mkdirSync(siteDir, { recursive: true });
  const fullPath = resolveLocalPath(input.siteId, input.safeFileName);
  fs.writeFileSync(fullPath, input.buffer);
  const fileUrl = buildMonitoringMapAssetPublicUrlV1(input.siteId, input.safeFileName);
  const isImage = /\.(jpg|jpeg|png)$/i.test(input.safeFileName);
  return {
    ok: true,
    mode: "local",
    fileUrl,
    previewUrl: isImage ? fileUrl : "/icons/icon-128.png",
  };
}

/** QNAP WebDAV mock — インターフェース確定用（本接続は未実装） */
export function saveQnapAssetMock(
  input: MonitoringMapAssetStorageSaveInputV1
): MonitoringMapAssetStorageSaveResultV1 {
  const fileUrl = buildMonitoringMapAssetPublicUrlV1(input.siteId, input.safeFileName);
  return {
    ok: false,
    mode: "qnap-webdav",
    fileUrl,
    previewUrl: "/icons/icon-128.png",
    message: "qnap-webdav backup mock — use saveLocalAsset for production writes",
  };
}

function saveMock(input: MonitoringMapAssetStorageSaveInputV1): MonitoringMapAssetStorageSaveResultV1 {
  const fileUrl = buildMonitoringMapAssetPublicUrlV1(input.siteId, input.safeFileName);
  return {
    ok: true,
    mode: "mock",
    fileUrl,
    previewUrl: "/icons/icon-128.png",
    message: "mock mode — file not written to disk",
  };
}

async function saveQnapWebDav(
  input: MonitoringMapAssetStorageSaveInputV1
): Promise<MonitoringMapAssetStorageSaveResultV1> {
  // TODO: QNAP WebDAV 本接続 — \\192.168.1.10\TiSLY\monitoring\{siteId}\
  return saveQnapAssetMock(input);
}

export async function saveMonitoringMapAssetFileV1(
  input: MonitoringMapAssetStorageSaveInputV1
): Promise<MonitoringMapAssetStorageSaveResultV1> {
  const mode = resolveMonitoringMapAssetStorageModeV1();
  try {
    if (mode === "mock") return saveMock(input);
    if (mode === "qnap-webdav") return saveQnapWebDav(input);
    return saveLocalAsset(input);
  } catch {
    return {
      ok: false,
      mode,
      fileUrl: "",
      previewUrl: "/icons/icon-128.png",
      message: "file save failed",
    };
  }
}

/** ローカル実ファイル削除（存在しなくても ok） */
export function deleteLocalAsset(siteId: string, safeFileName: string): boolean {
  if (!safeFileName) return false;
  try {
    const fullPath = resolveLocalPath(siteId, safeFileName);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    return true;
  } catch {
    return false;
  }
}

export function getBackupStatus(): MonitoringMapAssetBackupStatusV1 {
  const mode = resolveMonitoringMapAssetStorageModeV1();
  const root = getMonitoringMapAssetUploadRootV1();
  let localOk = false;
  try {
    fs.mkdirSync(root, { recursive: true });
    localOk = fs.existsSync(root);
  } catch {
    localOk = false;
  }
  const qnapConfigured = mode === "qnap-webdav" || Boolean(process.env.TISLY_QNAP_WEBDAV_URL);
  return {
    mode,
    localOk,
    qnapAvailable: false,
    qnapMockReady: qnapConfigured,
    message:
      mode === "local"
        ? "local storage active — QNAP WebDAV backup pending"
        : mode === "qnap-webdav"
          ? "qnap-webdav mode selected — mock interface only"
          : "mock storage — no disk writes",
  };
}

/** テスト用 — アップロードディレクトリを削除 */
export function resetMonitoringMapAssetUploadDirForTestV1(siteId?: string): void {
  const root = getMonitoringMapAssetUploadRootV1();
  if (siteId) {
    const dir = path.join(root, siteId);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    return;
  }
  if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
}
