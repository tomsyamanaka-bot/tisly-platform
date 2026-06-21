/** TiSLY Monitoring 3D V3 / V3.1 — LiDAR / 3D mapAsset 受け皿（Polycam · Scaniverse · RoomPlan 将来投入） */

import {
  buildFallbackMapAssetRecordV1,
  listMonitoringMapAssetsV1,
  type MonitoringMapAssetRecordV1,
  type MonitoringMapAssetSourceTypeV1,
} from "./monitoring-map-assets-store-v1.js";
import { isMeshLoadableFileTypeV1 } from "./monitoring-map-asset-upload-v1.js";

export type MonitoringMapAssetSourceV1 = MonitoringMapAssetSourceTypeV1 | "procedural";

export type MonitoringMapAssetTypeV1 =
  | "mesh"
  | "pointcloud"
  | "floorplan"
  | "placeholder"
  | "building_shell";

export type MonitoringMapFloorLevelV1 = "perimeter" | "1f" | "2f" | "roof";

export type MonitoringMapAssetDisplayModeV1 =
  | "active_only"
  | "all_floors"
  | "perimeter_only"
  | "1f_only"
  | "2f_only";

export interface MonitoringMapAssetDisplayModeOptionV1 {
  mode: MonitoringMapAssetDisplayModeV1;
  label: string;
}

export const MONITORING_MAP_ASSET_DISPLAY_MODES_V1: MonitoringMapAssetDisplayModeOptionV1[] = [
  { mode: "active_only", label: "active のみ" },
  { mode: "all_floors", label: "全フロア合成" },
  { mode: "perimeter_only", label: "外周のみ" },
  { mode: "1f_only", label: "1Fのみ" },
  { mode: "2f_only", label: "2Fのみ" },
];

export const MONITORING_MAP_FLOOR_HEIGHT_OFFSETS_V1: Record<MonitoringMapFloorLevelV1, number> = {
  perimeter: 0,
  "1f": 0,
  "2f": 3,
  roof: 5,
};

export interface MonitoringMapTransformV1 {
  x: number;
  y: number;
  z: number;
}

/** Three.js 描画用 — 登録 mapAsset + プロシージャル fallback を統合 */
export interface MonitoringMapAssetEntryV1 {
  assetId: string;
  type: MonitoringMapAssetTypeV1;
  source: MonitoringMapAssetSourceV1;
  floorLevel: MonitoringMapFloorLevelV1;
  position: MonitoringMapTransformV1;
  rotation: MonitoringMapTransformV1;
  scale: MonitoringMapTransformV1;
  label?: string;
  fileRef?: string;
  fileUrl?: string;
  previewUrl?: string;
  isRegistered?: boolean;
  isPlaceholder?: boolean;
  sourceType?: MonitoringMapAssetSourceTypeV1;
  mapType?: string;
  status?: string;
  fileType?: string;
  visibleInDashboard?: boolean;
  opacity?: number;
}

export interface MonitoringMapAssetBundleV1 {
  bundleId: string;
  siteId: string;
  customerRef: string;
  integrationStatusLabel: string;
  integrationNote: string;
  assets: MonitoringMapAssetEntryV1[];
  activeAsset: MonitoringMapAssetRecordV1 | null;
  fallbackAsset: MonitoringMapAssetRecordV1;
  registeredAssets: MonitoringMapAssetRecordV1[];
  displayModes: MonitoringMapAssetDisplayModeOptionV1[];
  defaultDisplayMode: MonitoringMapAssetDisplayModeV1;
  floorHeightOffsets: Record<MonitoringMapFloorLevelV1, number>;
  assetsByFloor: Partial<Record<MonitoringMapFloorLevelV1, MonitoringMapAssetEntryV1[]>>;
}

const SOURCE_COLORS: Record<string, number> = {
  polycam: 0x22c55e,
  roomplan: 0xa855f7,
  scaniverse: 0x0ea5e9,
  manual: 0xfbbf24,
  mock: 0x64748b,
  procedural: 0x2563eb,
};

export function getMapAssetSourceColorV1(source: string): number {
  return SOURCE_COLORS[source] ?? 0x22d3ee;
}

