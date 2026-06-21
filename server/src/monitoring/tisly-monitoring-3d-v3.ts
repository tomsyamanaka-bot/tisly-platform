/** TiSLY Monitoring 3D Dashboard V3 — Three.js シーン · センサー · デモシナリオ */

import {
  findMonitoringDeviceLayoutOverrideV1,
  listMonitoringDeviceLayoutOverridesV1,
  type MonitoringDeviceLayoutOverrideV1,
} from "./monitoring-device-layout-overrides-store-v1.js";
import {
  getMonitoringMapAssetBundleV1,
  type MonitoringMapAssetDisplayModeV1,
  type MonitoringMapFloorLevelV1,
} from "./tisly-monitoring-map-asset-v1.js";
import { resolveMonitoringSiteIdV1 } from "./tisly-monitoring-layout-v1.js";

export type Monitoring3dSensorStatusV1 = "normal" | "warning" | "alert";

export type Monitoring3dLayerFilterV1 = "all" | "perimeter" | "1f" | "2f";

export interface Monitoring3dSensorV1 {
  sensorId: string;
  label: string;
  floorLevel: MonitoringMapFloorLevelV1;
  areaId: string;
  position: { x: number; y: number; z: number };
  status: Monitoring3dSensorStatusV1;
  cameraId?: string;
  deviceType?: string;
  relatedKnowledgeIds: string[];
}

export interface Monitoring3dCameraMockV1 {
  cameraId: string;
  label: string;
  floorLevel: MonitoringMapFloorLevelV1;
  streamLabel: string;
  placeholderImage: string;
}

export interface Monitoring3dDemoScenarioV1 {
  scenarioId: string;
  label: string;
  description: string;
  sensorId: string;
  alertLevel: "alert" | "warning";
  headline: string;
  content: string;
  durationMs: number;
}

export interface Monitoring3dScenePayloadV1 {
  siteId: string;
  siteName: string;
  customerRef: string;
  uiVersion: "v3.3";
  layers: Array<{ floorLevel: MonitoringMapFloorLevelV1; label: string }>;
  sensors: Monitoring3dSensorV1[];
  cameras: Monitoring3dCameraMockV1[];
  mapAsset: ReturnType<typeof getMonitoringMapAssetBundleV1>;
  mapAssetDisplayMode: MonitoringMapAssetDisplayModeV1;
  deviceLayoutOverrides: MonitoringDeviceLayoutOverrideV1[];
  customerLinks: {
    projectPageUrl: string;
    siteMapUrl: string;
    knowledgeCustomerUrl: string;
  };
  demoScenarios: Monitoring3dDemoScenarioV1[];
}

function applyDeviceLayoutOverridesToSensorsV1(siteId: string, sensors: Monitoring3dSensorV1[]) {
  return sensors.map((sensor) => {
    const override = findMonitoringDeviceLayoutOverrideV1(siteId, sensor.sensorId);
    if (!override) return sensor;
    return {
      ...sensor,
      position: { ...override.position },
      floorLevel: (override.floorLevel as MonitoringMapFloorLevelV1) || sensor.floorLevel,
    };
  });
}

function isFactorySite(siteId: string): boolean {
  return siteId.includes("FACTORY") || siteId.includes("PLANT");
}

