/** TiSLY Monitoring 3D Dashboard V3 — Three.js シーン · センサー · デモシナリオ */

import {
  findMonitoringDeviceLayoutOverrideV1,
  listMonitoringDeviceLayoutOverridesV1,
  type MonitoringDeviceLayoutOverrideV1,
} from "./monitoring-device-layout-overrides-store-v1.js";
import { getMonitoringMapAssetBundleV1, type MonitoringMapFloorLevelV1 } from "./tisly-monitoring-map-asset-v1.js";
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
  uiVersion: "v3.2";
  layers: Array<{ floorLevel: MonitoringMapFloorLevelV1; label: string }>;
  sensors: Monitoring3dSensorV1[];
  cameras: Monitoring3dCameraMockV1[];
  mapAsset: ReturnType<typeof getMonitoringMapAssetBundleV1>;
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

const SENSORS: Monitoring3dSensorV1[] = [
  {
    sensorId: "frontGate",
    label: "門扉",
    floorLevel: "perimeter",
    areaId: "gate",
    position: { x: 0, y: 0.8, z: -7.5 },
    status: "normal",
    cameraId: "cam-gate-01",
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
    relatedKnowledgeIds: ["RP-SCHEMATIC-001"],
  },
  {
    sensorId: "stairs",
    label: "階段",
    floorLevel: "1f",
    areaId: "stairs",
    position: { x: 3.5, y: 2.2, z: -1 },
    status: "normal",
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
    relatedKnowledgeIds: ["RP-ESP32-001"],
  },
];

const CAMERAS: Monitoring3dCameraMockV1[] = [
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

const DEMO_SCENARIOS: Monitoring3dDemoScenarioV1[] = [
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

export function buildMonitoring3dSceneV1(siteIdInput?: string): Monitoring3dScenePayloadV1 {
  const siteId = resolveMonitoringSiteIdV1(siteIdInput);
  const siteName = siteId.includes("PLANT") ? "デモ工場" : "デモ戸建て";
  const customerRef = siteId.includes("PLANT") ? "DEMO-FACTORY-001" : "DEMO-HOME-001";

  const baseSensors = SENSORS.map((s) => ({ ...s, status: "normal" as const }));
  const sensors = applyDeviceLayoutOverridesToSensorsV1(siteId, baseSensors);

  return {
    siteId,
    siteName,
    customerRef,
    uiVersion: "v3.2",
    layers: [
      { floorLevel: "perimeter", label: "外周" },
      { floorLevel: "1f", label: "1F" },
      { floorLevel: "2f", label: "2F" },
    ],
    sensors,
    cameras: CAMERAS,
    mapAsset: getMonitoringMapAssetBundleV1(siteId),
    deviceLayoutOverrides: listMonitoringDeviceLayoutOverridesV1(siteId).overrides,
    customerLinks: {
      projectPageUrl: `/knowledge-customer-project-v1?ref=${encodeURIComponent(customerRef)}`,
      siteMapUrl: `/knowledge-customer-site-map-v1?ref=${encodeURIComponent(customerRef)}`,
      knowledgeCustomerUrl: `/knowledge-customer-v2`,
    },
    demoScenarios: DEMO_SCENARIOS,
  };
}

export function findMonitoring3dSensorV1(sensorId: string): Monitoring3dSensorV1 | undefined {
  return SENSORS.find((s) => s.sensorId === sensorId);
}

export function findMonitoring3dCameraV1(cameraId: string): Monitoring3dCameraMockV1 | undefined {
  return CAMERAS.find((c) => c.cameraId === cameraId);
}
