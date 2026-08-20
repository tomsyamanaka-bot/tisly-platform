/**
 * ホームセキュリティ
 * フロア俯瞰図カタログ（JP/AU）
 * 既存配列は触らず末尾追記のみ
 */

export type SecurityCountryCodeV1 = "JP" | "AU";
export type SecurityCurrencyV1 = "JPY" | "AUD";
export type SecurityFloorIdV1 =
  | "1f"
  | "2f"
  | "outdoor"
  | "roof";
export type SecurityGuardModeV1 = "home" | "away" | "disarmed";
export type SecuritySensorKindV1 =
  | "lock"
  | "door"
  | "mmwave"
  | "gas"
  | "panel"
  | "camera"
  | "window";
export type SecuritySensorStateV1 = "normal" | "alert";
export type SecurityPlanStatusV1 =
  | "active"
  | "trial"
  | "paused";

export interface SecurityFloorMetaV1 {
  id: SecurityFloorIdV1;
  label: string;
  enabled: boolean;
}

export interface SecurityRoomV1 {
  id: string;
  floorId: SecurityFloorIdV1;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SecuritySensorV1 {
  id: string;
  floorId: SecurityFloorIdV1;
  roomId: string;
  kind: SecuritySensorKindV1;
  label: string;
  customerLabel: string;
  x: number;
  y: number;
  state: SecuritySensorStateV1;
  deviceId: string;
  linkedCameraId?: string;
}

export interface SecuritySiteV1 {
  id: string;
  tenantId: string;
  countryCode: SecurityCountryCodeV1;
  currency: SecurityCurrencyV1;
  kind: "home";
  displayName: string;
  addressLabel: string;
  planCode: string;
  planStatus: SecurityPlanStatusV1;
  monthlyFee: number;
  floors: SecurityFloorMetaV1[];
  rooms: SecurityRoomV1[];
  sensors: SecuritySensorV1[];
  guardMode: SecurityGuardModeV1;
  notes: string[];
  lightingOn?: number;
  lightingTotal?: number;
  energyKw?: number;
  energyMaxKw?: number;
  networkMs?: number;
}

export const SECURITY_FLOOR_DEFAULT_SITE_ID_V1 =
  "SEC-JP-TSUKUBA-001";

const JP_FLOORS: SecurityFloorMetaV1[] = [
  { id: "1f", label: "1F", enabled: true },
  { id: "2f", label: "2F", enabled: true },
  {
    id: "outdoor",
    label: "屋外・ガレージ",
    enabled: true,
  },
];

const AU_FLOORS: SecurityFloorMetaV1[] = [
  { id: "1f", label: "1F", enabled: true },
  { id: "2f", label: "2F", enabled: false },
  {
    id: "outdoor",
    label: "屋外・ガレージ",
    enabled: true,
  },
];

/**
 * つくばモデルハウス（2階建て）と
 * Sydney Demo House（平屋）を末尾に置く。
 */
export const SECURITY_FLOOR_SITES_V1: SecuritySiteV1[] = [
  {
    id: "SEC-JP-TSUKUBA-001",
    tenantId: "tenant_toms_jp",
    countryCode: "JP",
    currency: "JPY",
    kind: "home",
    displayName: "つくばモデルハウス",
    addressLabel: "茨城県つくば市",
    planCode: "home_security_std",
    planStatus: "active",
    monthlyFee: 3300,
    floors: JP_FLOORS,
    rooms: [
      {
        id: "jp-1f-genkan",
        floorId: "1f",
        label: "玄関",
        x: 2,
        y: 58,
        w: 22,
        h: 38,
      },
      {
        id: "jp-1f-living",
        floorId: "1f",
        label: "リビング",
        x: 26,
        y: 8,
        w: 46,
        h: 52,
      },
      {
        id: "jp-1f-kitchen",
        floorId: "1f",
        label: "キッチン",
        x: 74,
        y: 8,
        w: 24,
        h: 42,
      },
      {
        id: "jp-1f-back",
        floorId: "1f",
        label: "勝手口",
        x: 74,
        y: 52,
        w: 24,
        h: 44,
      },
      {
        id: "jp-1f-hall",
        floorId: "1f",
        label: "ホール",
        x: 26,
        y: 62,
        w: 46,
        h: 34,
      },
      {
        id: "jp-2f-master",
        floorId: "2f",
        label: "主寝室",
        x: 4,
        y: 10,
        w: 44,
        h: 50,
      },
      {
        id: "jp-2f-child",
        floorId: "2f",
        label: "子供部屋",
        x: 52,
        y: 10,
        w: 44,
        h: 50,
      },
      {
        id: "jp-2f-hall",
        floorId: "2f",
        label: "2Fホール",
        x: 4,
        y: 64,
        w: 92,
        h: 28,
      },
      {
        id: "jp-out-garage",
        floorId: "outdoor",
        label: "ガレージ",
        x: 6,
        y: 18,
        w: 52,
        h: 64,
      },
      {
        id: "jp-out-yard",
        floorId: "outdoor",
        label: "庭・外周",
        x: 62,
        y: 18,
        w: 32,
        h: 64,
      },
    ],
    sensors: [
      {
        id: "jp-lock-front",
        floorId: "1f",
        roomId: "jp-1f-genkan",
        kind: "lock",
        label: "玄関スマートロック",
        customerLabel: "玄関のかぎ",
        x: 13,
        y: 72,
        state: "normal",
        deviceId: "DEV-LOCK-JP-01",
      },
      {
        id: "jp-door-front",
        floorId: "1f",
        roomId: "jp-1f-genkan",
        kind: "door",
        label: "玄関ドアセンサー",
        customerLabel: "玄関のドア",
        x: 13,
        y: 88,
        state: "normal",
        deviceId: "DEV-DOOR-JP-01",
      },
      {
        id: "jp-mmwave-living",
        floorId: "1f",
        roomId: "jp-1f-living",
        kind: "mmwave",
        label: "リビングミリ波人感",
        customerLabel: "リビングの人感",
        x: 49,
        y: 34,
        state: "alert",
        deviceId: "DEV-LD2410-JP-01",
      },
      {
        id: "jp-door-back",
        floorId: "1f",
        roomId: "jp-1f-back",
        kind: "door",
        label: "勝手口ドアセンサー",
        customerLabel: "勝手口",
        x: 86,
        y: 74,
        state: "normal",
        deviceId: "DEV-DOOR-JP-02",
      },
      {
        id: "jp-gas-meter",
        floorId: "1f",
        roomId: "jp-1f-kitchen",
        kind: "gas",
        label: "ガスメーター接点",
        customerLabel: "ガスメーター",
        x: 86,
        y: 22,
        state: "normal",
        deviceId: "DEV-GAS-JP-01",
      },
      {
        id: "jp-panel",
        floorId: "outdoor",
        roomId: "jp-out-garage",
        kind: "panel",
        label: "分電盤",
        customerLabel: "電気の分電盤",
        x: 18,
        y: 32,
        state: "normal",
        deviceId: "DEV-PANEL-JP-01",
      },
    ],
    guardMode: "away",
    notes: [
      "リビングの人感が反応しています",
      "外出警戒モードです",
    ],
  },
  {
    id: "SEC-AU-SYDNEY-001",
    tenantId: "tenant_demo_au",
    countryCode: "AU",
    currency: "AUD",
    kind: "home",
    displayName: "Sydney Demo House",
    addressLabel: "Sydney, NSW",
    planCode: "home_security_au",
    planStatus: "trial",
    monthlyFee: 29,
    floors: AU_FLOORS,
    rooms: [
      {
        id: "au-1f-entry",
        floorId: "1f",
        label: "Entry",
        x: 4,
        y: 8,
        w: 22,
        h: 40,
      },
      {
        id: "au-1f-living",
        floorId: "1f",
        label: "Living",
        x: 28,
        y: 8,
        w: 44,
        h: 52,
      },
      {
        id: "au-1f-kitchen",
        floorId: "1f",
        label: "Kitchen",
        x: 74,
        y: 8,
        w: 22,
        h: 40,
      },
      {
        id: "au-1f-laundry",
        floorId: "1f",
        label: "Laundry",
        x: 74,
        y: 52,
        w: 22,
        h: 40,
      },
      {
        id: "au-1f-bed",
        floorId: "1f",
        label: "Bedroom",
        x: 4,
        y: 52,
        w: 68,
        h: 40,
      },
      {
        id: "au-out-garage",
        floorId: "outdoor",
        label: "Garage",
        x: 8,
        y: 22,
        w: 48,
        h: 56,
      },
      {
        id: "au-out-yard",
        floorId: "outdoor",
        label: "Yard",
        x: 60,
        y: 22,
        w: 32,
        h: 56,
      },
    ],
    sensors: [
      {
        id: "au-lock-front",
        floorId: "1f",
        roomId: "au-1f-entry",
        kind: "lock",
        label: "Front smart lock",
        customerLabel: "玄関のかぎ",
        x: 15,
        y: 22,
        state: "normal",
        deviceId: "DEV-LOCK-AU-01",
      },
      {
        id: "au-door-front",
        floorId: "1f",
        roomId: "au-1f-entry",
        kind: "door",
        label: "Front door sensor",
        customerLabel: "玄関のドア",
        x: 15,
        y: 38,
        state: "normal",
        deviceId: "DEV-DOOR-AU-01",
      },
      {
        id: "au-mmwave-living",
        floorId: "1f",
        roomId: "au-1f-living",
        kind: "mmwave",
        label: "Living mmWave",
        customerLabel: "リビングの人感",
        x: 50,
        y: 34,
        state: "normal",
        deviceId: "DEV-LD2410-AU-01",
      },
      {
        id: "au-door-laundry",
        floorId: "1f",
        roomId: "au-1f-laundry",
        kind: "door",
        label: "Laundry door",
        customerLabel: "勝手口",
        x: 85,
        y: 72,
        state: "normal",
        deviceId: "DEV-DOOR-AU-02",
      },
      {
        id: "au-gas-meter",
        floorId: "1f",
        roomId: "au-1f-kitchen",
        kind: "gas",
        label: "Gas meter pulse",
        customerLabel: "ガスメーター",
        x: 85,
        y: 22,
        state: "normal",
        deviceId: "DEV-GAS-AU-01",
      },
      {
        id: "au-panel",
        floorId: "outdoor",
        roomId: "au-out-garage",
        kind: "panel",
        label: "Switchboard",
        customerLabel: "電気の分電盤",
        x: 20,
        y: 36,
        state: "normal",
        deviceId: "DEV-PANEL-AU-01",
      },
    ],
    guardMode: "home",
    notes: [
      "All sensors are clear",
      "Stay mode is on",
    ],
  },
  {
    id: "SEC-JP-MORIYA-001",
    tenantId: "tenant_toms_jp",
    countryCode: "JP",
    currency: "JPY",
    kind: "home",
    displayName: "守谷市 美園の家",
    addressLabel: "茨城県守谷市美園",
    planCode: "home_security_std",
    planStatus: "active",
    monthlyFee: 4400,
    floors: [
      { id: "1f", label: "1F", enabled: true },
      { id: "2f", label: "2F", enabled: true },
      {
        id: "outdoor",
        label: "外周・敷地",
        enabled: true,
      },
      {
        id: "roof",
        label: "屋根/太陽光",
        enabled: false,
      },
    ],
    rooms: [
      {
        id: "my-1f-entry",
        floorId: "1f",
        label: "玄関ホール",
        x: 8,
        y: 56,
        w: 22,
        h: 36,
      },
      {
        id: "my-1f-living",
        floorId: "1f",
        label: "LDK",
        x: 32,
        y: 10,
        w: 42,
        h: 50,
      },
      {
        id: "my-1f-kitchen",
        floorId: "1f",
        label: "キッチン",
        x: 76,
        y: 10,
        w: 18,
        h: 38,
      },
      {
        id: "my-1f-deck",
        floorId: "1f",
        label: "ウッドデッキ",
        x: 32,
        y: 62,
        w: 42,
        h: 28,
      },
      {
        id: "my-2f-master",
        floorId: "2f",
        label: "主寝室",
        x: 8,
        y: 12,
        w: 40,
        h: 46,
      },
      {
        id: "my-2f-child",
        floorId: "2f",
        label: "子供部屋",
        x: 52,
        y: 12,
        w: 40,
        h: 46,
      },
      {
        id: "my-2f-hall",
        floorId: "2f",
        label: "2Fホール",
        x: 8,
        y: 62,
        w: 84,
        h: 28,
      },
      {
        id: "my-out-park",
        floorId: "outdoor",
        label: "駐車スペース",
        x: 8,
        y: 16,
        w: 48,
        h: 66,
      },
      {
        id: "my-out-garden",
        floorId: "outdoor",
        label: "庭・外周",
        x: 60,
        y: 16,
        w: 32,
        h: 66,
      },
      {
        id: "my-roof-pv",
        floorId: "roof",
        label: "太陽光パネル",
        x: 10,
        y: 18,
        w: 80,
        h: 64,
      },
    ],
    sensors: [
      {
        id: "my-lock-front",
        floorId: "1f",
        roomId: "my-1f-entry",
        kind: "lock",
        label: "玄関スマートロック",
        customerLabel: "玄関のかぎ",
        x: 19,
        y: 70,
        state: "alert",
        deviceId: "DEV-LOCK-MY-01",
        linkedCameraId: "my-cam-entry",
      },
      {
        id: "my-door-front",
        floorId: "1f",
        roomId: "my-1f-entry",
        kind: "door",
        label: "玄関ドアセンサー",
        customerLabel: "玄関のドア",
        x: 19,
        y: 82,
        state: "alert",
        deviceId: "DEV-DOOR-MY-01",
        linkedCameraId: "my-cam-entry",
      },
      {
        id: "my-mmwave-living",
        floorId: "1f",
        roomId: "my-1f-living",
        kind: "mmwave",
        label: "LDKミリ波人感",
        customerLabel: "リビングの人感",
        x: 52,
        y: 32,
        state: "normal",
        deviceId: "DEV-LD2410-MY-01",
        linkedCameraId: "my-cam-living",
      },
      {
        id: "my-window-deck",
        floorId: "1f",
        roomId: "my-1f-deck",
        kind: "window",
        label: "デッキ掃き出し窓",
        customerLabel: "デッキの窓",
        x: 52,
        y: 78,
        state: "normal",
        deviceId: "DEV-WIN-MY-01",
        linkedCameraId: "my-cam-garden",
      },
      {
        id: "my-door-back",
        floorId: "1f",
        roomId: "my-1f-kitchen",
        kind: "door",
        label: "勝手口センサー",
        customerLabel: "勝手口",
        x: 86,
        y: 36,
        state: "normal",
        deviceId: "DEV-DOOR-MY-02",
        linkedCameraId: "my-cam-back",
      },
      {
        id: "my-gas-meter",
        floorId: "1f",
        roomId: "my-1f-kitchen",
        kind: "gas",
        label: "ガスメーター接点",
        customerLabel: "ガスメーター",
        x: 86,
        y: 18,
        state: "normal",
        deviceId: "DEV-GAS-MY-01",
      },
      {
        id: "my-panel",
        floorId: "outdoor",
        roomId: "my-out-park",
        kind: "panel",
        label: "分電盤",
        customerLabel: "電気の分電盤",
        x: 18,
        y: 28,
        state: "normal",
        deviceId: "DEV-PANEL-MY-01",
      },
      {
        id: "my-cam-entry",
        floorId: "1f",
        roomId: "my-1f-entry",
        kind: "camera",
        label: "玄関カメラ 01",
        customerLabel: "玄関のカメラ",
        x: 16,
        y: 64,
        state: "normal",
        deviceId: "CAM-MY-ENTRY-01",
        linkedCameraId: "my-cam-entry",
      },
      {
        id: "my-cam-garden",
        floorId: "outdoor",
        roomId: "my-out-garden",
        kind: "camera",
        label: "庭・テラスカメラ",
        customerLabel: "お庭のカメラ",
        x: 76,
        y: 40,
        state: "normal",
        deviceId: "CAM-MY-GARDEN-01",
        linkedCameraId: "my-cam-garden",
      },
      {
        id: "my-cam-park",
        floorId: "outdoor",
        roomId: "my-out-park",
        kind: "camera",
        label: "駐車カメラ",
        customerLabel: "駐車場のカメラ",
        x: 30,
        y: 50,
        state: "normal",
        deviceId: "CAM-MY-PARK-01",
        linkedCameraId: "my-cam-park",
      },
      {
        id: "my-cam-back",
        floorId: "1f",
        roomId: "my-1f-kitchen",
        kind: "camera",
        label: "勝手口カメラ",
        customerLabel: "勝手口のカメラ",
        x: 80,
        y: 44,
        state: "normal",
        deviceId: "CAM-MY-BACK-01",
        linkedCameraId: "my-cam-back",
      },
      {
        id: "my-cam-living",
        floorId: "1f",
        roomId: "my-1f-living",
        kind: "camera",
        label: "LDKカメラ",
        customerLabel: "リビングのカメラ",
        x: 40,
        y: 20,
        state: "normal",
        deviceId: "CAM-MY-LIVING-01",
        linkedCameraId: "my-cam-living",
      },
    ],
    guardMode: "away",
    notes: [
      "玄関ドアセンサーが発報しています",
      "外出警戒モードです",
    ],
    lightingOn: 4,
    lightingTotal: 8,
    energyKw: 2.35,
    energyMaxKw: 5.21,
    networkMs: 12,
  },
];

export function findSecuritySiteV1(
  id: string | null | undefined
): SecuritySiteV1 {
  const key = String(id || "").trim();
  const found = SECURITY_FLOOR_SITES_V1.find(
    (s) => s.id === key
  );
  if (found) return found;
  return (
    SECURITY_FLOOR_SITES_V1.find(
      (s) => s.id === SECURITY_FLOOR_DEFAULT_SITE_ID_V1
    ) || SECURITY_FLOOR_SITES_V1[0]
  );
}

export function listSecuritySitesV1(): SecuritySiteV1[] {
  return [...SECURITY_FLOOR_SITES_V1];
}

export function guardModeLabelJaV1(
  mode: SecurityGuardModeV1
): string {
  if (mode === "home") return "在宅警備";
  if (mode === "away") return "外出警戒";
  return "警戒解除";
}

export function sensorKindIconV1(
  kind: SecuritySensorKindV1
): string {
  if (kind === "lock") return "🔒";
  if (kind === "door") return "🚪";
  if (kind === "mmwave") return "📡";
  if (kind === "gas") return "🔥";
  if (kind === "camera") return "📷";
  if (kind === "window") return "🪟";
  return "⚡";
}

export function securitySiteHasAlertV1(
  site: SecuritySiteV1
): boolean {
  if (site.guardMode === "disarmed") return false;
  return site.sensors.some((s) => s.state === "alert");
}

export function isSecuritySensorAlertVisibleV1(
  site: SecuritySiteV1,
  sensor: SecuritySensorV1
): boolean {
  if (site.guardMode === "disarmed") return false;
  return sensor.state === "alert";
}

/**
 * 警備モード切替。
 * サイト配列の長さは変えず対象のみ更新。
 */
export function setSecurityGuardModeV1(
  siteId: string,
  mode: SecurityGuardModeV1
): SecuritySiteV1 | null {
  if (
    mode !== "home" &&
    mode !== "away" &&
    mode !== "disarmed"
  ) {
    return null;
  }
  const site = SECURITY_FLOOR_SITES_V1.find(
    (s) => s.id === siteId
  );
  if (!site) return null;
  site.guardMode = mode;
  return site;
}

/**
 * センサー状態切替（デモ発報）。
 * 既存センサーは削除しない。
 */
export function setSecuritySensorStateV1(
  siteId: string,
  sensorId: string,
  state: SecuritySensorStateV1
): SecuritySiteV1 | null {
  if (state !== "normal" && state !== "alert") {
    return null;
  }
  const site = SECURITY_FLOOR_SITES_V1.find(
    (s) => s.id === siteId
  );
  if (!site) return null;
  const sensor = site.sensors.find(
    (s) => s.id === sensorId
  );
  if (!sensor) return null;
  sensor.state = state;
  notifySecuritySocSensorChangeV1(site, sensor, state);
  return site;
}

function appendIfMissing<T extends { id: string }>(
  list: T[],
  item: T
): void {
  if (!list.some((x) => x.id === item.id)) {
    list.push(item);
  }
}

/**
 * SOC 用レイヤーとカメラを
 * 既存物件へ差分追記する。
 */
function enrichExistingSitesForSocV1(): void {
  const jp = SECURITY_FLOOR_SITES_V1.find(
    (s) => s.id === "SEC-JP-TSUKUBA-001"
  );
  if (jp) {
    appendIfMissing(jp.floors, {
      id: "roof",
      label: "屋根/太陽光",
      enabled: false,
    });
    const jpRoof = jp.floors.find((f) => f.id === "roof");
    if (jpRoof) jpRoof.enabled = false;
    appendIfMissing(jp.rooms, {
      id: "jp-roof-pv",
      floorId: "roof",
      label: "太陽光パネル",
      x: 12,
      y: 20,
      w: 76,
      h: 60,
    });
    appendIfMissing(jp.rooms, {
      id: "jp-1f-window-living",
      floorId: "1f",
      label: "リビング窓",
      x: 28,
      y: 2,
      w: 20,
      h: 8,
    });
    const extraJp = [
      {
        id: "jp-window-living",
        floorId: "1f" as const,
        roomId: "jp-1f-living",
        kind: "window" as const,
        label: "リビング窓センサー",
        customerLabel: "リビングの窓",
        x: 36,
        y: 12,
        state: "normal" as const,
        deviceId: "DEV-WIN-JP-01",
        linkedCameraId: "jp-cam-living",
      },
      {
        id: "jp-cam-entry",
        floorId: "1f" as const,
        roomId: "jp-1f-genkan",
        kind: "camera" as const,
        label: "玄関カメラ 01",
        customerLabel: "玄関のカメラ",
        x: 8,
        y: 64,
        state: "normal" as const,
        deviceId: "CAM-JP-ENTRY-01",
        linkedCameraId: "jp-cam-entry",
      },
      {
        id: "jp-cam-living",
        floorId: "1f" as const,
        roomId: "jp-1f-living",
        kind: "camera" as const,
        label: "リビングカメラ",
        customerLabel: "リビングのカメラ",
        x: 38,
        y: 22,
        state: "normal" as const,
        deviceId: "CAM-JP-LIVING-01",
        linkedCameraId: "jp-cam-living",
      },
      {
        id: "jp-cam-park",
        floorId: "outdoor" as const,
        roomId: "jp-out-garage",
        kind: "camera" as const,
        label: "ガレージカメラ",
        customerLabel: "駐車場のカメラ",
        x: 32,
        y: 50,
        state: "normal" as const,
        deviceId: "CAM-JP-PARK-01",
        linkedCameraId: "jp-cam-park",
      },
      {
        id: "jp-cam-yard",
        floorId: "outdoor" as const,
        roomId: "jp-out-yard",
        kind: "camera" as const,
        label: "庭カメラ",
        customerLabel: "お庭のカメラ",
        x: 78,
        y: 48,
        state: "normal" as const,
        deviceId: "CAM-JP-YARD-01",
        linkedCameraId: "jp-cam-yard",
      },
      {
        id: "jp-mmwave-2f",
        floorId: "2f" as const,
        roomId: "jp-2f-master",
        kind: "mmwave" as const,
        label: "2F寝室ミリ波",
        customerLabel: "寝室の人感",
        x: 28,
        y: 36,
        state: "normal" as const,
        deviceId: "DEV-LD2410-JP-02",
        linkedCameraId: "jp-cam-living",
      },
      {
        id: "jp-window-2f",
        floorId: "2f" as const,
        roomId: "jp-2f-master",
        kind: "window" as const,
        label: "2F寝室窓センサー",
        customerLabel: "寝室の窓",
        x: 48,
        y: 18,
        state: "normal" as const,
        deviceId: "DEV-WIN-JP-02",
      },
    ];
    extraJp.forEach((s) => appendIfMissing(jp.sensors, s));
    const living = jp.sensors.find(
      (s) => s.id === "jp-mmwave-living"
    );
    if (living && !living.linkedCameraId) {
      living.linkedCameraId = "jp-cam-living";
    }
    const door = jp.sensors.find(
      (s) => s.id === "jp-door-front"
    );
    if (door && !door.linkedCameraId) {
      door.linkedCameraId = "jp-cam-entry";
    }
    jp.lightingOn ??= 4;
    jp.lightingTotal ??= 8;
    jp.energyKw ??= 1.82;
    jp.energyMaxKw ??= 4.6;
    jp.networkMs ??= 14;
  }

  const au = SECURITY_FLOOR_SITES_V1.find(
    (s) => s.id === "SEC-AU-SYDNEY-001"
  );
  if (au) {
    appendIfMissing(au.floors, {
      id: "roof",
      label: "Roof / PV",
      enabled: false,
    });
    const auRoof = au.floors.find((f) => f.id === "roof");
    if (auRoof) auRoof.enabled = false;
    appendIfMissing(au.rooms, {
      id: "au-roof-pv",
      floorId: "roof",
      label: "Solar array",
      x: 12,
      y: 18,
      w: 76,
      h: 64,
    });
    const extraAu = [
      {
        id: "au-window-living",
        floorId: "1f" as const,
        roomId: "au-1f-living",
        kind: "window" as const,
        label: "Living window",
        customerLabel: "リビングの窓",
        x: 36,
        y: 12,
        state: "normal" as const,
        deviceId: "DEV-WIN-AU-01",
        linkedCameraId: "au-cam-living",
      },
      {
        id: "au-cam-entry",
        floorId: "1f" as const,
        roomId: "au-1f-entry",
        kind: "camera" as const,
        label: "Entry camera 01",
        customerLabel: "玄関のカメラ",
        x: 10,
        y: 16,
        state: "normal" as const,
        deviceId: "CAM-AU-ENTRY-01",
        linkedCameraId: "au-cam-entry",
      },
      {
        id: "au-cam-living",
        floorId: "1f" as const,
        roomId: "au-1f-living",
        kind: "camera" as const,
        label: "Living camera",
        customerLabel: "リビングのカメラ",
        x: 40,
        y: 22,
        state: "normal" as const,
        deviceId: "CAM-AU-LIVING-01",
        linkedCameraId: "au-cam-living",
      },
      {
        id: "au-cam-yard",
        floorId: "outdoor" as const,
        roomId: "au-out-yard",
        kind: "camera" as const,
        label: "Yard camera",
        customerLabel: "お庭のカメラ",
        x: 76,
        y: 48,
        state: "normal" as const,
        deviceId: "CAM-AU-YARD-01",
        linkedCameraId: "au-cam-yard",
      },
      {
        id: "au-cam-garage",
        floorId: "outdoor" as const,
        roomId: "au-out-garage",
        kind: "camera" as const,
        label: "Garage camera",
        customerLabel: "駐車場のカメラ",
        x: 28,
        y: 48,
        state: "normal" as const,
        deviceId: "CAM-AU-GARAGE-01",
        linkedCameraId: "au-cam-garage",
      },
    ];
    extraAu.forEach((s) => appendIfMissing(au.sensors, s));
    au.lightingOn ??= 3;
    au.lightingTotal ??= 6;
    au.energyKw ??= 0.94;
    au.energyMaxKw ??= 3.1;
    au.networkMs ??= 18;
  }

  const moriya = SECURITY_FLOOR_SITES_V1.find(
    (s) => s.id === "SEC-JP-MORIYA-001"
  );
  if (moriya) {
    [
      {
        id: "my-mmwave-2f",
        floorId: "2f" as const,
        roomId: "my-2f-master",
        kind: "mmwave" as const,
        label: "2F寝室ミリ波",
        customerLabel: "寝室の人感",
        x: 24,
        y: 32,
        state: "normal" as const,
        deviceId: "DEV-LD2410-MY-02",
        linkedCameraId: "my-cam-entry",
      },
      {
        id: "my-window-2f",
        floorId: "2f" as const,
        roomId: "my-2f-master",
        kind: "window" as const,
        label: "2Fバルコニー窓",
        customerLabel: "バルコニーの窓",
        x: 40,
        y: 16,
        state: "normal" as const,
        deviceId: "DEV-WIN-MY-02",
      },
      {
        id: "my-cam-2f",
        floorId: "2f" as const,
        roomId: "my-2f-hall",
        kind: "camera" as const,
        label: "2Fホールカメラ",
        customerLabel: "2階のカメラ",
        x: 50,
        y: 74,
        state: "normal" as const,
        deviceId: "CAM-MY-2F-01",
        linkedCameraId: "my-cam-2f",
      },
    ].forEach((s) => appendIfMissing(moriya.sensors, s));
  }
}

enrichExistingSitesForSocV1();

type SocSensorListenerV1 = (
  site: SecuritySiteV1,
  sensor: SecuritySensorV1,
  state: SecuritySensorStateV1
) => void;

let socSensorListenerV1: SocSensorListenerV1 | null =
  null;

export function setSecuritySocSensorListenerV1(
  fn: SocSensorListenerV1 | null
): void {
  socSensorListenerV1 = fn;
}

function notifySecuritySocSensorChangeV1(
  site: SecuritySiteV1,
  sensor: SecuritySensorV1,
  state: SecuritySensorStateV1
): void {
  if (socSensorListenerV1) {
    socSensorListenerV1(site, sensor, state);
  }
}
