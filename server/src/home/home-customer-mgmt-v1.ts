/**
 * TiSLY HOME — 社内「顧客を見る」管理ビュー v1
 *
 * 契約・施工・ハードウェア・ログを社内スタッフ向けに集約。
 */

import { listCustomerMastersV1 } from "../shared/customer/customer-master-v1.js";
import { listPropertiesForCustomerV1 } from "../shared/customer/customer-property-master-v1.js";
import {
  buildHomeSiteDashboardV1,
  resolveHomeStatusV1,
} from "./home-dashboard-v1.js";
import { listHomeSitesV1, type HomeSiteV1 } from "./home-sites-v1.js";
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

const CHANNEL_LABEL_V1: Record<string, string> = {
  rp2350_ct: "RP2350 CT入力",
  rp2350_relay: "RP2350 リレー",
  jema_ha: "JEMA / HA端子",
  ir_bridge: "赤外線ブリッジ（SwitchBot等）",
  nfc_lock: "NFC/RFID スマートロック",
  intercom_sip: "SIP/RTSP インターホン",
};

function formatPlanFee(site: HomeSiteV1): string {
  const label = PLAN_LABEL_V1[site.planCode] ?? site.planCode;
  const fee =
    site.currency === "JPY"
      ? `${site.monthlyFee.toLocaleString("ja-JP")}円`
      : `${site.monthlyFee} ${site.currency}`;
  return `${label}（${fee}/月）`;
}

function billingStatusLabel(planStatus: string): string {
  return PLAN_STATUS_LABEL_V1[planStatus] ?? planStatus;
}

function buildHardwareV1(site: HomeSiteV1) {
  const devices: Array<{
    kind: string;
    label: string;
    deviceKey: string;
    controlChannel: string;
    channelLabel: string;
    detail: string;
  }> = [];

  devices.push({
    kind: "ct_panel",
    label: site.ct.label,
    deviceKey: site.ct.deviceKey,
    controlChannel: site.ct.controlChannel,
    channelLabel: CHANNEL_LABEL_V1[site.ct.controlChannel] ?? site.ct.controlChannel,
    detail: `主幹 ${site.ct.mainCapacityA}A · ${site.voltageSpec}`,
  });

  devices.push({
    kind: "bath_remote",
    label: site.bath.label,
    deviceKey: site.bath.deviceKey,
    controlChannel: site.bath.controlChannel,
    channelLabel: CHANNEL_LABEL_V1[site.bath.controlChannel] ?? site.bath.controlChannel,
    detail: `${site.bath.jemaTerminal} · RP2350 ${site.bath.relayPort} · ${site.hotWaterSpec}`,
  });

  for (const ac of site.aircons) {
    devices.push({
      kind: "aircon",
      label: ac.label,
      deviceKey: ac.deviceKey,
      controlChannel: ac.controlChannel,
      channelLabel: CHANNEL_LABEL_V1[ac.controlChannel] ?? ac.controlChannel,
      detail: `消費 ${ac.powerW}W`,
    });
  }

  devices.push({
    kind: "smart_lock",
    label: site.lock.label,
    deviceKey: site.lock.deviceKey,
    controlChannel: site.lock.controlChannel,
    channelLabel: CHANNEL_LABEL_V1[site.lock.controlChannel] ?? site.lock.controlChannel,
    detail: `電池 ${site.lock.batteryPercent}%`,
  });

  devices.push({
    kind: "intercom",
    label: site.intercom.label,
    deviceKey: site.intercom.deviceKey,
    controlChannel: site.intercom.controlChannel,
    channelLabel:
      CHANNEL_LABEL_V1[site.intercom.controlChannel] ??
      site.intercom.controlChannel,
    detail: site.intercom.streamKind,
  });

  return {
    wiringSpec: site.voltageSpec,
    hotWaterSpec: site.hotWaterSpec,
    devices,
  };
}

