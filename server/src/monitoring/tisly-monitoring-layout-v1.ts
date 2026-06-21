/** TiSLY Monitoring 3D Dashboard V1 — デバイス配置データ（戸建て中心 · 将来工場/施設へ流用） */

export type MonitoringDeviceTypeV1 =
  | "camera"
  | "sensor"
  | "light"
  | "door"
  | "window"
  | "panel"
  | "gate"
  | "emergency";

export type MonitoringDeviceStatusV1 = "normal" | "warning" | "alert" | "offline";

export interface MonitoringLayoutDeviceV1 {
  deviceId: string;
  deviceName: string;
  deviceType: MonitoringDeviceTypeV1;
  areaId: string;
  areaName: string;
  x: number;
  y: number;
  z: number;
  status: MonitoringDeviceStatusV1;
  linkedCameraId?: string;
  linkedKnowledgeIds?: string[];
}

export interface MonitoringLayoutFloorV1 {
  floorId: string;
  floorName: string;
  sortOrder: number;
  /** 疑似3Dカードの背景トーン */
  accent: string;
  devices: MonitoringLayoutDeviceV1[];
}

export interface MonitoringLayoutSiteV1 {
  siteId: string;
  siteName: string;
  siteKind: "home" | "plant" | "factory";
  customerRef: string;
  floors: MonitoringLayoutFloorV1[];
  defaultCameras: Array<{ cameraId: string; label: string; floorId: string }>;
}

const HOME_FLOORS: MonitoringLayoutFloorV1[] = [
  {
    floorId: "perimeter",
    floorName: "外周",
    sortOrder: 0,
    accent: "#0ea5e9",
    devices: [
      {
        deviceId: "cam-parking-01",
        deviceName: "駐車場カメラ",
        deviceType: "camera",
        areaId: "parking",
        areaName: "駐車場",
        x: 28,
        y: 62,
        z: 0,
        status: "normal",
        linkedKnowledgeIds: ["RP-CONFIG-001"],
      },
      {
        deviceId: "beam-perimeter-01",
        deviceName: "外周ビーム",
        deviceType: "sensor",
        areaId: "perimeter-gate",
        areaName: "外周ゲート",
        x: 72,
        y: 38,
        z: 0,
        status: "normal",
      },
      {
        deviceId: "cam-gate-01",
        deviceName: "門扉カメラ",
        deviceType: "camera",
        areaId: "gate",
        areaName: "門扉",
        x: 50,
        y: 18,
        z: 0,
        status: "normal",
        linkedCameraId: "cam-gate-01",
      },
      {
        deviceId: "light-yard-01",
        deviceName: "外周照明",
        deviceType: "light",
        areaId: "yard",
        areaName: "庭",
        x: 18,
        y: 28,
        z: 0,
        status: "normal",
      },
    ],
  },
  {
    floorId: "1f",
    floorName: "1階",
    sortOrder: 1,
    accent: "#2563eb",
    devices: [
      {
        deviceId: "door-entrance-01",
        deviceName: "玄関ドアセンサー",
        deviceType: "door",
        areaId: "entrance",
        areaName: "玄関",
        x: 50,
        y: 78,
        z: 1,
        status: "normal",
        linkedCameraId: "cam-entrance-01",
        linkedKnowledgeIds: ["RP-ESP32-001"],
      },
      {
        deviceId: "cam-entrance-01",
        deviceName: "玄関カメラ",
        deviceType: "camera",
        areaId: "entrance",
        areaName: "玄関",
        x: 62,
        y: 72,
        z: 1,
        status: "normal",
      },
      {
        deviceId: "pir-living-01",
        deviceName: "リビング人感",
        deviceType: "sensor",
        areaId: "living",
        areaName: "リビング",
        x: 42,
        y: 42,
        z: 1,
        status: "normal",
      },
      {
        deviceId: "panel-security-01",
        deviceName: "セキュリティパネル",
        deviceType: "panel",
        areaId: "hallway",
        areaName: "ホール",
        x: 22,
        y: 55,
        z: 1,
        status: "normal",
        linkedKnowledgeIds: ["RP-SCHEMATIC-001"],
      },
    ],
  },
  {
    floorId: "2f",
    floorName: "2階",
    sortOrder: 2,
    accent: "#7c3aed",
    devices: [
      {
        deviceId: "win-bedroom-01",
        deviceName: "寝室窓センサー",
        deviceType: "window",
        areaId: "bedroom",
        areaName: "寝室",
        x: 68,
        y: 32,
        z: 2,
        status: "normal",
        linkedKnowledgeIds: ["RP-WIRING-001"],
      },
      {
        deviceId: "cam-hall-2f-01",
        deviceName: "2階ホールカメラ",
        deviceType: "camera",
        areaId: "hall-2f",
        areaName: "2階ホール",
        x: 38,
        y: 48,
        z: 2,
        status: "normal",
        linkedCameraId: "cam-hall-2f-01",
      },
      {
        deviceId: "sensor-stairs-01",
        deviceName: "階段センサー",
        deviceType: "sensor",
        areaId: "stairs",
        areaName: "階段",
        x: 48,
        y: 68,
        z: 2,
        status: "normal",
      },
    ],
  },
  {
    floorId: "roof",
    floorName: "屋根",
    sortOrder: 3,
    accent: "#64748b",
    devices: [
      {
        deviceId: "sensor-roof-01",
        deviceName: "屋根動体センサー",
        deviceType: "sensor",
        areaId: "roof",
        areaName: "屋根",
        x: 50,
        y: 40,
        z: 3,
        status: "normal",
      },
    ],
  },
];

