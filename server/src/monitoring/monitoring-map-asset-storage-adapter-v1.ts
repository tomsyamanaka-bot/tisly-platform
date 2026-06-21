/** TiSLY Monitoring mapAsset V3.2 — ファイル保存 adapter（local / qnap-webdav / mock） */

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

function saveLocal(input: MonitoringMapAssetStorageSaveInputV1): MonitoringMapAssetStorageSaveResultV1 {
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

function saveMock(input: MonitoringMapAssetStorageSaveInputV1): MonitoringMapAssetStorageSaveResultV1 {
  // mock — メタデータのみ、実ファイルは書かない
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
  _input: MonitoringMapAssetStorageSaveInputV1
): Promise<MonitoringMapAssetStorageSaveResultV1> {
  // TODO: QNAP WebDAV 本接続 — \\192.168.1.10\TiSLY\monitoring\{siteId}\
  return {
    ok: false,
    mode: "qnap-webdav",
    fileUrl: "",
    previewUrl: "/icons/icon-128.png",
    message: "qnap-webdav mode is not implemented yet — use local mode",
  };
}

export async function saveMonitoringMapAssetFileV1(
  input: MonitoringMapAssetStorageSaveInputV1
): Promise<MonitoringMapAssetStorageSaveResultV1> {
  const mode = resolveMonitoringMapAssetStorageModeV1();
  try {
    if (mode === "mock") return saveMock(input);
    if (mode === "qnap-webdav") return saveQnapWebDav(input);
    return saveLocal(input);
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
