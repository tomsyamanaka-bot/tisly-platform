/**
 * ガス見守りダッシュボード組み立て
 * 顧客向け / 事業者向け
 */

import {
  cylinderPercentV1,
  findGasPropertyV1,
  GAS_MONITOR_DEFAULT_PROPERTY_ID_V1,
  listGasPropertiesV1,
  needsDeliveryV1,
  type GasPropertyV1,
} from "./gas-monitor-sites-v1.js";

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
  hourlyUsageM3: number[];
  lifeWatchNotes: string[];
  lastUpdatedAt: string;
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
}

export interface GasOperatorDashboardV1 {
  generatedAt: string;
  totalProperties: number;
  deliveryAlertCount: number;
  emergencyCount: number;
  /** 要配送を先頭にソート */
  properties: GasOperatorPropertyRowV1[];
}

function buildCustomerFromProperty(
  p: GasPropertyV1
): GasCustomerDashboardV1 {
  const emergency = p.emergencyShutoff;
  return {
    propertyId: p.id,
    displayName: p.displayName,
    addressLabel: p.addressLabel,
    countryCode: p.countryCode,
    currency: p.currency,
    tenantId: p.tenantId,
    status: emergency ? "emergency" : "normal",
    statusEmoji: emergency ? "🔴" : "🟢",
    statusLabel: emergency ? "緊急遮断" : "正常稼働中",
    todayUsageM3: p.todayUsageM3,
    hourlyUsageM3: [...p.hourlyUsageM3],
    lifeWatchNotes: [...p.lifeWatchNotes],
    lastUpdatedAt: new Date().toISOString(),
  };
}

function buildOperatorRow(p: GasPropertyV1): GasOperatorPropertyRowV1 {
  const autoSwitchDetected = p.lifeWatchNotes.some((n) =>
    n.includes("自動切替")
  );
  return {
    propertyId: p.id,
    displayName: p.displayName,
    addressLabel: p.addressLabel,
    kind: p.kind,
    tenantId: p.tenantId,
    countryCode: p.countryCode,
    currency: p.currency,
    meterPulseTotal: p.meterPulseTotal,
    todayUsageM3: p.todayUsageM3,
    emergencyShutoff: p.emergencyShutoff,
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
  };
}

/** お客様向けカード用データ */
export function buildGasCustomerDashboardV1(
  propertyId?: string | null
): GasCustomerDashboardV1 {
  const p = findGasPropertyV1(
    propertyId || GAS_MONITOR_DEFAULT_PROPERTY_ID_V1
  );
  return buildCustomerFromProperty(p);
}

/**
 * 事業者ダッシュボード
 * 要配送・緊急を先頭ソート
 */
export function buildGasOperatorDashboardV1(): GasOperatorDashboardV1 {
  const rows = listGasPropertiesV1().map(buildOperatorRow);
  rows.sort((a, b) => {
    if (a.emergencyShutoff !== b.emergencyShutoff) {
      return a.emergencyShutoff ? -1 : 1;
    }
    if (a.needsDelivery !== b.needsDelivery) {
      return a.needsDelivery ? -1 : 1;
    }
    return a.displayName.localeCompare(b.displayName, "ja");
  });
  return {
    generatedAt: new Date().toISOString(),
    totalProperties: rows.length,
    deliveryAlertCount: rows.filter((r) => r.needsDelivery).length,
    emergencyCount: rows.filter((r) => r.emergencyShutoff).length,
    properties: rows,
  };
}
