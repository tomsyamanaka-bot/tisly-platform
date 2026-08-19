/**
 * ホームセキュリティ
 * フロア俯瞰図カタログ（JP/AU）
 * 既存配列は触らず末尾追記のみ
 */

export type SecurityCountryCodeV1 = "JP" | "AU";
export type SecurityCurrencyV1 = "JPY" | "AUD";
export type SecurityFloorIdV1 = "1f" | "2f" | "outdoor";
export type SecurityGuardModeV1 = "home" | "away" | "disarmed";
export type SecuritySensorKindV1 =
  | "lock"
  | "door"
  | "mmwave"
  | "gas"
  | "panel";
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
  return site;
}