const HOME_SENSORS: Monitoring3dSensorV1[] = [
  {
    sensorId: "frontGate",
    label: "門扉",
    floorLevel: "perimeter",
    areaId: "gate",
    position: { x: 0, y: 0.8, z: -7.5 },
    status: "normal",
    cameraId: "cam-gate-01",
    deviceType: "gate",
    relatedKnowledgeIds: ["RP-CONFIG-001"],
  },
  {
    sensorId: "frontDoor",
    label: "玄関",
    floorLevel: "1f",
    areaId: "entrance",
    position: { x: 0, y: 1.2, z: 3.8 },
    status: "normal",
    cameraId: "cam-entrance-01",
    deviceType: "door",
    relatedKnowledgeIds: ["RP-ESP32-001", "RP-WIRING-001"],
  },
  {
    sensorId: "living",
    label: "リビング",
    floorLevel: "1f",
    areaId: "living",
    position: { x: -2.5, y: 1.2, z: 0 },
    status: "normal",
    cameraId: "cam-living-01",
    deviceType: "sensor",
    relatedKnowledgeIds: ["RP-SCHEMATIC-001"],
  },
  {
    sensorId: "stairs",
    label: "階段",
    floorLevel: "1f",
    areaId: "stairs",
    position: { x: 3.5, y: 2.2, z: -1 },
    status: "normal",
    deviceType: "sensor",
    relatedKnowledgeIds: ["RP-RP2350-001"],
  },
  {
    sensorId: "balcony",
    label: "バルコニー",
    floorLevel: "2f",
    areaId: "balcony",
    position: { x: 0, y: 4.8, z: 3.2 },
    status: "normal",
    cameraId: "cam-balcony-01",
    deviceType: "sensor",
    relatedKnowledgeIds: ["RP-CONFIG-001"],
  },
  {
    sensorId: "garage",
    label: "ガレージ",
    floorLevel: "perimeter",
    areaId: "garage",
    position: { x: -8, y: 0.8, z: 2 },
    status: "normal",
    cameraId: "cam-garage-01",
    deviceType: "sensor",
    relatedKnowledgeIds: ["RP-ESP32-001"],
  },
];

const FACTORY_SENSORS: Monitoring3dSensorV1[] = [
  {
    sensorId: "shippingGate",
    label: "出荷ゲート",
    floorLevel: "perimeter",
    areaId: "shipping-gate",
    position: { x: 0, y: 0.8, z: -9 },
    status: "normal",
    cameraId: "cam-shipping-01",
    deviceType: "gate",
    relatedKnowledgeIds: ["PLC-SEQUENCE-001"],
  },
  {
    sensorId: "aggregateYard",
    label: "骨材ヤード",
    floorLevel: "perimeter",
    areaId: "aggregate-yard",
    position: { x: -10, y: 0.6, z: 4 },
    status: "normal",
    deviceType: "yardSensor",
    relatedKnowledgeIds: ["PLC-SELF-HOLD-001"],
  },
  {
    sensorId: "silo01",
    label: "サイロ",
    floorLevel: "1f",
    areaId: "silo",
    position: { x: -6, y: 2.5, z: -2 },
    status: "normal",
    deviceType: "silo",
    relatedKnowledgeIds: ["PLC-SEQUENCE-001"],
  },
  {
    sensorId: "mixer01",
    label: "ミキサー",
    floorLevel: "1f",
    areaId: "mixer",
    position: { x: 0, y: 1.8, z: 0 },
    status: "normal",
    deviceType: "mixer",
    relatedKnowledgeIds: ["PLC-SELF-HOLD-001"],
  },
  {
    sensorId: "conveyor01",
    label: "コンベア",
    floorLevel: "1f",
    areaId: "conveyor",
    position: { x: 6, y: 1.2, z: 2 },
    status: "normal",
    deviceType: "conveyor",
    relatedKnowledgeIds: ["PLC-SEQUENCE-001"],
  },
  {
    sensorId: "waterTank",
    label: "水タンク",
    floorLevel: "1f",
    areaId: "water-tank",
    position: { x: -8, y: 2, z: 4 },
    status: "normal",
    deviceType: "tank",
    relatedKnowledgeIds: [],
  },
  {
    sensorId: "pump01",
    label: "送水ポンプ",
    floorLevel: "1f",
    areaId: "pump-room",
    position: { x: -9, y: 1, z: -3 },
    status: "normal",
    deviceType: "pump",
    relatedKnowledgeIds: [],
  },
  {
    sensorId: "scale01",
    label: "計量スケール",
    floorLevel: "1f",
    areaId: "scale",
    position: { x: 3, y: 1, z: -4 },
    status: "normal",
    deviceType: "scale",
    relatedKnowledgeIds: [],
  },
  {
    sensorId: "controlRoom",
    label: "操作室",
    floorLevel: "2f",
    areaId: "control-room",
    position: { x: 0, y: 5.2, z: 0 },
    status: "normal",
    cameraId: "cam-control-01",
    deviceType: "panel",
    relatedKnowledgeIds: ["PLC-SEQUENCE-001", "PLC-SELF-HOLD-001"],
  },
];

