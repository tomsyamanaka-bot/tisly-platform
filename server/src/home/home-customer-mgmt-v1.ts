/**
 * TiSLY HOME — 社内「顧客を見る」管理ビュー v1
 *
 * TiSLY HOME（RP・IoT）契約物件のみを独立リスト表示。
 * 見積・請求・Customer Portal からの自動引用は行わない。
 */

import {
  buildHomeSiteDashboardV1,
  resolveHomeStatusV1,
} from "./home-dashboard-v1.js";
import { findHomeSiteV1 } from "./home-sites-v1.js";
import {
  listHomeSiteRegistryV1,
  hydrateRuntimeHomeSitesFromDbV1,
  type HomeSiteRegistryRowV1,
} from "./home-customer-registry-v1.js";
import {
  ensureHomeSeedV1,
  listHomeControlLogsV1,
  listHomeIntercomEventsV1,
} from "./home-store-v1.js";
import { buildSwitchBotHomeStatusV1 } from "./switchbot_client.js";

const PLAN_LABEL_V1: Record<string, string> = {
  home_basic: "ベーシック",
  home_standard: "スタンダード",
};

const PLAN_STATUS_LABEL_V1: Record<string, string> = {
  active: "請求中（稼働）",
  trial: "試用期間",
  suspended: "請求停止",
};

const SOURCE_LABEL_V1: Record<string, string> = {
  manual: "手動登録",
  device_binding: "デバイス紐付け",
};

function formatPlanFee(row: HomeSiteRegistryRowV1): string {
  const label = PLAN_LABEL_V1[row.planCode] ?? row.planCode;
  const fee =
    row.currency === "JPY"
      ? `${row.monthlyFee.toLocaleString("ja-JP")}円`
      : `${row.monthlyFee} ${row.currency}`;
  return `${label}（${fee}/月）`;
}

function billingStatusLabel(planStatus: string): string {
  return PLAN_STATUS_LABEL_V1[planStatus] ?? planStatus;
}

function buildSiteMgmtFromRegistry(row: HomeSiteRegistryRowV1) {
  ensureHomeSeedV1();
  hydrateRuntimeHomeSitesFromDbV1();
  const site = findHomeSiteV1(row.siteId);
  const dash = buildHomeSiteDashboardV1(site);
  const status = resolveHomeStatusV1(site);
  const controlLogs = listHomeControlLogsV1(row.siteId, 8);
  const intercomEvents = listHomeIntercomEventsV1(row.siteId, 6);

  const alertSummary: string[] = [];
  if (status === "security_alert") {
    alertSummary.push(`玄関 ${dash.lock.lockLabel}`);
  }
  if (dash.ct.level !== "normal") {
    alertSummary.push(
      `主幹CT ${dash.ct.levelLabel}（${dash.ct.mainCurrentA.toFixed(1)}A）`
    );
  }
  if (dash.intercom.ringing) {
    alertSummary.push("インターホン呼出中");
  }

  return {
    siteId: row.siteId,
    displayName: row.displayName,
    addressLabel: row.addressLabel,
    customerCode: row.customerCode,
    planCode: row.planCode,
    planLabel: PLAN_LABEL_V1[row.planCode] ?? row.planCode,
    planStatus: row.planStatus,
    billingStatus: billingStatusLabel(row.planStatus),
    monthlyFeeLabel: formatPlanFee(row),
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    registrationSource: row.registrationSource,
    registrationSourceLabel:
      SOURCE_LABEL_V1[row.registrationSource] ?? row.registrationSource,
    linkedDeviceId: row.deviceId,
    status,
    statusLabel:
      status === "security_alert"
        ? "要確認"
        : status === "peak_warning"
          ? "過負荷注意"
          : "正常",
    recentAlerts: alertSummary,
    controlLogs: controlLogs.slice(0, 4).map((l) => ({
      occurredAt: l.createdAt,
      deviceKind: l.deviceKind,
      action: l.action,
      actor: l.actor,
    })),
    intercomEvents: intercomEvents.slice(0, 3).map((e) => ({
      occurredAt: e.occurredAt,
      visitorLabel: e.visitorLabel,
      handledAs: e.handledAs,
    })),
    updatedAt: row.updatedAt,
  };
}

export interface HomeCustomerMgmtViewV1 {
  updatedAt: string;
  switchbot: ReturnType<typeof buildSwitchBotHomeStatusV1>;
  /** TiSLY HOME 契約物件のみ（フラットリスト） */
  sites: ReturnType<typeof buildSiteMgmtFromRegistry>[];
  totalSites: number;
}

/** 社内「顧客を見る」一覧 — HOME 契約物件のみ */
export function buildHomeCustomerMgmtViewV1(): HomeCustomerMgmtViewV1 {
  ensureHomeSeedV1();
  hydrateRuntimeHomeSitesFromDbV1();
  const registry = listHomeSiteRegistryV1();
  const sites = registry.map(buildSiteMgmtFromRegistry);

  return {
    updatedAt: new Date().toISOString(),
    switchbot: buildSwitchBotHomeStatusV1(),
    sites,
    totalSites: sites.length,
  };
}
