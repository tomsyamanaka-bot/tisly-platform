/** TiSLY Monitoring 3D V3.1 — mapAsset 登録・一覧・transform 保存 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { MonitoringMapFloorLevelV1 } from "./tisly-monitoring-map-asset-v1.js";

export type MonitoringMapAssetSourceTypeV1 =
  | "polycam"
  | "roomplan"
  | "scaniverse"
  | "manual"
  | "mock";

export type MonitoringMapAssetFileTypeV1 =
  | "glb"
  | "gltf"
  | "obj"
  | "ply"
  | "usdz"
  | "json"
  | "image"
  | "unknown";

export type MonitoringMapAssetMapTypeV1 =
  | "mesh"
  | "pointcloud"
  | "floorplan"
  | "building_shell"
  | "placeholder";

export type MonitoringMapAssetStatusV1 = "draft" | "active" | "archived";

export interface MonitoringMapAssetTransformV1 {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  heightOffset?: number;
}

export interface MonitoringMapAssetRecordV1 {
  assetId: string;
  siteId: string;
  title: string;
  sourceType: MonitoringMapAssetSourceTypeV1;
  fileType: MonitoringMapAssetFileTypeV1;
  /** 元ファイル名 */
  fileName: string;
  /** 保存先 safe 名（V3.2） */
  safeFileName?: string;
  mimeType?: string;
  fileSize: number;
  uploadedAt: string;
  floorLevel: MonitoringMapFloorLevelV1;
  mapType: MonitoringMapAssetMapTypeV1;
  previewUrl: string;
  fileUrl: string;
  transform: MonitoringMapAssetTransformV1;
  status: MonitoringMapAssetStatusV1;
  notes: string;
}

export interface MonitoringMapAssetsSiteEntryV1 {
  siteId: string;
  activeAssetId: string | null;
  assets: MonitoringMapAssetRecordV1[];
}

export interface MonitoringMapAssetsStoreV1 {
  version: 1;
  updatedAt: string;
  sites: Record<string, MonitoringMapAssetsSiteEntryV1>;
}

export const MONITORING_MAP_ASSET_SUPPORTED_FILE_TYPES: MonitoringMapAssetFileTypeV1[] = [
  "glb",
  "gltf",
  "obj",
  "ply",
  "usdz",
  "json",
  "image",
  "unknown",
];

export const MONITORING_MAP_ASSET_UPLOAD_GUIDE_V1 = {
  audience: "開発者・現調担当向け",
  polycam: "Polycam は GLB エクスポートを最優先。1F/2F/外周ごとに別スキャンを登録。",
  roomplan: "RoomPlan は JSON または USDZ を想定（3D表示は GLB 優先）。iPhone LiDAR スキャン後に floorLevel を指定。",
  scaniverse: "Scaniverse は GLB または OBJ を想定。外周は perimeter、室内は 1f/2f。",
  floorSplit: "1F / 2F / 外周（perimeter）を分けて登録し、activeAsset で表示対象を切替。",
  calibration: "transform.position / rotation / scale / heightOffset でセンサー位置との合わせ込み。",
  uploadApi: "POST /api/monitoring/v1/map-assets/upload — fileBase64 + sourceType + floorLevel",
  maxSize3d: "3D mesh 最大 100MB · 画像 10MB · JSON 5MB",
  unsupportedPreview: "OBJ / PLY / USDZ は登録可だが Three.js 表示は placeholder fallback",
  futureStorage: "将来: QNAP WebDAV — \\\\192.168.1.10\\TiSLY\\monitoring\\{siteId}\\ （adapter mode: qnap-webdav）",
};

const DEFAULT_TRANSFORM: MonitoringMapAssetTransformV1 = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  heightOffset: 0,
};

function getStorePath(): string {
  const override = process.env.TISLY_MONITORING_MAP_ASSETS_PATH;
  if (override) return path.isAbsolute(override) ? override : path.join(process.cwd(), override);
  return path.join(process.cwd(), "data", "monitoring", "map-assets.json");
}

function readStore(): MonitoringMapAssetsStoreV1 {
  const filePath = getStorePath();
  try {
    if (!fs.existsSync(filePath)) {
      return { version: 1, updatedAt: new Date().toISOString(), sites: {} };
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as MonitoringMapAssetsStoreV1;
    return parsed?.sites ? parsed : { version: 1, updatedAt: new Date().toISOString(), sites: {} };
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), sites: {} };
  }
}

