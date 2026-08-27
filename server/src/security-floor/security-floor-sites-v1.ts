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
  | "window"
  | "light";
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
    displayName: "平屋デモ宅（手書き間取り）",
    addressLabel: "茨城県守谷市",
    planCode: "home_security_std",
    planStatus: "active",
    monthlyFee: 4400,
    floors: [
      { id: "1f", label: "1F", enabled: true },
      { id: "2f", label: "2F", enabled: false },
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
      // 左側
      {
        id: "my-1f-katte",
        floorId: "1f",
        label: "勝手口キッチン",
        x: 4,
        y: 4,
        w: 20,
        h: 20,
      },
      {
        id: "my-1f-daidokoro",
        floorId: "1f",
        label: "台所",
        x: 24,
        y: 4,
        w: 20,
        h: 20,
      },
      {
        id: "my-1f-toilet",
        floorId: "1f",
        label: "トイレ",
        x: 4,
        y: 24,
        w: 12,
        h: 12,
      },
      // 中央
      {
        id: "my-1f-bath",
        floorId: "1f",
        label: "風呂",
        x: 46,
        y: 4,
        w: 16,
        h: 12,
      },
      {
        id: "my-1f-wc",
        floorId: "1f",
        label: "WC",
        x: 46,
        y: 16,
        w: 16,
        h: 10,
      },
      {
        id: "my-1f-hall",
        floorId: "1f",
        label: "廊下",
        x: 16,
        y: 24,
        w: 46,
        h: 12,
      },
      {
        id: "my-1f-living",
        floorId: "1f",
        label: "リビング洋",
        x: 4,
        y: 36,
        w: 34,
        h: 28,
      },
      {
        id: "my-1f-yo6a",
        floorId: "1f",
        label: "洋6畳",
        x: 4,
        y: 64,
        w: 22,
        h: 16,
      },
      {
        id: "my-1f-yo6b",
        floorId: "1f",
        label: "洋6畳",
        x: 4,
        y: 80,
        w: 22,
        h: 16,
      },
      // 右側
      {
        id: "my-1f-oshiire",
        floorId: "1f",
        label: "押入",
        x: 62,
        y: 4,
        w: 34,
        h: 20,
      },
      {
        id: "my-1f-doma",
        floorId: "1f",
        label: "土間",
        x: 38,
        y: 48,
        w: 24,
        h: 32,
      },
      {
        id: "my-1f-wa10",
        floorId: "1f",
        label: "和10畳",
        x: 62,
        y: 36,
        w: 22,
        h: 32,
      },
      {
        id: "my-1f-wa8",
        floorId: "1f",
        label: "和8畳",
        x: 84,
        y: 36,
        w: 12,
        h: 32,
      },
      {
        id: "my-1f-hall3",
        floorId: "1f",
        label: "廊下（3尺）",
        x: 62,
        y: 80,
        w: 34,
        h: 16,
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
    ],
    sensors: [
      {
        id: "my-door-katte",
        floorId: "1f",
        roomId: "my-1f-katte",
        kind: "door",
        label: "勝手口ドアセンサー（20m）",
        customerLabel: "勝手口のドア",
        x: 8,
        y: 14,
        state: "normal",
        deviceId: "DEV-DOOR-MY-KATTE",
        linkedCameraId: "my-cam-katte",
      },
      {
        id: "my-lock-katte",
        floorId: "1f",
        roomId: "my-1f-katte",
        kind: "lock",
        label: "スマートロック",
        customerLabel: "勝手口のかぎ",
        x: 16,
        y: 10,
        state: "normal",
        deviceId: "DEV-LOCK-MY-KATTE",
        linkedCameraId: "my-cam-katte",
      },
      {
        id: "my-gas-katte",
        floorId: "1f",
        roomId: "my-1f-katte",
        kind: "gas",
        label: "ガス警報器",
        customerLabel: "ガス警報器",
        x: 18,
        y: 18,
        state: "normal",
        deviceId: "DEV-GAS-MY-01",
      },
      {
        id: "my-panel-50a",
        floorId: "1f",
        roomId: "my-1f-katte",
        kind: "panel",
        label: "50A個別配",
        customerLabel: "50A個別配",
        x: 22,
        y: 8,
        state: "normal",
        deviceId: "DEV-PANEL-MY-50A",
      },
      {
        id: "my-mmwave-bath",
        floorId: "1f",
        roomId: "my-1f-hall",
        kind: "mmwave",
        label: "風呂・WC付近人感",
        customerLabel: "廊下の人感",
        x: 54,
        y: 22,
        state: "normal",
        deviceId: "DEV-LD2410-MY-01",
        linkedCameraId: "my-cam-living",
      },
      {
        id: "my-door-living",
        floorId: "1f",
        roomId: "my-1f-living",
        kind: "door",
        label: "リビング洋ドアセンサー",
        customerLabel: "リビングのドア",
        x: 6,
        y: 48,
        state: "normal",
        deviceId: "DEV-DOOR-MY-LIVING",
        linkedCameraId: "my-cam-living",
      },
      {
        id: "my-door-yo6",
        floorId: "1f",
        roomId: "my-1f-yo6b",
        kind: "door",
        label: "洋6畳ドアセンサー",
        customerLabel: "洋室のドア",
        x: 10,
        y: 92,
        state: "normal",
        deviceId: "DEV-DOOR-MY-YO6",
        linkedCameraId: "my-cam-living",
      },
      {
        id: "my-door-wa8",
        floorId: "1f",
        roomId: "my-1f-wa8",
        kind: "door",
        label: "和8畳ドアセンサー",
        customerLabel: "和室のドア",
        x: 92,
        y: 64,
        state: "normal",
        deviceId: "DEV-DOOR-MY-WA8",
        linkedCameraId: "my-cam-garden",
      },
      {
        id: "my-cam-katte",
        floorId: "1f",
        roomId: "my-1f-katte",
        kind: "camera",
        label: "勝手口カメラ 01",
        customerLabel: "勝手口のカメラ",
        x: 12,
        y: 20,
        state: "normal",
        deviceId: "CAM-MY-KATTE-01",
        linkedCameraId: "my-cam-katte",
      },
      {
        id: "my-cam-living",
        floorId: "1f",
        roomId: "my-1f-living",
        kind: "camera",
        label: "リビング洋カメラ",
        customerLabel: "リビングのカメラ",
        x: 28,
        y: 44,
        state: "normal",
        deviceId: "CAM-MY-LIVING-01",
        linkedCameraId: "my-cam-living",
      },
      {
        id: "my-cam-garden",
        floorId: "outdoor",
        roomId: "my-out-garden",
        kind: "camera",
        label: "庭・外周カメラ",
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
    ],
    guardMode: "away",
    notes: [
      "平屋・手書き間取りに基づくデモ物件です",
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
  if (kind === "light") return "💡";
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
    moriya.displayName = "平屋デモ宅（手書き間取り）";
    moriya.addressLabel = "茨城県守谷市";
    moriya.lightingOn ??= 4;
    moriya.lightingTotal ??= 8;
    moriya.energyKw ??= 2.35;
    moriya.energyMaxKw ??= 5.21;
    moriya.networkMs ??= 12;
  }

  // 板橋自宅（RP2350 実機 HOME-JP-ITABASHI-LIVE）— 末尾追記のみ
  ensureItabashiLiveSecuritySiteV1();
}

/** 板橋自宅をカタログ末尾に追記（既存物件は変更しない） */
function ensureItabashiLiveSecuritySiteV1(): void {
  if (
    SECURITY_FLOOR_SITES_V1.some(
      (s) => s.id === "SEC-JP-ITABASHI-LIVE"
    )
  ) {
    return;
  }
  const template = SECURITY_FLOOR_SITES_V1.find(
    (s) => s.id === "SEC-JP-MORIYA-001"
  );
  if (!template) return;
  const site: SecuritySiteV1 = JSON.parse(
    JSON.stringify(template)
  ) as SecuritySiteV1;
  site.id = "SEC-JP-ITABASHI-LIVE";
  site.displayName = "板橋自宅";
  site.addressLabel = "東京都板橋区";
  site.planCode = "home_live";
  site.monthlyFee = 0;
  site.guardMode = "away";
  site.notes = [
    "RP2350 実機連動（HOME-JP-ITABASHI-LIVE）",
    "DI/DO ステータスは板橋自宅ライブと同期します",
  ];
  site.lightingOn ??= 4;
  site.lightingTotal ??= 8;
  site.energyKw ??= 2.1;
  site.energyMaxKw ??= 6;
  site.networkMs ??= 8;
  SECURITY_FLOOR_SITES_V1.push(site);
}

/** 板橋自宅に RP2350 DI1/DI2 センサーを差分追記 */
function enrichItabashiDiSensorsV1(): void {
  const site = SECURITY_FLOOR_SITES_V1.find(
    (s) => s.id === "SEC-JP-ITABASHI-LIVE"
  );
  if (!site) return;
  appendIfMissing(site.sensors, {
    id: "my-di1-park",
    floorId: "outdoor",
    roomId: "my-out-park",
    kind: "mmwave",
    label: "駐車場センサー (DI1)",
    customerLabel: "駐車場センサー",
    x: 24,
    y: 40,
    state: "normal",
    deviceId: "RP2350-DI1",
  });
  appendIfMissing(site.sensors, {
    id: "my-di2-garage",
    floorId: "outdoor",
    roomId: "my-out-park",
    kind: "mmwave",
    label: "ガレージセンサー (DI2)",
    customerLabel: "ガレージセンサー",
    x: 42,
    y: 55,
    state: "normal",
    deviceId: "RP2350-DI2",
  });
}

/**
 * 航空写真風外周（進入路・植栽・母屋）と
 * DI1/DI2/DO2 ピンを末尾追記する。
 */
function enrichAerialPerimeterSitesV1(): void {
  const roomDefs = [
    {
      id: "my-out-approach",
      floorId: "outdoor" as const,
      label: "北側進入路",
      x: 28,
      y: 2,
      w: 44,
      h: 16,
    },
    {
      id: "my-out-hedge",
      floorId: "outdoor" as const,
      label: "西側植栽帯",
      x: 2,
      y: 16,
      w: 18,
      h: 70,
    },
    {
      id: "my-out-house",
      floorId: "outdoor" as const,
      label: "母屋",
      x: 30,
      y: 56,
      w: 40,
      h: 30,
    },
  ];
  const sensorDefsMoriya = [
    {
      id: "my-di1-park",
      floorId: "outdoor" as const,
      roomId: "my-out-approach",
      kind: "mmwave" as const,
      label: "進入路センサー (DI1)",
      customerLabel: "進入路センサー",
      x: 50,
      y: 10,
      state: "normal" as const,
      deviceId: "RP2350-DI1",
    },
    {
      id: "my-di2-garage",
      floorId: "outdoor" as const,
      roomId: "my-out-park",
      kind: "mmwave" as const,
      label: "駐車場センサー (DI2)",
      customerLabel: "駐車場センサー",
      x: 48,
      y: 36,
      state: "normal" as const,
      deviceId: "RP2350-DI2",
    },
    {
      id: "my-do2-light",
      floorId: "outdoor" as const,
      roomId: "my-out-house",
      kind: "light" as const,
      label: "防犯ライト (DO2)",
      customerLabel: "母屋北面のライト",
      x: 50,
      y: 56,
      state: "normal" as const,
      deviceId: "RP2350-DO2",
    },
  ];
  const sensorDefsItabashiDo2 = [
    {
      id: "my-do2-light",
      floorId: "outdoor" as const,
      roomId: "my-out-house",
      kind: "light" as const,
      label: "防犯ライト (DO2)",
      customerLabel: "母屋北面のライト",
      x: 50,
      y: 56,
      state: "normal" as const,
      deviceId: "RP2350-DO2",
    },
  ];

  for (const siteId of [
    "SEC-JP-MORIYA-001",
    "SEC-JP-ITABASHI-LIVE",
  ] as const) {
    const site = SECURITY_FLOOR_SITES_V1.find(
      (s) => s.id === siteId
    );
    if (!site) continue;
    for (const room of roomDefs) {
      appendIfMissing(site.rooms, room);
    }
    const sensors =
      siteId === "SEC-JP-MORIYA-001"
        ? sensorDefsMoriya
        : sensorDefsItabashiDo2;
    for (const sensor of sensors) {
      appendIfMissing(site.sensors, sensor);
    }
  }
}

enrichExistingSitesForSocV1();
enrichItabashiDiSensorsV1();
enrichAerialPerimeterSitesV1();

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
