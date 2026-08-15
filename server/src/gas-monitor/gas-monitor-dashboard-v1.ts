/**
 * ガス見守りダッシュボード組み立て
 * 顧客向け / 事業者向け
 * 建物グループ化 · Life Care 追記
 */

import {
  buildLifeCareOverlayV1,
  isLifeCareAlertV1,
  type GasLifeCareOverlayV1,
  type GasLifeCareStatusV1,
} from "./gas-monitor-life-care-v1.js";
import {
  cylinderPercentV1,
  needsDeliveryV1,
  type GasPropertyV1,
} from "./gas-monitor-sites-v1.js";
import {
  getPropertyGasLiveSnapshotV1,
  listPropertyPortMappingsV1,
  type DeviceMappedPortLiveV1,
} from "../device/device-port-config-v1.js";
import { getPropertyByIdV1 } from "../shared/customer/customer-property-master-v1.js";

export interface GasCustomerDashboardV1 {
  propertyId: string;
  displayName: string;
  addressLabel: string;
  countryCode: string;
  currency: string;
  tenantId: string;
  /** 正常稼働中 / 緊急遮断 */
  status: "normal" | "emergency";
  statusEmoji: string;
  statusLabel: string;
  todayUsageM3: number;
  currentMeterValue: number | null;
  hourlyUsageM3: number[];
  lifeWatchNotes: string[];
  lastUpdatedAt: string;
  /** Life Care（見守り）追記 */
  lifeCare: GasLifeCareOverlayV1;
  buildingId: string | null;
  buildingName: string | null;
  mappedPorts: DeviceMappedPortLiveV1[];
}

export interface GasOperatorPropertyRowV1 {
  propertyId: string;
  displayName: string;
  addressLabel: string;
  kind: string;
  tenantId: string;
  countryCode: string;
  currency: string;
  meterPulseTotal: number;
  todayUsageM3: number;
  currentMeterValue: number | null;
  emergencyShutoff: boolean;
  needsDelivery: boolean;
  autoSwitchDetected: boolean;
  cylinders: Array<{
    index: 1 | 2;
    capacityKg: number;
    remainingKg: number;
    percent: number;
    active: boolean;
  }>;
  lifeWatchNotes: string[];
  /** Life Care 追記 */
  lifeCareStatus: GasLifeCareStatusV1;
  lifeCareEmoji: string;
  lifeCareLabel: string;
  lifeCareAlertLevel: "none" | "warn" | "critical";
  mmWaveDetected: boolean;
  mmWaveZone: string;
  mmWaveDwellMinutes: number;
  buildingId: string | null;
  roomLabel: string;
}

export interface GasBuildingGroupV1 {
  buildingId: string;
  buildingName: string;
  addressLabel: string;
  kind: string;
  countryCode: string;
  currency: string;
  tenantId: string;
  totalRooms: number;
  deliveryAlertCount: number;
  emergencyCount: number;
  lifeCareAlertCount: number;
  /** 親カードを開いた状態で優先表示するか */
  hasPriorityAlert: boolean;
  rooms: GasOperatorPropertyRowV1[];
}

export interface GasOperatorDashboardV1 {
  generatedAt: string;
  totalProperties: number;
  deliveryAlertCount: number;
  emergencyCount: number;
  /** Life Care 警報件数（黄・赤・地震） */
  lifeCareAlertCount: number;
  /** 要配送を先頭にソート（フラット互換） */
  properties: GasOperatorPropertyRowV1[];
  /** 建物グループ（アパート等） */
  buildings: GasBuildingGroupV1[];
  mappedDevices: Array<{
    propertyId: string;
    deviceId: string;
    ports: DeviceMappedPortLiveV1[];
  }>;
}

function roomLabelFromDisplayName(displayName: string): string {
  const m = displayName.match(
    /(\d{2,4}号室|\d+[A-Za-z]|Unit\s*\d+|Apt\s*\d+)/i
  );
  if (m) return m[1];
  return displayName;
}

function buildRegisteredGasPropertyV1(
  propertyId: string
): GasPropertyV1 {
  const property = getPropertyByIdV1(propertyId);
  const customerCode = property?.customerCode ?? "TOMS001";
  return {
    id: propertyId,
    tenantId: `tenant_${customerCode.toLowerCase()}`,
    countryCode: "JP",
    currency: "JPY",
    kind: "detached",
    displayName: property?.propertyName ?? "登録済み物件",
    addressLabel: property?.address || "所在地未登録",
    meterPulseTotal: 0,
    todayUsageM3: 0,
    emergencyShutoff: false,
    cylinders: [],
    lifeWatchNotes: [],
    hourlyUsageM3: Array.from({ length: 24 }, () => 0),
  };
}

function listRegisteredGasPropertiesV1(): GasPropertyV1[] {
  const propertyIds = new Set<string>();
  for (const mapping of listPropertyPortMappingsV1()) {
    propertyIds.add(mapping.propertyId);
  }
  return [...propertyIds].map(buildRegisteredGasPropertyV1);
}

function buildCustomerFromProperty(
  p: GasPropertyV1,
  requestedPropertyId = p.id
): GasCustomerDashboardV1 {
  const live = getPropertyGasLiveSnapshotV1(requestedPropertyId);
  const hasLiveReading = Boolean(live.lastUpdatedAt);
  const emergency = hasLiveReading
    ? live.emergencyActive
    : p.emergencyShutoff;
  const lifeCare = buildLifeCareOverlayV1(
    requestedPropertyId,
    emergency
  );
  return {
    propertyId: requestedPropertyId,
    displayName: p.displayName,
    addressLabel: p.addressLabel,
    countryCode: p.countryCode,
    currency: p.currency,
    tenantId: p.tenantId,
    status: emergency ? "emergency" : "normal",
    statusEmoji: emergency ? "🔴" : "🟢",
    statusLabel: emergency ? "緊急遮断" : "正常稼働中",
    todayUsageM3: live.todayUsageM3 ?? p.todayUsageM3,
    currentMeterValue: live.currentMeterValue,
    hourlyUsageM3: [...p.hourlyUsageM3],
    lifeWatchNotes: [...p.lifeWatchNotes],
    lastUpdatedAt: live.lastUpdatedAt ?? new Date().toISOString(),
    lifeCare,
    buildingId: null,
    buildingName: null,
    mappedPorts: live.ports,
  };
}

