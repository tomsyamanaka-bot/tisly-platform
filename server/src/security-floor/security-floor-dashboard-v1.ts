/**
 * ホームセキュリティ
 * 顧客向け / 社内向けダッシュボード
 */

import {
  findSecuritySiteV1,
  guardModeLabelJaV1,
  isSecuritySensorAlertVisibleV1,
  listSecuritySitesV1,
  securitySiteHasAlertV1,
  sensorKindIconV1,
  type SecurityGuardModeV1,
  type SecuritySensorV1,
  type SecuritySiteV1,
} from "./security-floor-sites-v1.js";

export interface SecurityFloorViewSensorV1 {
  id: string;
  floorId: string;
  roomId: string;
  kind: string;
  label: string;
  icon: string;
  x: number;
  y: number;
  state: string;
  alertVisible: boolean;
}

export interface SecurityFloorViewRoomV1 {
  id: string;
  floorId: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  alertVisible: boolean;
}

export interface SecurityFloorCustomerDashboardV1 {
  siteId: string;
  displayName: string;
  addressLabel: string;
  countryCode: string;
  currency: string;
  status: "normal" | "alert";
  statusEmoji: string;
  statusLabel: string;
  guardMode: SecurityGuardModeV1;
  guardModeLabel: string;
  floors: Array<{
    id: string;
    label: string;
    enabled: boolean;
  }>;
  rooms: SecurityFloorViewRoomV1[];
  sensors: SecurityFloorViewSensorV1[];
  notes: string[];
  lastUpdatedAt: string;
}

export interface SecurityFloorOperatorSiteRowV1 {
  siteId: string;
  displayName: string;
  addressLabel: string;
  tenantId: string;
  countryCode: string;
  currency: string;
  planCode: string;
  planStatus: string;
  monthlyFee: number;
  guardMode: SecurityGuardModeV1;
  guardModeLabel: string;
  hasAlert: boolean;
  floors: Array<{
    id: string;
    label: string;
    enabled: boolean;
  }>;
  rooms: SecurityFloorViewRoomV1[];
  sensors: SecurityFloorViewSensorV1[];
  notes: string[];
}

export interface SecurityFloorOperatorDashboardV1 {
  generatedAt: string;
  totalSites: number;
  alertCount: number;
  sites: SecurityFloorOperatorSiteRowV1[];
}

function mapSensor(
  site: SecuritySiteV1,
  sensor: SecuritySensorV1,
  customerFacing: boolean
): SecurityFloorViewSensorV1 {
  const alertVisible = isSecuritySensorAlertVisibleV1(
    site,
    sensor
  );
  return {
    id: sensor.id,
    floorId: sensor.floorId,
    roomId: sensor.roomId,
    kind: sensor.kind,
    label: customerFacing
      ? sensor.customerLabel
      : sensor.label,
    icon: sensorKindIconV1(sensor.kind),
    x: sensor.x,
    y: sensor.y,
    state: sensor.state,
    alertVisible,
  };
}

function mapRooms(
  site: SecuritySiteV1,
  sensors: SecurityFloorViewSensorV1[]
): SecurityFloorViewRoomV1[] {
  const alertRooms = new Set(
    sensors
      .filter((s) => s.alertVisible)
      .map((s) => s.roomId)
  );
  return site.rooms.map((room) => ({
    id: room.id,
    floorId: room.floorId,
    label: room.label,
    x: room.x,
    y: room.y,
    w: room.w,
    h: room.h,
    alertVisible: alertRooms.has(room.id),
  }));
}

export function buildSecurityFloorCustomerDashboardV1(
  siteId: string | null | undefined
): SecurityFloorCustomerDashboardV1 {
  const site = findSecuritySiteV1(siteId);
  const sensors = site.sensors.map((s) =>
    mapSensor(site, s, true)
  );
  const hasAlert = securitySiteHasAlertV1(site);
  return {
    siteId: site.id,
    displayName: site.displayName,
    addressLabel: site.addressLabel,
    countryCode: site.countryCode,
    currency: site.currency,
    status: hasAlert ? "alert" : "normal",
    statusEmoji: hasAlert ? "🔴" : "🟢",
    statusLabel: hasAlert
      ? "異常があります"
      : "正常に動いています",
    guardMode: site.guardMode,
    guardModeLabel: guardModeLabelJaV1(site.guardMode),
    floors: site.floors.map((f) => ({ ...f })),
    rooms: mapRooms(site, sensors),
    sensors,
    notes: [...site.notes],
    lastUpdatedAt: new Date().toISOString(),
  };
}

function toOperatorRow(
  site: SecuritySiteV1
): SecurityFloorOperatorSiteRowV1 {
  const sensors = site.sensors.map((s) =>
    mapSensor(site, s, false)
  );
  return {
    siteId: site.id,
    displayName: site.displayName,
    addressLabel: site.addressLabel,
    tenantId: site.tenantId,
    countryCode: site.countryCode,
    currency: site.currency,
    planCode: site.planCode,
    planStatus: site.planStatus,
    monthlyFee: site.monthlyFee,
    guardMode: site.guardMode,
    guardModeLabel: guardModeLabelJaV1(site.guardMode),
    hasAlert: securitySiteHasAlertV1(site),
    floors: site.floors.map((f) => ({ ...f })),
    rooms: mapRooms(site, sensors),
    sensors,
    notes: [...site.notes],
  };
}

export function buildSecurityFloorOperatorDashboardV1(): SecurityFloorOperatorDashboardV1 {
  const sites = listSecuritySitesV1()
    .map(toOperatorRow)
    .sort((a, b) => Number(b.hasAlert) - Number(a.hasAlert));
  return {
    generatedAt: new Date().toISOString(),
    totalSites: sites.length,
    alertCount: sites.filter((s) => s.hasAlert).length,
    sites,
  };
}

export function buildSecurityFloorOperatorSiteV1(
  siteId: string | null | undefined
): SecurityFloorOperatorSiteRowV1 {
  return toOperatorRow(findSecuritySiteV1(siteId));
}
