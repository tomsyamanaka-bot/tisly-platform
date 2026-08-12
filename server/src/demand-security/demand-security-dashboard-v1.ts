/**
 * 電気デマンド＆セキュリティ
 * 顧客向け / 社内向けダッシュボード
 */

import {
  DEMAND_SECURITY_DEFAULT_SITE_ID_V1,
  demandUsagePercentV1,
  findDemandSiteV1,
  listDemandSitesV1,
  securityNeedsAttentionV1,
  type DemandSiteV1,
} from "./demand-security-sites-v1.js";

export interface DemandCustomerDashboardV1 {
  siteId: string;
  displayName: string;
  addressLabel: string;
  countryCode: string;
  currency: string;
  tenantId: string;
  /** 総合ステータス */
  status: "normal" | "peak_cut" | "security_alert";
  statusEmoji: string;
  statusLabel: string;
  mainCurrentA: number;
  currentDemandKw: number;
  contractDemandKw: number;
  demandUsagePercent: number;
  peakCutActive: boolean;
  peakCutLabel: string;
  doorLabel: string;
  motionLabel: string;
  hourlyCurrentA: number[];
  notes: string[];
  lastUpdatedAt: string;
}

export interface DemandOperatorSiteRowV1 {
  siteId: string;
  displayName: string;
  addressLabel: string;
  kind: string;
  tenantId: string;
  countryCode: string;
  currency: string;
  mainCurrentA: number;
  currentDemandKw: number;
  contractDemandKw: number;
  demandUsagePercent: number;
  peakCutActive: boolean;
  securityAttention: boolean;
  doorState: string;
  motionState: string;
  relays: Array<{
    id: string;
    label: string;
    voltage: 100 | 200;
    on: boolean;
    peakCutEnabled: boolean;
  }>;
  notes: string[];
}

export interface DemandOperatorDashboardV1 {
  generatedAt: string;
  totalSites: number;
  peakCutCount: number;
  securityAlertCount: number;
  sites: DemandOperatorSiteRowV1[];
}

function doorLabelJa(state: DemandSiteV1["doorState"]): string {
  if (state === "locked") return "施錠中";
  if (state === "unlocked") return "解錠中";
  return "開いています";
}

function motionLabelJa(state: DemandSiteV1["motionState"]): string {
  if (state === "detected") return "人感あり";
  return "人感なし";
}

function buildCustomerFromSite(
  s: DemandSiteV1
): DemandCustomerDashboardV1 {
  const security = securityNeedsAttentionV1(s);
  let status: DemandCustomerDashboardV1["status"] = "normal";
  let statusEmoji = "🟢";
  let statusLabel = "正常です";
  if (security) {
    status = "security_alert";
    statusEmoji = "🔴";
    statusLabel = "防犯の確認が必要です";
  } else if (s.peakCutActive) {
    status = "peak_cut";
    statusEmoji = "🟡";
    statusLabel = "電気のピークを抑えています";
  }
  return {
    siteId: s.id,
    displayName: s.displayName,
    addressLabel: s.addressLabel,
    countryCode: s.countryCode,
    currency: s.currency,
    tenantId: s.tenantId,
    status,
    statusEmoji,
    statusLabel,
    mainCurrentA: s.mainCurrentA,
    currentDemandKw: s.currentDemandKw,
    contractDemandKw: s.contractDemandKw,
    demandUsagePercent: demandUsagePercentV1(s),
    peakCutActive: s.peakCutActive,
    peakCutLabel: s.peakCutActive
      ? "自動セーブ作動中"
      : "自動セーブ待機",
    doorLabel: doorLabelJa(s.doorState),
    motionLabel: motionLabelJa(s.motionState),
    hourlyCurrentA: [...s.hourlyCurrentA],
    notes: [...s.notes],
    lastUpdatedAt: new Date().toISOString(),
  };
}

function buildOperatorRow(s: DemandSiteV1): DemandOperatorSiteRowV1 {
  return {
    siteId: s.id,
    displayName: s.displayName,
    addressLabel: s.addressLabel,
    kind: s.kind,
    tenantId: s.tenantId,
    countryCode: s.countryCode,
    currency: s.currency,
    mainCurrentA: s.mainCurrentA,
    currentDemandKw: s.currentDemandKw,
    contractDemandKw: s.contractDemandKw,
    demandUsagePercent: demandUsagePercentV1(s),
    peakCutActive: s.peakCutActive,
    securityAttention: securityNeedsAttentionV1(s),
    doorState: s.doorState,
    motionState: s.motionState,
    relays: s.relays.map((r) => ({
      id: r.id,
      label: r.label,
      voltage: r.voltage,
      on: r.on,
      peakCutEnabled: r.peakCutEnabled,
    })),
    notes: [...s.notes],
  };
}

/** お客様向けカード用 */
export function buildDemandCustomerDashboardV1(
  siteId?: string | null
): DemandCustomerDashboardV1 {
  const s = findDemandSiteV1(
    siteId || DEMAND_SECURITY_DEFAULT_SITE_ID_V1
  );
  return buildCustomerFromSite(s);
}

/**
 * 社内ダッシュボード
 * 防犯警報・ピークカットを先頭
 */
export function buildDemandOperatorDashboardV1(): DemandOperatorDashboardV1 {
  const rows = listDemandSitesV1().map(buildOperatorRow);
  rows.sort((a, b) => {
    if (a.securityAttention !== b.securityAttention) {
      return a.securityAttention ? -1 : 1;
    }
    if (a.peakCutActive !== b.peakCutActive) {
      return a.peakCutActive ? -1 : 1;
    }
    return a.displayName.localeCompare(b.displayName, "ja");
  });
  return {
    generatedAt: new Date().toISOString(),
    totalSites: rows.length,
    peakCutCount: rows.filter((r) => r.peakCutActive).length,
    securityAlertCount: rows.filter((r) => r.securityAttention)
      .length,
    sites: rows,
  };
}