function writeStore(store: MonitoringMapAssetsStoreV1): void {
  const filePath = getStorePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  store.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function ensureSite(store: MonitoringMapAssetsStoreV1, siteId: string): MonitoringMapAssetsSiteEntryV1 {
  if (!store.sites[siteId]) {
    store.sites[siteId] = { siteId, activeAssetId: null, assets: [] };
  }
  return store.sites[siteId];
}

function normalizeTransform(
  raw: Partial<MonitoringMapAssetTransformV1> | undefined,
  base: MonitoringMapAssetTransformV1 = DEFAULT_TRANSFORM
): MonitoringMapAssetTransformV1 {
  return {
    position: {
      x: Number(raw?.position?.x ?? base.position.x),
      y: Number(raw?.position?.y ?? base.position.y),
      z: Number(raw?.position?.z ?? base.position.z),
    },
    rotation: {
      x: Number(raw?.rotation?.x ?? base.rotation.x),
      y: Number(raw?.rotation?.y ?? base.rotation.y),
      z: Number(raw?.rotation?.z ?? base.rotation.z),
    },
    scale: {
      x: Number(raw?.scale?.x ?? base.scale.x),
      y: Number(raw?.scale?.y ?? base.scale.y),
      z: Number(raw?.scale?.z ?? base.scale.z),
    },
    heightOffset: Number(raw?.heightOffset ?? base.heightOffset ?? 0),
  };
}

export function buildFallbackMapAssetRecordV1(siteId: string): MonitoringMapAssetRecordV1 {
  return {
    assetId: `fallback-${siteId}`,
    siteId,
    title: "プロシージャル建物（fallback）",
    sourceType: "mock",
    fileType: "unknown",
    fileName: "",
    fileSize: 0,
    uploadedAt: new Date(0).toISOString(),
    floorLevel: "1f",
    mapType: "building_shell",
    previewUrl: "/icons/icon-128.png",
    fileUrl: "",
    transform: { ...DEFAULT_TRANSFORM, scale: { x: 10, y: 3, z: 8 } },
    status: "draft",
    notes: "登録 mapAsset がない場合に Three.js プロシージャル box を表示",
  };
}

export function seedDemoMapAssetsIfEmpty(siteId: string): void {
  const store = readStore();
  const site = ensureSite(store, siteId);
  if (site.assets.length > 0) return;

  const now = new Date().toISOString();
  site.assets = [
    {
      assetId: `MA-${siteId}-POLYCAM-1F`,
      siteId,
      title: "Polycam 1F scan placeholder",
      sourceType: "polycam",
      fileType: "glb",
      fileName: "demo-home-1f.glb",
      fileSize: 0,
      uploadedAt: now,
      floorLevel: "1f",
      mapType: "mesh",
      previewUrl: "/icons/icon-128.png",
      fileUrl: "",
      transform: {
        position: { x: 0, y: 1.5, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 9.5, y: 2.8, z: 7.5 },
        heightOffset: 0,
      },
      status: "active",
      notes: "GLB 未接続 — placeholder mesh",
    },
    {
      assetId: `MA-${siteId}-ROOMPLAN-2F`,
      siteId,
      title: "RoomPlan 2F layout placeholder",
      sourceType: "roomplan",
      fileType: "json",
      fileName: "demo-home-2f-roomplan.json",
      fileSize: 0,
      uploadedAt: now,
      floorLevel: "2f",
      mapType: "floorplan",
      previewUrl: "/icons/icon-128.png",
      fileUrl: "",
      transform: {
        position: { x: 0, y: 4.5, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 8.5, y: 2.5, z: 6.5 },
        heightOffset: 0,
      },
      status: "draft",
      notes: "RoomPlan JSON 未接続",
    },
    {
      assetId: `MA-${siteId}-SCANIVERSE-PERIMETER`,
      siteId,
      title: "外周 map scan placeholder",
      sourceType: "scaniverse",
      fileType: "obj",
      fileName: "demo-home-perimeter.obj",
      fileSize: 0,
      uploadedAt: now,
      floorLevel: "perimeter",
      mapType: "mesh",
      previewUrl: "/icons/icon-128.png",
      fileUrl: "",
      transform: {
        position: { x: 0, y: 0.2, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 22, y: 0.4, z: 16 },
        heightOffset: 0,
      },
      status: "draft",
      notes: "外周スキャン OBJ 未接続",
    },
  ];
  site.activeAssetId = site.assets[0].assetId;
  writeStore(store);
}

export function listMonitoringMapAssetsV1(siteId: string): {
  siteId: string;
  assets: MonitoringMapAssetRecordV1[];
  activeAsset: MonitoringMapAssetRecordV1 | null;
  fallbackAsset: MonitoringMapAssetRecordV1;
  supportedFileTypes: MonitoringMapAssetFileTypeV1[];
  uploadGuide: typeof MONITORING_MAP_ASSET_UPLOAD_GUIDE_V1;
} {
  seedDemoMapAssetsIfEmpty(siteId);
  const store = readStore();
  const site = ensureSite(store, siteId);
  const activeAsset =
    site.assets.find((a) => a.assetId === site.activeAssetId) ??
    site.assets.find((a) => a.status === "active") ??
    null;

  return {
    siteId,
    assets: site.assets,
    activeAsset,
    fallbackAsset: buildFallbackMapAssetRecordV1(siteId),
    supportedFileTypes: MONITORING_MAP_ASSET_SUPPORTED_FILE_TYPES,
    uploadGuide: MONITORING_MAP_ASSET_UPLOAD_GUIDE_V1,
  };
}

export interface RegisterMonitoringMapAssetInputV1 {
  siteId: string;
  assetId?: string;
  title: string;
  sourceType: MonitoringMapAssetSourceTypeV1;
  fileType?: MonitoringMapAssetFileTypeV1;
  fileName?: string;
  safeFileName?: string;
  mimeType?: string;
  fileSize?: number;
  floorLevel: MonitoringMapFloorLevelV1;
  mapType?: MonitoringMapAssetMapTypeV1;
  previewUrl?: string;
  fileUrl?: string;
  transform?: Partial<MonitoringMapAssetTransformV1>;
  status?: MonitoringMapAssetStatusV1;
  notes?: string;
  setActive?: boolean;
}

export function registerMonitoringMapAssetV1(input: RegisterMonitoringMapAssetInputV1): MonitoringMapAssetRecordV1 {
  const store = readStore();
  const site = ensureSite(store, input.siteId);
  const assetId = input.assetId ?? `MA-${input.siteId}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const record: MonitoringMapAssetRecordV1 = {
    assetId,
    siteId: input.siteId,
    title: input.title.trim() || "Untitled scan",
    sourceType: input.sourceType,
    fileType: input.fileType ?? "unknown",
    fileName: input.fileName ?? "",
    safeFileName: input.safeFileName,
    mimeType: input.mimeType,
    fileSize: Number(input.fileSize ?? 0),
    uploadedAt: new Date().toISOString(),
    floorLevel: input.floorLevel,
    mapType: input.mapType ?? "placeholder",
    previewUrl: input.previewUrl ?? "/icons/icon-128.png",
    fileUrl: input.fileUrl ?? "",
    transform: normalizeTransform(input.transform),
    status: input.status ?? "draft",
    notes: input.notes ?? "",
  };

  if (input.setActive || record.status === "active") {
    site.assets.forEach((a) => {
      if (a.status === "active" && a.assetId !== assetId) a.status = "draft";
    });
    record.status = "active";
    site.activeAssetId = assetId;
  }

  site.assets.unshift(record);
  writeStore(store);
  return record;
}

export interface UpdateMonitoringMapAssetInputV1 {
  siteId: string;
  assetId: string;
  title?: string;
  transform?: Partial<MonitoringMapAssetTransformV1>;
  status?: MonitoringMapAssetStatusV1;
  notes?: string;
  setActive?: boolean;
  resetTransform?: boolean;
}

export function updateMonitoringMapAssetV1(input: UpdateMonitoringMapAssetInputV1): MonitoringMapAssetRecordV1 | null {
  const store = readStore();
  const site = ensureSite(store, input.siteId);
  const asset = site.assets.find((a) => a.assetId === input.assetId);
  if (!asset) return null;

  if (input.title !== undefined) asset.title = input.title.trim();
  if (input.notes !== undefined) asset.notes = input.notes;
  if (input.resetTransform) asset.transform = { ...DEFAULT_TRANSFORM };
  if (input.transform) {
    asset.transform = normalizeTransform(input.transform, asset.transform);
  }

  if (input.setActive) {
    site.assets.forEach((a) => {
      if (a.assetId !== asset.assetId && a.status === "active") a.status = "draft";
    });
    asset.status = "active";
    site.activeAssetId = asset.assetId;
  } else if (input.status) {
    asset.status = input.status;
    if (input.status === "active") {
      site.assets.forEach((a) => {
        if (a.assetId !== asset.assetId && a.status === "active") a.status = "draft";
      });
      site.activeAssetId = asset.assetId;
    }
  }

  writeStore(store);
  return asset;
}

/** テスト用 — store を空に戻す */
export function resetMonitoringMapAssetsStoreForTestV1(): void {
  const filePath = getStorePath();
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}
