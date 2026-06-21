/** TiSLY Monitoring mapAsset V3.2 — 実ファイルアップロード · バリデーション · 登録 */

import path from "path";
import crypto from "crypto";
import {
  registerMonitoringMapAssetV1,
  type MonitoringMapAssetFileTypeV1,
  type MonitoringMapAssetMapTypeV1,
  type MonitoringMapAssetRecordV1,
  type MonitoringMapAssetSourceTypeV1,
  type MonitoringMapAssetStatusV1,
} from "./monitoring-map-assets-store-v1.js";
import type { MonitoringMapFloorLevelV1 } from "./tisly-monitoring-map-asset-v1.js";
import {
  saveMonitoringMapAssetFileV1,
  type MonitoringMapAssetStorageModeV1,
} from "./monitoring-map-asset-storage-adapter-v1.js";

export const MONITORING_MAP_ASSET_MAX_BYTES_3D_V1 = 100 * 1024 * 1024;
export const MONITORING_MAP_ASSET_MAX_BYTES_IMAGE_V1 = 10 * 1024 * 1024;
export const MONITORING_MAP_ASSET_MAX_BYTES_JSON_V1 = 5 * 1024 * 1024;

export const MONITORING_MAP_ASSET_ALLOWED_EXTENSIONS_V1 = new Set([
  ".glb",
  ".gltf",
  ".obj",
  ".ply",
  ".usdz",
  ".json",
  ".jpg",
  ".jpeg",
  ".png",
]);

const EXT_TO_FILE_TYPE: Record<string, MonitoringMapAssetFileTypeV1> = {
  ".glb": "glb",
  ".gltf": "gltf",
  ".obj": "obj",
  ".ply": "ply",
  ".usdz": "usdz",
  ".json": "json",
  ".jpg": "image",
  ".jpeg": "image",
  ".png": "image",
};

const EXT_TO_MIME: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".obj": "model/obj",
  ".ply": "application/octet-stream",
  ".usdz": "model/vnd.usdz+zip",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

const ALLOWED_MIMES = new Set(Object.values(EXT_TO_MIME));

export function sanitizeMonitoringSiteIdV1(raw: string): string | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed || trimmed.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return null;
  if (trimmed.includes("..")) return null;
  return trimmed;
}

export function detectMapAssetFileTypeV1(fileName: string): MonitoringMapAssetFileTypeV1 {
  const ext = path.extname(fileName).toLowerCase();
  return EXT_TO_FILE_TYPE[ext] ?? "unknown";
}

export function isGltfLoadableFileTypeV1(fileType: MonitoringMapAssetFileTypeV1): boolean {
  return fileType === "glb" || fileType === "gltf";
}

export function isUnsupported3dPreviewFileTypeV1(fileType: MonitoringMapAssetFileTypeV1): boolean {
  return fileType === "obj" || fileType === "ply" || fileType === "usdz";
}

export function buildSafeMapAssetFileNameV1(assetId: string, originalFileName: string): string {
  const ext = path.extname(originalFileName).toLowerCase();
  const safeExt = MONITORING_MAP_ASSET_ALLOWED_EXTENSIONS_V1.has(ext) ? ext : ".bin";
  const token = crypto.randomBytes(4).toString("hex");
  const base = assetId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 48);
  return `${base}-${token}${safeExt}`;
}

function maxBytesForExt(ext: string): number {
  if (ext === ".json") return MONITORING_MAP_ASSET_MAX_BYTES_JSON_V1;
  if (ext === ".jpg" || ext === ".jpeg" || ext === ".png") return MONITORING_MAP_ASSET_MAX_BYTES_IMAGE_V1;
  return MONITORING_MAP_ASSET_MAX_BYTES_3D_V1;
}

function inferMapType(fileType: MonitoringMapAssetFileTypeV1): MonitoringMapAssetMapTypeV1 {
  if (fileType === "ply") return "pointcloud";
  if (fileType === "json") return "floorplan";
  if (fileType === "image") return "placeholder";
  if (fileType === "unknown") return "placeholder";
  return "mesh";
}

export interface UploadMonitoringMapAssetInputV1 {
  siteId: string;
  title?: string;
  sourceType: MonitoringMapAssetSourceTypeV1;
  floorLevel: MonitoringMapFloorLevelV1;
  mapType?: MonitoringMapAssetMapTypeV1;
  status?: MonitoringMapAssetStatusV1;
  notes?: string;
  setActive?: boolean;
  originalFileName: string;
  fileBase64: string;
  mimeType?: string;
}

export interface UploadMonitoringMapAssetResultV1 {
  ok: boolean;
  asset?: MonitoringMapAssetRecordV1;
  storageMode?: MonitoringMapAssetStorageModeV1;
  loaderHint?: "gltf" | "placeholder" | "image";
  error?: string;
}

export async function uploadMonitoringMapAssetFileV1(
  input: UploadMonitoringMapAssetInputV1
): Promise<UploadMonitoringMapAssetResultV1> {
  const siteId = sanitizeMonitoringSiteIdV1(input.siteId);
  if (!siteId) {
    return { ok: false, error: "invalid siteId" };
  }

  const originalFileName = path.basename(String(input.originalFileName ?? "").trim());
  if (!originalFileName) {
    return { ok: false, error: "originalFileName is required" };
  }

  const ext = path.extname(originalFileName).toLowerCase();
  if (!MONITORING_MAP_ASSET_ALLOWED_EXTENSIONS_V1.has(ext)) {
    return { ok: false, error: "file extension not allowed" };
  }

  const fileType = detectMapAssetFileTypeV1(originalFileName);
  const expectedMime = EXT_TO_MIME[ext];
  if (input.mimeType && !ALLOWED_MIMES.has(input.mimeType) && input.mimeType !== "application/octet-stream") {
    return { ok: false, error: "mime type not allowed" };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(String(input.fileBase64 ?? ""), "base64");
  } catch {
    return { ok: false, error: "invalid base64 payload" };
  }

  if (!buffer.length) {
    return { ok: false, error: "empty file" };
  }

  const maxBytes = maxBytesForExt(ext);
  if (buffer.length > maxBytes) {
    return { ok: false, error: `file exceeds max size (${maxBytes} bytes)` };
  }

  const assetId = `MA-${siteId}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const safeFileName = buildSafeMapAssetFileNameV1(assetId, originalFileName);

  const saved = await saveMonitoringMapAssetFileV1({ siteId, safeFileName, buffer });
  if (!saved.ok || !saved.fileUrl) {
    return { ok: false, error: saved.message ?? "file save failed" };
  }

  const mapType = input.mapType ?? inferMapType(fileType);
  const record = registerMonitoringMapAssetV1({
    siteId,
    assetId,
    title: input.title?.trim() || originalFileName,
    sourceType: input.sourceType,
    fileType,
    fileName: originalFileName,
    safeFileName,
    mimeType: input.mimeType ?? expectedMime,
    fileSize: buffer.length,
    floorLevel: input.floorLevel,
    mapType,
    previewUrl: saved.previewUrl,
    fileUrl: saved.fileUrl,
    status: input.status,
    notes: input.notes,
    setActive: input.setActive,
  });

  const loaderHint = isGltfLoadableFileTypeV1(fileType)
    ? "gltf"
    : fileType === "image"
      ? "image"
      : "placeholder";

  return {
    ok: true,
    asset: record,
    storageMode: saved.mode,
    loaderHint,
  };
}
