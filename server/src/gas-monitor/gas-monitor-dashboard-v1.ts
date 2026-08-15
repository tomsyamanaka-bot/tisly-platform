/**
 * ガス見守りダッシュボード組み立て
 * 顧客向け / 事業者向け
 * 建物グループ化 · Life Care 追記
 */

import {
  findBuildingForPropertyV1,
  listGasBuildingsV1,
  type GasBuildingDefV1,
} from "./gas-monitor-buildings-v1.js";
import {
  buildLifeCareOverlayV1,
  isLifeCareAlertV1,
  type GasLifeCareOverlayV1,
  type GasLifeCareStatusV1,
} from "./gas-monitor-life-care-v1.js";
import {
  cylinderPercentV1,
  findGasPropertyV1,
  GAS_MONITOR_DEFAULT_PROPERTY_ID_V1,
  listGasPropertiesV1,
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
  const building = findBuildingForPropertyV1(requestedPropertyId);
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
    buildingId: building?.buildingId ?? null,
    buildingName: building?.buildingName ?? null,
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
  const building = findBuildingForPropertyV1(p.id);
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
    buildingId: building?.buildingId ?? null,
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

function buildBuildingGroup(
  def: GasBuildingDefV1,
  byId: Map<string, GasOperatorPropertyRowV1>
): GasBuildingGroupV1 | null {
  const rooms = def.propertyIds
    .map((id) => byId.get(id))
    .filter((r): r is GasOperatorPropertyRowV1 => Boolean(r));
  if (!rooms.length) return null;
  rooms.sort(sortRooms);
  const deliveryAlertCount = rooms.filter(
    (r) => r.needsDelivery
  ).length;
  const emergencyCount = rooms.filter(
    (r) => r.emergencyShutoff
  ).length;
  const lifeCareAlertCount = rooms.filter((r) =>
    isLifeCareAlertV1(r.lifeCareStatus)
  ).length;
  return {
    buildingId: def.buildingId,
    buildingName: def.buildingName,
    addressLabel: def.addressLabel,
    kind: def.kind,
    countryCode: def.countryCode,
    currency: def.currency,
    tenantId: def.tenantId,
    totalRooms: rooms.length,
    deliveryAlertCount,
    emergencyCount,
    lifeCareAlertCount,
    hasPriorityAlert:
      emergencyCount > 0 ||
      lifeCareAlertCount > 0 ||
      deliveryAlertCount > 0,
    rooms,
  };
}

/** お客様向けカード用データ */
export function buildGasCustomerDashboardV1(
  propertyId?: string | null
): GasCustomerDashboardV1 {
  const requestedPropertyId =
    propertyId || GAS_MONITOR_DEFAULT_PROPERTY_ID_V1;
  const p = findGasPropertyV1(requestedPropertyId);
  const dashboard = buildCustomerFromProperty(p, requestedPropertyId);
  if (!propertyId) return dashboard;
  const mappedPorts = dashboard.mappedPorts;
  if (!mappedPorts.length) return dashboard;
  const property = getPropertyByIdV1(propertyId);
  return {
    ...dashboard,
    propertyId,
    displayName: property?.propertyName ?? dashboard.displayName,
    addressLabel: property?.address ?? dashboard.addressLabel,
    mappedPorts,
  };
}

/**
 * 事業者ダッシュボード
 * 要配送・緊急を先頭ソート + 建物グループ
 */
export function buildGasOperatorDashboardV1(): GasOperatorDashboardV1 {
  const rows = listGasPropertiesV1().map(buildOperatorRow);
  const knownPropertyIds = new Set(rows.map((row) => row.propertyId));
  for (const mapping of listPropertyPortMappingsV1()) {
    if (knownPropertyIds.has(mapping.propertyId)) continue;
    const base = findGasPropertyV1(
      GAS_MONITOR_DEFAULT_PROPERTY_ID_V1
    );
    const property = getPropertyByIdV1(mapping.propertyId);
    rows.push(
      buildOperatorRow({
        ...base,
        id: mapping.propertyId,
        displayName: property?.propertyName ?? "登録済み物件",
        addressLabel: property?.address ?? base.addressLabel,
        emergencyShutoff: false,
        meterPulseTotal: 0,
        todayUsageM3: 0,
        hourlyUsageM3: Array.from({ length: 24 }, () => 0),
        lifeWatchNotes: [],
      })
    );
    knownPropertyIds.add(mapping.propertyId);
  }
  rows.sort(sortRooms);

  const byId = new Map(
    rows.map((r) => [r.propertyId, r] as const)
  );
  const buildings = listGasBuildingsV1()
    .map((def) => buildBuildingGroup(def, byId))
    .filter((g): g is GasBuildingGroupV1 => Boolean(g));

  buildings.sort((a, b) => {
    if (a.emergencyCount !== b.emergencyCount) {
      return b.emergencyCount - a.emergencyCount;
    }
    if (a.lifeCareAlertCount !== b.lifeCareAlertCount) {
      return b.lifeCareAlertCount - a.lifeCareAlertCount;
    }
    if (a.deliveryAlertCount !== b.deliveryAlertCount) {
      return b.deliveryAlertCount - a.deliveryAlertCount;
    }
    return a.buildingName.localeCompare(b.buildingName, "ja");
  });

  // 建物未所属があれば単独グループとして末尾追記
  const assigned = new Set(
    buildings.flatMap((b) => b.rooms.map((r) => r.propertyId))
  );
  const orphans = rows.filter((r) => !assigned.has(r.propertyId));
  for (const r of orphans) {
    buildings.push({
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
    });
  }

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