const HOME_CAMERAS: Monitoring3dCameraMockV1[] = [
  {
    cameraId: "cam-gate-01",
    label: "門扉カメラ",
    floorLevel: "perimeter",
    streamLabel: "LIVE · 門扉",
    placeholderImage: "/icons/icon-128.png",
  },
  {
    cameraId: "cam-entrance-01",
    label: "玄関カメラ",
    floorLevel: "1f",
    streamLabel: "LIVE · 玄関",
    placeholderImage: "/icons/icon-128.png",
  },
  {
    cameraId: "cam-living-01",
    label: "リビングカメラ",
    floorLevel: "1f",
    streamLabel: "LIVE · リビング",
    placeholderImage: "/icons/icon-128.png",
  },
  {
    cameraId: "cam-balcony-01",
    label: "バルコニーカメラ",
    floorLevel: "2f",
    streamLabel: "LIVE · バルコニー",
    placeholderImage: "/icons/icon-128.png",
  },
  {
    cameraId: "cam-garage-01",
    label: "ガレージカメラ",
    floorLevel: "perimeter",
    streamLabel: "LIVE · ガレージ",
    placeholderImage: "/icons/icon-128.png",
  },
];

const FACTORY_CAMERAS: Monitoring3dCameraMockV1[] = [
  {
    cameraId: "cam-shipping-01",
    label: "出荷ゲートカメラ",
    floorLevel: "perimeter",
    streamLabel: "LIVE · 出荷ゲート",
    placeholderImage: "/icons/icon-128.png",
  },
  {
    cameraId: "cam-control-01",
    label: "操作室カメラ",
    floorLevel: "2f",
    streamLabel: "LIVE · 操作室",
    placeholderImage: "/icons/icon-128.png",
  },
];

const HOME_DEMO_SCENARIOS: Monitoring3dDemoScenarioV1[] = [
  {
    scenarioId: "intrusion",
    label: "侵入",
    description: "門扉 → 玄関への侵入シナリオ",
    sensorId: "frontGate",
    alertLevel: "alert",
    headline: "🚨 侵入警報 — 門扉",
    content: "外周ゲートで未登録動体を検知しました",
    durationMs: 30000,
  },
  {
    scenarioId: "fire",
    label: "火災",
    description: "リビング煙感知",
    sensorId: "living",
    alertLevel: "alert",
    headline: "🚨 火災警報 — リビング",
    content: "リビングで煙センサーが作動しました",
    durationMs: 30000,
  },
  {
    scenarioId: "equipment",
    label: "設備異常",
    description: "ガレージ設備センサー",
    sensorId: "garage",
    alertLevel: "warning",
    headline: "⚠ 設備異常 — ガレージ",
    content: "ガレージ電源監視で異常電圧を検出",
    durationMs: 30000,
  },
];

const FACTORY_DEMO_SCENARIOS: Monitoring3dDemoScenarioV1[] = [
  {
    scenarioId: "intrusion",
    label: "不正侵入",
    description: "出荷ゲート未登録動体",
    sensorId: "shippingGate",
    alertLevel: "alert",
    headline: "🚨 侵入警報 — 出荷ゲート",
    content: "出荷ゲートで未登録車両/動体を検知",
    durationMs: 30000,
  },
  {
    scenarioId: "fire",
    label: "設備異常",
    description: "ミキサー過負荷",
    sensorId: "mixer01",
    alertLevel: "alert",
    headline: "🚨 設備警報 — ミキサー",
    content: "ミキサーで過負荷を検知しました",
    durationMs: 30000,
  },
  {
    scenarioId: "equipment",
    label: "水タンク",
    description: "水タンク水位異常",
    sensorId: "waterTank",
    alertLevel: "warning",
    headline: "⚠ 設備異常 — 水タンク",
    content: "水タンク水位が下限を下回りました",
    durationMs: 30000,
  },
];

