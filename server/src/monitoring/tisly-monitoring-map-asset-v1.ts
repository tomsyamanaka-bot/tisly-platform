/** TiSLY Monitoring 3D V3 — LiDAR / 3D mapAsset 受け皿（Polycam · Scaniverse · RoomPlan 将来投入） */

export type MonitoringMapAssetSourceV1 = "polycam" | "scaniverse" | "roomplan" | "manual" | "procedural";

export type MonitoringMapAssetTypeV1 =
  | "mesh"
  | "pointcloud"
  | "floorplan"
  | "placeholder"
  | "building_shell";

export type MonitoringMapFloorLevelV1 = "perimeter" | "1f" | "2f" | "roof";

export interface MonitoringMapTransformV1 {
  x: number;
  y: number;
  z: number;
}

export interface MonitoringMapAssetEntryV1 {
  assetId: string;
  type: MonitoringMapAssetTypeV1;
  source: MonitoringMapAssetSourceV1;
  floorLevel: MonitoringMapFloorLevelV1;
  position: MonitoringMapTransformV1;
  rotation: MonitoringMapTransformV1;
  scale: MonitoringMapTransformV1;
  label?: string;
  /** 将来: glb / ply / usdz 等の相対パス */
  fileRef?: string;
}

export interface MonitoringMapAssetBundleV1 {
  bundleId: string;
  siteId: string;
  customerRef: string;
  integrationStatusLabel: string;
  integrationNote: string;
  assets: MonitoringMapAssetEntryV1[];
}

const DEMO_HOME_ASSETS: MonitoringMapAssetEntryV1[] = [
  {
    assetId: "perimeter-ground",
    type: "placeholder",
    source: "procedural",
    floorLevel: "perimeter",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 24, y: 0.1, z: 18 },
    label: "外周グラウンド",
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
  {
    assetId: "lidar-mock-home",
    type: "pointcloud",
    source: "roomplan",
    floorLevel: "1f",
    position: { x: 0, y: 1.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    label: "RoomPlan LiDAR（準備中）",
    fileRef: "knowledge/lidar/DEMO-HOME-001/scan-placeholder.ply",
  },
];

export function getMonitoringMapAssetBundleV1(siteId: string): MonitoringMapAssetBundleV1 {
  const customerRef = siteId.includes("PLANT") ? "DEMO-FACTORY-001" : "DEMO-HOME-001";
  return {
    bundleId: `map-asset-${siteId}`,
    siteId,
    customerRef,
    integrationStatusLabel: "LiDAR連携準備中",
    integrationNote:
      "Polycam · Scaniverse · RoomPlan から mesh / pointcloud を投入できる構造です。現時点はプロシージャル建物＋受け皿のみ。",
    assets: DEMO_HOME_ASSETS,
  };
}