const PROCEDURAL_ASSETS: MonitoringMapAssetEntryV1[] = [
  {
    assetId: "perimeter-ground",
    type: "placeholder",
    source: "procedural",
    floorLevel: "perimeter",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 24, y: 0.1, z: 18 },
    label: "外周グラウンド",
    isPlaceholder: false,
  },
  {
    assetId: "perimeter-fence",
    type: "building_shell",
    source: "procedural",
    floorLevel: "perimeter",
    position: { x: 0, y: 0.6, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 22, y: 1.2, z: 16 },
    label: "外周フェンス",
  },
  {
    assetId: "floor-1f-shell",
    type: "building_shell",
    source: "procedural",
    floorLevel: "1f",
    position: { x: 0, y: 1.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 10, y: 3, z: 8 },
    label: "1階ボリューム",
  },
  {
    assetId: "floor-2f-shell",
    type: "building_shell",
    source: "procedural",
    floorLevel: "2f",
    position: { x: 0, y: 4.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 9, y: 2.8, z: 7 },
    label: "2階ボリューム",
  },
];

function isFactorySiteId(siteId: string): boolean {
  return siteId.includes("FACTORY") || siteId.includes("PLANT");
}

function resolveCustomerRef(siteId: string): string {
  return isFactorySiteId(siteId) ? "DEMO-FACTORY-001" : "DEMO-HOME-001";
}

function recordToSceneEntry(record: MonitoringMapAssetRecordV1): MonitoringMapAssetEntryV1 {
  const t = record.transform;
  const floorOffset = MONITORING_MAP_FLOOR_HEIGHT_OFFSETS_V1[record.floorLevel] ?? 0;
  const yOffset = (t.heightOffset ?? 0) + floorOffset;
  const hasLoadableMesh = Boolean(record.fileUrl) && isMeshLoadableFileTypeV1(record.fileType);
  const isUsdz = record.fileType === "usdz";
  return {
    assetId: record.assetId,
    type: (record.mapType as MonitoringMapAssetTypeV1) || "placeholder",
    source: record.sourceType,
    sourceType: record.sourceType,
    floorLevel: record.floorLevel,
    position: {
      x: t.position.x,
      y: t.position.y + yOffset,
      z: t.position.z,
    },
    rotation: { ...t.rotation },
    scale: { ...t.scale },
    label: record.title,
    fileRef: record.fileName || undefined,
    fileUrl: record.fileUrl || undefined,
    previewUrl: record.previewUrl,
    isRegistered: true,
    isPlaceholder: !hasLoadableMesh || isUsdz,
    mapType: record.mapType,
    status: record.status,
    fileType: record.fileType,
    visibleInDashboard: record.visibleInDashboard !== false,
    opacity: record.opacity ?? 1,
  };
}

export function getMonitoringMapAssetBundleV1(siteId: string): MonitoringMapAssetBundleV1 {
  const customerRef = resolveCustomerRef(siteId);
  const listed = listMonitoringMapAssetsV1(siteId);
  const registeredEntries = listed.assets.map(recordToSceneEntry);
  const hasActive = Boolean(listed.activeAsset);

  const integrationStatusLabel = hasActive
    ? listed.activeAsset!.fileUrl
      ? "mapAsset 実ファイル接続済み"
      : "mapAsset 登録済み — placeholder 表示中"
    : "LiDAR連携準備中";

  const integrationNote = hasActive
    ? listed.activeAsset!.fileUrl
      ? `${listed.activeAsset!.title}（${listed.activeAsset!.fileType} · ${listed.activeAsset!.floorLevel}）— GLB/GLTF/OBJ/PLY mesh 読込 · USDZ は GLB 変換推奨 · 全フロア合成対応。`
      : `${listed.activeAsset!.title}（${listed.activeAsset!.sourceType} · ${listed.activeAsset!.floorLevel}）を active 表示。fileUrl 未接続時は placeholder mesh。`
    : "Polycam · Scaniverse · RoomPlan から mesh / pointcloud を投入。V3.3: OBJ/PLY 表示 · 複数フロア同時表示。";

  const assetsByFloor: Partial<Record<MonitoringMapFloorLevelV1, MonitoringMapAssetEntryV1[]>> = {};
  registeredEntries.forEach((entry) => {
    if (!assetsByFloor[entry.floorLevel]) assetsByFloor[entry.floorLevel] = [];
    assetsByFloor[entry.floorLevel]!.push(entry);
  });

  return {
    bundleId: `map-asset-${siteId}`,
    siteId,
    customerRef,
    integrationStatusLabel,
    integrationNote,
    assets: [...PROCEDURAL_ASSETS, ...registeredEntries],
    activeAsset: listed.activeAsset,
    fallbackAsset: listed.fallbackAsset ?? buildFallbackMapAssetRecordV1(siteId),
    registeredAssets: listed.assets,
    displayModes: MONITORING_MAP_ASSET_DISPLAY_MODES_V1,
    defaultDisplayMode: "all_floors",
    floorHeightOffsets: { ...MONITORING_MAP_FLOOR_HEIGHT_OFFSETS_V1 },
    assetsByFloor,
  };
}