const SENSOR_REGISTRY: Record<string, Monitoring3dSensorV1[]> = {
  "DEMO-HOME-001": HOME_SENSORS,
  "DEMO-FACTORY-001": FACTORY_SENSORS,
  "DEMO-PLANT-001": FACTORY_SENSORS,
};

const CAMERA_REGISTRY: Record<string, Monitoring3dCameraMockV1[]> = {
  "DEMO-HOME-001": HOME_CAMERAS,
  "DEMO-FACTORY-001": FACTORY_CAMERAS,
  "DEMO-PLANT-001": FACTORY_CAMERAS,
};

const DEMO_REGISTRY: Record<string, Monitoring3dDemoScenarioV1[]> = {
  "DEMO-HOME-001": HOME_DEMO_SCENARIOS,
  "DEMO-FACTORY-001": FACTORY_DEMO_SCENARIOS,
  "DEMO-PLANT-001": FACTORY_DEMO_SCENARIOS,
};

function getSensorsForSite(siteId: string): Monitoring3dSensorV1[] {
  return SENSOR_REGISTRY[siteId] ?? HOME_SENSORS;
}

function getCamerasForSite(siteId: string): Monitoring3dCameraMockV1[] {
  return CAMERA_REGISTRY[siteId] ?? HOME_CAMERAS;
}

function getDemoScenariosForSite(siteId: string): Monitoring3dDemoScenarioV1[] {
  return DEMO_REGISTRY[siteId] ?? HOME_DEMO_SCENARIOS;
}

export function buildMonitoring3dSceneV1(
  siteIdInput?: string,
  mapAssetDisplayMode: MonitoringMapAssetDisplayModeV1 = "all_floors"
): Monitoring3dScenePayloadV1 {
  const siteId = resolveMonitoringSiteIdV1(siteIdInput);
  const siteName = isFactorySite(siteId) ? "生コンプラント デモ工場" : "デモ戸建て";
  const customerRef = isFactorySite(siteId) ? "DEMO-FACTORY-001" : "DEMO-HOME-001";

  const baseSensors = getSensorsForSite(siteId).map((s) => ({ ...s, status: "normal" as const }));
  const sensors = applyDeviceLayoutOverridesToSensorsV1(siteId, baseSensors);

  return {
    siteId,
    siteName,
    customerRef,
    uiVersion: "v3.3",
    layers: [
      { floorLevel: "perimeter", label: "外周" },
      { floorLevel: "1f", label: "1F" },
      { floorLevel: "2f", label: "2F" },
    ],
    sensors,
    cameras: getCamerasForSite(siteId),
    mapAsset: getMonitoringMapAssetBundleV1(siteId),
    mapAssetDisplayMode,
    deviceLayoutOverrides: listMonitoringDeviceLayoutOverridesV1(siteId).overrides,
    customerLinks: {
      projectPageUrl: `/knowledge-customer-project-v1?ref=${encodeURIComponent(customerRef)}`,
      siteMapUrl: `/knowledge-customer-site-map-v1?ref=${encodeURIComponent(customerRef)}`,
      knowledgeCustomerUrl: `/knowledge-customer-v2`,
    },
    demoScenarios: getDemoScenariosForSite(siteId),
  };
}

export function findMonitoring3dSensorV1(
  sensorId: string,
  siteIdInput?: string
): Monitoring3dSensorV1 | undefined {
  const siteId = resolveMonitoringSiteIdV1(siteIdInput);
  return getSensorsForSite(siteId).find((s) => s.sensorId === sensorId);
}

export function findMonitoring3dCameraV1(cameraId: string): Monitoring3dCameraMockV1 | undefined {
  for (const cameras of Object.values(CAMERA_REGISTRY)) {
    const hit = cameras.find((c) => c.cameraId === cameraId);
    if (hit) return hit;
  }
  return undefined;
}