function buildSiteMgmtV1(site: HomeSiteV1) {
  ensureHomeSeedV1();
  const dash = buildHomeSiteDashboardV1(site);
  const status = resolveHomeStatusV1(site);
  const controlLogs = listHomeControlLogsV1(site.id, 12);
  const intercomEvents = listHomeIntercomEventsV1(site.id, 8);

  const alertSummary: string[] = [];
  if (status === "security_alert") {
    alertSummary.push(`玄関 ${dash.lock.lockLabel} · ${dash.lock.doorLabel}`);
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
    siteId: site.id,
    displayName: site.displayName,
    addressLabel: site.addressLabel,
    customerCode: site.customerCode,
    countryCode: site.countryCode,
    currency: site.currency,
    tenantId: site.tenantId,
    status,
    statusLabel:
      status === "security_alert"
        ? "要確認"
        : status === "peak_warning"
          ? "過負荷注意"
          : "正常",
    planCode: site.planCode,
    planLabel: PLAN_LABEL_V1[site.planCode] ?? site.planCode,
    planStatus: site.planStatus,
    billingStatus: billingStatusLabel(site.planStatus),
    monthlyFee: site.monthlyFee,
    monthlyFeeLabel: formatPlanFee(site),
    hardware: buildHardwareV1(site),
    recentAlerts: alertSummary,
    controlLogs: controlLogs.map((l) => ({
      id: l.id,
      deviceKind: l.deviceKind,
      deviceKey: l.deviceKey,
      action: l.action,
      actor: l.actor,
      result: l.result,
      occurredAt: l.createdAt,
    })),
    accessLogs: site.lock.accessLog.slice(0, 8).map((e) => ({
      id: e.id,
      holderName: e.holderName,
      credentialType: e.credentialType,
      action: e.action,
      occurredAt: e.occurredAt,
    })),
    intercomEvents: intercomEvents.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      visitorLabel: e.visitorLabel,
      handledAs: e.handledAs,
      actor: e.actor,
      occurredAt: e.occurredAt,
    })),
    fieldNotes: [...site.notes],
  };
}

export interface HomeCustomerMgmtViewV1 {
  updatedAt: string;
  switchbot: ReturnType<typeof buildSwitchBotHomeStatusV1>;
  customers: Array<{
    customerCode: string;
    customerName: string;
    address: string;
    contactName: string;
    contactPhone: string;
    contactEmail: string;
    portalPlan: string;
    portalStatus: string;
    properties: ReturnType<typeof listPropertiesForCustomerV1>;
    homeSites: ReturnType<typeof buildSiteMgmtV1>[];
  }>;
  totalCustomers: number;
  totalHomeSites: number;
}

/** 社内「顧客を見る」一覧 */
export function buildHomeCustomerMgmtViewV1(): HomeCustomerMgmtViewV1 {
  ensureHomeSeedV1();
  const masters = listCustomerMastersV1(false);
  const allSites = listHomeSitesV1();
  const sitesByCode = new Map<string, HomeSiteV1[]>();
  for (const site of allSites) {
    const code = site.customerCode.toUpperCase();
    const list = sitesByCode.get(code) ?? [];
    list.push(site);
    sitesByCode.set(code, list);
  }

  const seenCodes = new Set<string>();
  const customers: HomeCustomerMgmtViewV1["customers"] = [];

  for (const master of masters) {
    const code = master.customerCode.toUpperCase();
    seenCodes.add(code);
    const sites = sitesByCode.get(code) ?? [];
    customers.push({
      customerCode: master.customerCode,
      customerName: master.customerName,
      address: master.address,
      contactName: master.contactName,
      contactPhone: master.contactPhone,
      contactEmail: master.contactEmail,
      portalPlan: master.plan,
      portalStatus: master.status,
      properties: listPropertiesForCustomerV1(code),
      homeSites: sites.map(buildSiteMgmtV1),
    });
  }

  // HOME 物件に紐づくが Customer Master 未登録のコード
  for (const [code, sites] of sitesByCode) {
    if (seenCodes.has(code)) continue;
    customers.push({
      customerCode: code,
      customerName: sites[0]?.displayName ?? code,
      address: sites[0]?.addressLabel ?? "",
      contactName: "",
      contactPhone: "",
      contactEmail: "",
      portalPlan: "—",
      portalStatus: "—",
      properties: listPropertiesForCustomerV1(code),
      homeSites: sites.map(buildSiteMgmtV1),
    });
  }

  customers.sort((a, b) =>
    a.customerName.localeCompare(b.customerName, "ja")
  );

  return {
    updatedAt: new Date().toISOString(),
    switchbot: buildSwitchBotHomeStatusV1(),
    customers,
    totalCustomers: customers.length,
    totalHomeSites: allSites.length,
  };
}
