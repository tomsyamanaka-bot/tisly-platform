/**
 * ダークSOC監視センター用
 * アラームログとカメラ連動
 * 既存サイト配列は削除しない
 */

import {
  findSecuritySiteV1,
  listSecuritySitesV1,
  sensorKindIconV1,
  setSecuritySensorStateV1,
  setSecuritySocSensorListenerV1,
  type SecuritySensorV1,
  type SecuritySiteV1,
} from "./security-floor-sites-v1.js";

export type SecurityAlarmStatusV1 =
  | "open"
  | "handling"
  | "done";

export interface SecurityAlarmLogV1 {
  id: string;
  siteId: string;
  at: string;
  floorId: string;
  location: string;
  kind: string;
  kindLabel: string;
  deviceLabel: string;
  sensorId: string;
  cameraId: string | null;
  status: SecurityAlarmStatusV1;
  handler: string;
}

export interface SecurityCameraViewV1 {
  id: string;
  floorId: string;
  label: string;
  customerLabel: string;
  scene: string;
  live: boolean;
}

export interface SecuritySocOverlayV1 {
  layers: Array<{
    id: string;
    label: string;
    enabled: boolean;
    z: number;
  }>;
  cameras: SecurityCameraViewV1[];
  alarmLogs: SecurityAlarmLogV1[];
  lightingOn: number;
  lightingTotal: number;
  energyKw: number;
  energyMaxKw: number;
  networkMs: number;
  weather: {
    tempC: number;
    humidity: number;
    windMs: number;
    label: string;
  };
  selectedCameraId: string | null;
}

const alarmLogs: SecurityAlarmLogV1[] = [];
let logSeq = 1;

const KIND_LABEL_JA: Record<string, string> = {
  lock: "侵入検知",
  door: "開放検知",
  window: "開放検知",
  mmwave: "人感検知",
  gas: "ガス漏れ",
  panel: "設備異常",
  camera: "映像イベント",
};

function nowIso(): string {
  return new Date().toISOString();
}

function roomLabel(
  site: SecuritySiteV1,
  roomId: string
): string {
  return (
    site.rooms.find((r) => r.id === roomId)?.label ||
    "未登録"
  );
}

function cameraScene(id: string): string {
  if (id.includes("katte") || id.includes("back")) {
    return "backdoor";
  }
  if (id.includes("entry") || id.includes("front")) {
    return "entry";
  }
  if (id.includes("park") || id.includes("garage")) {
    return "parking";
  }
  if (id.includes("yard") || id.includes("garden")) {
    return "garden";
  }
  return "lobby";
}

export function isVisibleSecurityFloorIdV1(id: string): boolean {
  return id !== "roof";
}

export function layerLabel(id: string, fallback: string): string {
  if (id === "all") return "全体俯瞰";
  if (id === "outdoor") return "外周・敷地";
  if (id === "1f") return "1F";
  if (id === "2f") return "2F";
  if (id === "roof") return "屋根/太陽光";
  return fallback;
}

function layerZ(id: string): number {
  if (id === "outdoor") return 0;
  if (id === "1f") return 1;
  if (id === "2f") return 2;
  if (id === "roof") return 3;
  return 1;
}

function weatherFor(site: SecuritySiteV1) {
  if (site.countryCode === "AU") {
    return {
      tempC: 24.2,
      humidity: 58,
      windMs: 3.4,
      label: "晴れ",
    };
  }
  if (site.id.includes("MORIYA")) {
    return {
      tempC: 12.5,
      humidity: 62,
      windMs: 2.1,
      label: "晴れ",
    };
  }
  return {
    tempC: 13.1,
    humidity: 60,
    windMs: 1.8,
    label: "曇り",
  };
}

export function kindLabelJaV1(kind: string): string {
  return KIND_LABEL_JA[kind] || "検知";
}

export function statusLabelJaV1(
  status: SecurityAlarmStatusV1
): string {
  if (status === "open") return "未対応";
  if (status === "handling") return "対応中";
  return "対応済み";
}

function pushAlarmLog(
  site: SecuritySiteV1,
  sensor: SecuritySensorV1
): void {
  alarmLogs.unshift({
    id: `ALM-${Date.now()}-${logSeq++}`,
    siteId: site.id,
    at: nowIso(),
    floorId: sensor.floorId,
    location: roomLabel(site, sensor.roomId),
    kind: sensor.kind,
    kindLabel: kindLabelJaV1(sensor.kind),
    deviceLabel: sensor.label,
    sensorId: sensor.id,
    cameraId: sensor.linkedCameraId || null,
    status: "open",
    handler: "",
  });
  if (alarmLogs.length > 80) {
    alarmLogs.length = 80;
  }
}