function buildOperatorRow(p: GasPropertyV1): GasOperatorPropertyRowV1 {
  const live = getPropertyGasLiveSnapshotV1(p.id);
  const hasLiveReading = Boolean(live.lastUpdatedAt);
  const emergencyShutoff = hasLiveReading
    ? live.emergencyActive
    : p.emergencyShutoff;
  const autoSwitchDetected = p.lifeWatchNotes.some((n) =>
    n.includes("自動切替")
  );
  const lifeCare = buildLifeCareOverlayV1(
    p.id,
    emergencyShutoff
  );
  return {
    propertyId: p.id,
    displayName: p.displayName,
    addressLabel: p.addressLabel,
    kind: p.kind,
    tenantId: p.tenantId,
    countryCode: p.countryCode,
    currency: p.currency,
    meterPulseTotal: live.meterPulseTotal ?? p.meterPulseTotal,
    todayUsageM3: live.todayUsageM3 ?? p.todayUsageM3,
    currentMeterValue: live.currentMeterValue,
    emergencyShutoff,
    needsDelivery: needsDeliveryV1(p),
    autoSwitchDetected,
    cylinders: p.cylinders.map((c) => ({
      index: c.index,
      capacityKg: c.capacityKg,
      remainingKg: c.remainingKg,
      percent: cylinderPercentV1(c),
      active: c.active,
    })),
    lifeWatchNotes: [...p.lifeWatchNotes],
    lifeCareStatus: lifeCare.status,
    lifeCareEmoji: lifeCare.statusEmoji,
    lifeCareLabel: lifeCare.statusLabel,
    lifeCareAlertLevel: lifeCare.alertLevel,
    mmWaveDetected: lifeCare.mmWave.detected,
    mmWaveZone: lifeCare.mmWave.zone,
    mmWaveDwellMinutes: lifeCare.mmWave.dwellMinutes,
    buildingId: null,
    roomLabel: roomLabelFromDisplayName(p.displayName),
  };
}

function sortRooms(
  a: GasOperatorPropertyRowV1,
  b: GasOperatorPropertyRowV1
): number {
  if (a.emergencyShutoff !== b.emergencyShutoff) {
    return a.emergencyShutoff ? -1 : 1;
  }
  const aCrit = a.lifeCareAlertLevel === "critical";
  const bCrit = b.lifeCareAlertLevel === "critical";
  if (aCrit !== bCrit) return aCrit ? -1 : 1;
  const aWarn = a.lifeCareAlertLevel === "warn";
  const bWarn = b.lifeCareAlertLevel === "warn";
  if (aWarn !== bWarn) return aWarn ? -1 : 1;
  if (a.needsDelivery !== b.needsDelivery) {
    return a.needsDelivery ? -1 : 1;
  }
  return a.displayName.localeCompare(b.displayName, "ja");
}

/** お客様向けカード用データ */
export function buildGasCustomerDashboardV1(
  propertyId?: string | null
): GasCustomerDashboardV1 | null {
  const registered = listRegisteredGasPropertiesV1();
  const selected = propertyId
    ? registered.find((item) => item.id === propertyId)
    : registered[0];
  if (!selected) return null;
  return buildCustomerFromProperty(selected);
}

/**
 * 事業者ダッシュボード
 * 要配送・緊急を先頭ソート + 建物グループ
 */
export function buildGasOperatorDashboardV1(): GasOperatorDashboardV1 {
  const rows = listRegisteredGasPropertiesV1().map(buildOperatorRow);
  rows.sort(sortRooms);

  const buildings = rows.map((r) => ({
      buildingId: `BLD-ORPHAN-${r.propertyId}`,
      buildingName: r.displayName,
      addressLabel: r.addressLabel,
      kind: r.kind,
      countryCode: r.countryCode,
      currency: r.currency,
      tenantId: r.tenantId,
      totalRooms: 1,
      deliveryAlertCount: r.needsDelivery ? 1 : 0,
      emergencyCount: r.emergencyShutoff ? 1 : 0,
      lifeCareAlertCount: isLifeCareAlertV1(r.lifeCareStatus)
        ? 1
        : 0,
      hasPriorityAlert:
        r.emergencyShutoff ||
        isLifeCareAlertV1(r.lifeCareStatus) ||
        r.needsDelivery,
      rooms: [r],
    }));

  return {
    generatedAt: new Date().toISOString(),
    totalProperties: rows.length,
    deliveryAlertCount: rows.filter((r) => r.needsDelivery).length,
    emergencyCount: rows.filter((r) => r.emergencyShutoff).length,
    lifeCareAlertCount: rows.filter((r) =>
      isLifeCareAlertV1(r.lifeCareStatus)
    ).length,
    properties: rows,
    buildings,
    mappedDevices: listPropertyPortMappingsV1().map(
      ({ propertyId, deviceId }) => ({
        propertyId,
        deviceId,
        ports: getPropertyGasLiveSnapshotV1(propertyId).ports.filter(
          (port) => port.deviceId === deviceId
        ),
      })
    ),
  };
}