const PLANT_FLOORS: MonitoringLayoutFloorV1[] = [
  {
    floorId: "perimeter",
    floorName: "外周",
    sortOrder: 0,
    accent: "#0ea5e9",
    devices: [
      {
        deviceId: "gate-factory-01",
        deviceName: "正門ゲート",
        deviceType: "gate",
        areaId: "main-gate",
        areaName: "正門",
        x: 50,
        y: 20,
        z: 0,
        status: "normal",
        linkedCameraId: "cam-gate-factory-01",
      },
      {
        deviceId: "cam-gate-factory-01",
        deviceName: "正門カメラ",
        deviceType: "camera",
        areaId: "main-gate",
        areaName: "正門",
        x: 58,
        y: 24,
        z: 0,
        status: "normal",
      },
    ],
  },
  {
    floorId: "1f",
    floorName: "1階 製造",
    sortOrder: 1,
    accent: "#2563eb",
    devices: [
      {
        deviceId: "plc-line-01",
        deviceName: "ライン制御盤",
        deviceType: "panel",
        areaId: "line-a",
        areaName: "ラインA",
        x: 35,
        y: 50,
        z: 1,
        status: "normal",
      },
      {
        deviceId: "emergency-stop-01",
        deviceName: "非常停止",
        deviceType: "emergency",
        areaId: "line-a",
        areaName: "ラインA",
        x: 55,
        y: 45,
        z: 1,
        status: "normal",
      },
    ],
  },
];

export const MONITORING_LAYOUT_SITES_V1: Record<string, MonitoringLayoutSiteV1> = {
  "DEMO-HOME-001": {
    siteId: "DEMO-HOME-001",
    siteName: "守谷市 戸建てデモ",
    siteKind: "home",
    customerRef: "DEMO-HOME-001",
    floors: HOME_FLOORS,
    defaultCameras: [
      { cameraId: "cam-parking-01", label: "駐車場", floorId: "perimeter" },
      { cameraId: "cam-entrance-01", label: "玄関", floorId: "1f" },
      { cameraId: "cam-gate-01", label: "門扉", floorId: "perimeter" },
      { cameraId: "cam-hall-2f-01", label: "2階ホール", floorId: "2f" },
    ],
  },
  "DEMO-PLANT-001": {
    siteId: "DEMO-PLANT-001",
    siteName: "工場ライン デモ",
    siteKind: "plant",
    customerRef: "DEMO-FACTORY-001",
    floors: PLANT_FLOORS,
    defaultCameras: [
      { cameraId: "cam-gate-factory-01", label: "正門", floorId: "perimeter" },
    ],
  },
};

const DEVICE_ALIASES: Record<string, string> = {
  "site-moriya-camera-01": "cam-parking-01",
  "site-moriya-door-01": "door-entrance-01",
  "site-moriya-sensor-01": "pir-living-01",
  "site-moriya-alarm-01": "beam-perimeter-01",
};

export function resolveMonitoringSiteIdV1(siteId?: string | null): string {
  const key = (siteId ?? "DEMO-HOME-001").trim();
  if (MONITORING_LAYOUT_SITES_V1[key]) return key;
  if (key.toLowerCase().includes("plant") || key.toLowerCase().includes("factory")) {
    return "DEMO-PLANT-001";
  }
  return "DEMO-HOME-001";
}

export function getMonitoringLayoutSiteV1(siteId?: string | null): MonitoringLayoutSiteV1 {
  return MONITORING_LAYOUT_SITES_V1[resolveMonitoringSiteIdV1(siteId)]!;
}

export function findMonitoringDeviceV1(
  siteId: string | null | undefined,
  deviceId: string | null | undefined
): MonitoringLayoutDeviceV1 | null {
  if (!deviceId) return null;
  const normalized = DEVICE_ALIASES[deviceId] ?? deviceId;
  const site = getMonitoringLayoutSiteV1(siteId);
  for (const floor of site.floors) {
    const hit = floor.devices.find((d) => d.deviceId === normalized);
    if (hit) return hit;
  }
  return null;
}

export function findMonitoringFloorForDeviceV1(
  siteId: string | null | undefined,
  deviceId: string | null | undefined
): MonitoringLayoutFloorV1 | null {
  if (!deviceId) return null;
  const normalized = DEVICE_ALIASES[deviceId] ?? deviceId;
  const site = getMonitoringLayoutSiteV1(siteId);
  return site.floors.find((f) => f.devices.some((d) => d.deviceId === normalized)) ?? null;
}

export function guessDeviceNameFromIdV1(deviceId: string): string {
  const parts = deviceId.split("-").filter(Boolean);
  if (parts.length >= 2) {
    const kind = parts[parts.length - 2] ?? "";
    const map: Record<string, string> = {
      cam: "カメラ",
      camera: "カメラ",
      door: "ドアセンサー",
      win: "窓センサー",
      window: "窓センサー",
      pir: "人感センサー",
      sensor: "センサー",
      beam: "ビームセンサー",
      panel: "制御盤",
      gate: "ゲート",
      light: "照明",
      emergency: "非常停止",
    };
    if (map[kind]) return map[kind]!;
  }
  return "未登録機器";
}