function seedInitialLogs(): void {
  for (const site of listSecuritySitesV1()) {
    for (const sensor of site.sensors) {
      if (sensor.state !== "alert") continue;
      const exists = alarmLogs.some(
        (l) =>
          l.siteId === site.id &&
          l.sensorId === sensor.id &&
          l.status !== "done"
      );
      if (!exists) pushAlarmLog(site, sensor);
    }
  }
}

setSecuritySocSensorListenerV1((site, sensor, state) => {
  if (state === "alert") {
    pushAlarmLog(site, sensor);
  }
});

seedInitialLogs();

export function listSecurityAlarmLogsV1(
  siteId: string
): SecurityAlarmLogV1[] {
  return alarmLogs.filter((l) => l.siteId === siteId);
}

export function ackSecurityAlarmsV1(
  siteId: string,
  handler = "デモ管理者"
): SecurityAlarmLogV1[] {
  const site = findSecuritySiteV1(siteId);
  for (const log of alarmLogs) {
    if (log.siteId !== siteId) continue;
    if (log.status === "done") continue;
    log.status = "done";
    log.handler = handler;
  }
  for (const sensor of site.sensors) {
    if (sensor.state === "alert") {
      sensor.state = "normal";
    }
  }
  return listSecurityAlarmLogsV1(siteId);
}

export function setSecurityLightingV1(
  siteId: string,
  on: boolean
): SecuritySiteV1 {
  const site = findSecuritySiteV1(siteId);
  const total = site.lightingTotal || 8;
  site.lightingOn = on ? total : 0;
  return site;
}

export function listSecurityCamerasV1(
  site: SecuritySiteV1
): SecurityCameraViewV1[] {
  return site.sensors
    .filter((s) => s.kind === "camera")
    .map((s) => ({
      id: s.id,
      floorId: s.floorId,
      label: s.label,
      customerLabel: s.customerLabel,
      scene: cameraScene(s.id),
      live: true,
    }));
}

export function pickLinkedCameraIdV1(
  site: SecuritySiteV1
): string | null {
  const alert = site.sensors.find(
    (s) => s.state === "alert" && s.linkedCameraId
  );
  if (alert?.linkedCameraId) return alert.linkedCameraId;
  const cam = site.sensors.find((s) => s.kind === "camera");
  return cam?.id || null;
}

export function buildSecuritySocOverlayV1(
  site: SecuritySiteV1
): SecuritySocOverlayV1 {
  const layers = site.floors
    .filter((f) => isVisibleSecurityFloorIdV1(f.id))
    .map((f) => ({
      id: f.id,
      label: layerLabel(f.id, f.label),
      enabled: f.enabled,
      z: layerZ(f.id),
    }));
  return {
    layers,
    cameras: listSecurityCamerasV1(site),
    alarmLogs: listSecurityAlarmLogsV1(site.id),
    lightingOn: site.lightingOn ?? 0,
    lightingTotal: site.lightingTotal ?? 8,
    energyKw: site.energyKw ?? 0,
    energyMaxKw: site.energyMaxKw ?? 0,
    networkMs: site.networkMs ?? 12,
    weather: weatherFor(site),
    selectedCameraId: pickLinkedCameraIdV1(site),
  };
}

export function sensorKindIconSocV1(kind: string): string {
  return sensorKindIconV1(
    kind as SecuritySensorV1["kind"]
  );
}

export function pickPrimaryAlertSensorV1(
  site: SecuritySiteV1
): SecuritySensorV1 | undefined {
  return (
    site.sensors.find(
      (s) =>
        s.id === "my-door-katte" ||
        s.id.includes("door-katte") ||
        s.label.includes("勝手口ドア")
    ) ||
    site.sensors.find(
      (s) =>
        s.id.includes("door-front") ||
        s.label.includes("玄関ドア")
    ) ||
    site.sensors.find((s) => s.kind === "door") ||
    site.sensors.find((s) => s.kind === "mmwave") ||
    site.sensors[0]
  );
}

export function demoTogglePrimaryAlertV1(
  siteId: string
): SecuritySiteV1 {
  const site = findSecuritySiteV1(siteId);
  const target = pickPrimaryAlertSensorV1(site);
  if (!target) return site;
  const updated = setSecuritySensorStateV1(
    siteId,
    target.id,
    target.state === "alert" ? "normal" : "alert"
  );
  return updated || site;
}

/** HOME サイト ID → Security Floor サイト ID */
export function mapHomeSiteIdToSecurityFloorSiteIdV1(
  homeSiteId: string
): string {
  const id = String(homeSiteId || "").trim();
  if (!id) return "SEC-JP-ITABASHI-LIVE";
  if (id.startsWith("SEC-")) return id;
  if (id === "HOME-JP-ITABASHI-LIVE") return "SEC-JP-ITABASHI-LIVE";
  if (id.startsWith("HOME-")) return `SEC-${id.slice("HOME-".length)}`;
  return id;
}

function ensureDiSensorOnSiteV1(
  site: SecuritySiteV1,
  di: 1 | 2
): SecuritySensorV1 {
  const id = di === 1 ? "my-di1-park" : "my-di2-garage";
  const existing = site.sensors.find((s) => s.id === id);
  if (existing) return existing;
  const sensor: SecuritySensorV1 = {
    id,
    floorId: "outdoor",
    roomId: di === 1 ? "my-out-park" : "my-out-park",
    kind: "mmwave",
    label:
      di === 1
        ? "駐車場センサー (DI1)"
        : "ガレージセンサー (DI2)",
    customerLabel:
      di === 1 ? "駐車場センサー" : "ガレージセンサー",
    x: di === 1 ? 24 : 42,
    y: di === 1 ? 40 : 55,
    state: "normal",
    deviceId: di === 1 ? "RP2350-DI1" : "RP2350-DI2",
  };
  // ガレージ部屋があれば DI2 を寄せる
  if (di === 2) {
    const garage = site.rooms.find(
      (r) =>
        /ガレージ|車庫|garage/i.test(r.label) ||
        r.id.includes("garage")
    );
    if (garage) {
      sensor.roomId = garage.id;
      sensor.floorId = garage.floorId;
    }
  } else {
    const park = site.rooms.find(
      (r) =>
        /駐車|駐車場|park/i.test(r.label) ||
        r.id.includes("park")
    );
    if (park) {
      sensor.roomId = park.id;
      sensor.floorId = park.floorId;
    }
  }
  site.sensors.push(sensor);
  return sensor;
}

function diKindLabelV1(
  di: 1 | 2,
  pattern?: string
): string {
  if (di === 1) return "駐車場センサー検知";
  if (pattern === "pattern_b") {
    return "段階侵入・ガレージセンサー検知";
  }
  return "ガレージセンサー検知";
}

/**
 * RP2350 DI1/DI2 検知を Security Floor のアラーム発報へ反映する。
 * センサー state=alert + alarmLogs open を同期する。
 */
export function recordHomeDiSecurityAlarmV1(input: {
  homeSiteId: string;
  di: 1 | 2;
  pattern?: string;
  message?: string;
}): SecurityAlarmLogV1 {
  const siteId = mapHomeSiteIdToSecurityFloorSiteIdV1(
    input.homeSiteId
  );
  const site = findSecuritySiteV1(siteId);
  const sensor = ensureDiSensorOnSiteV1(site, input.di);
  const kindLabel =
    input.message?.replace(/^🚨?\s*/, "").trim() ||
    diKindLabelV1(input.di, input.pattern);

  sensor.state = "alert";
  sensor.label =
    input.di === 1
      ? "駐車場センサー (DI1)"
      : "ガレージセンサー (DI2)";

  const openExisting = alarmLogs.find(
    (l) =>
      l.siteId === site.id &&
      l.sensorId === sensor.id &&
      l.status !== "done"
  );
  if (openExisting) {
    openExisting.at = nowIso();
    openExisting.kindLabel = kindLabel;
    openExisting.deviceLabel = sensor.label;
    openExisting.location = roomLabel(site, sensor.roomId);
    openExisting.floorId = sensor.floorId;
    return openExisting;
  }

  const log: SecurityAlarmLogV1 = {
    id: `ALM-DI${input.di}-${Date.now()}-${logSeq++}`,
    siteId: site.id,
    at: nowIso(),
    floorId: sensor.floorId,
    location: roomLabel(site, sensor.roomId),
    kind: "mmwave",
    kindLabel,
    deviceLabel: sensor.label,
    sensorId: sensor.id,
    cameraId: sensor.linkedCameraId || null,
    status: "open",
    handler: "",
  };
  alarmLogs.unshift(log);
  if (alarmLogs.length > 80) {
    alarmLogs.length = 80;
  }
  return log;
}
