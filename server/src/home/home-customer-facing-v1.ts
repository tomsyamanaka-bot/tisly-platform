/**
 * TiSLY HOME — お客様向け表示サニタイズ v1
 *
 * 社内管理用の契約・配線・デバイスID等を除外し、
 * 住まいの画面に分かりやすい文言だけを返す。
 */

import {
  buildHomeSiteDashboardV1,
  resolveHomeStatusV1,
  type HomeSiteDashboardV1,
} from "./home-dashboard-v1.js";
import {
  findHomeSiteV1,
  listHomeSitesV1,
  type HomeSiteV1,
} from "./home-sites-v1.js";

/** お客様向け — 物件選択（シンプル） */
export interface HomeCustomerSiteOptionV1 {
  id: string;
  displayName: string;
  statusEmoji: string;
  statusLabel: string;
}

export interface HomeCustomerFacingLockLogV1 {
  id: string;
  credentialLabel: string;
  holderLabel: string;
  actionLabel: string;
  occurredAt: string;
}

export interface HomeCustomerFacingDashboardV1 {
  siteId: string;
  displayName: string;
  addressLabel: string;
  status: HomeSiteDashboardV1["status"];
  statusEmoji: string;
  statusLabel: string;
  ct: Omit<HomeSiteDashboardV1["ct"], "circuits"> & {
    circuits: Array<{
      id: string;
      label: string;
      on: boolean;
      statusLabel: string;
    }>;
  };
  bath: {
    label: string;
    setTempC: number;
    currentTempC: number;
    fillState: string;
    fillStateLabel: string;
    fillPercent: number;
    autoFill: boolean;
    reheating: boolean;
    keepWarm: boolean;
    uiProfile: string;
    lastPulseMessage: string | null;
    linkStateLabel: string;
  };
  aircons: Array<Omit<HomeSiteDashboardV1["aircons"][number], "powerW">>;
  lock: Omit<HomeSiteDashboardV1["lock"], "accessLog" | "lockLabel" | "lastAccessLabel"> & {
    lockLabel: string;
    lastAccessLabel: string;
    accessLog: HomeCustomerFacingLockLogV1[];
  };
  intercom: Omit<
    HomeSiteDashboardV1["intercom"],
    "streamKind" | "streamKindLabel" | "streamUrl"
  >;
  activeAirconCount: number;
  intercomRinging: boolean;
  updatedAt: string;
}

const CUSTOMER_CREDENTIAL_V1: Record<string, string> = {
  nfc: "カード",
  rfid: "カード",
  pin: "暗証番号",
  app: "アプリ",
  key: "カギ",
};

const INTERNAL_HOLDER_RE =
  /TOMS|保守|オペレーター|社内|operator|admin|テスト|mock/i;

function customerCredentialLabel(type: string): string {
  return CUSTOMER_CREDENTIAL_V1[type] ?? "カード";
}

function isInternalHolder(name: string): boolean {
  return INTERNAL_HOLDER_RE.test(String(name ?? ""));
}

function customerHolderLabel(name: string): string {
  const n = String(name ?? "").trim();
  if (!n || isInternalHolder(n)) return "";
  return n;
}

function customerLockLabel(locked: boolean): string {
  return locked ? "施錠済み" : "解錠中";
}

function customerStatusLabel(site: HomeSiteV1): string {
  const status = resolveHomeStatusV1(site);
  if (status === "security_alert") return "確認が必要";
  if (status === "peak_warning") return "電気の使いすぎに注意";
  return "正常";
}

/** お客様向け物件一覧 */
export function buildHomeCustomerSiteOptionsV1(): HomeCustomerSiteOptionV1[] {
  return listHomeSitesV1().map((site) => {
    const dash = buildHomeSiteDashboardV1(site);
    return {
      id: site.id,
      displayName: site.displayName,
      statusEmoji: dash.statusEmoji,
      statusLabel: customerStatusLabel(site),
    };
  });
}

/** フルダッシュボード → お客様向け */
export function sanitizeHomeCustomerDashboardV1(
  dashboard: HomeSiteDashboardV1
): HomeCustomerFacingDashboardV1 {
  const lock = dashboard.lock;
  const lastCred = lock.accessLog[0]
    ? customerCredentialLabel(lock.accessLog[0].credentialType)
    : null;
  const lastAccessLabel = lastCred
    ? `直近の操作: ${lastCred}`
    : "直近の操作: なし";

  const { intercom } = dashboard;

  return {
    siteId: dashboard.siteId,
    displayName: dashboard.displayName,
    addressLabel: dashboard.addressLabel,
    status: dashboard.status,
    statusEmoji: dashboard.statusEmoji,
    statusLabel: customerStatusLabel(findHomeSiteV1(dashboard.siteId)),
    ct: {
      label: dashboard.ct.label,
      mainCurrentA: dashboard.ct.mainCurrentA,
      mainCapacityA: dashboard.ct.mainCapacityA,
      loadPercent: dashboard.ct.loadPercent,
      powerW: dashboard.ct.powerW,
      powerKw: dashboard.ct.powerKw,
      contractDemandKw: dashboard.ct.contractDemandKw,
      demandPercent: dashboard.ct.demandPercent,
      level: dashboard.ct.level,
      levelLabel: dashboard.ct.levelLabel,
      warnThresholdA: dashboard.ct.warnThresholdA,
      alertThresholdA: dashboard.ct.alertThresholdA,
      peakCutActive: dashboard.ct.peakCutActive,
      solarGenerationW: dashboard.ct.solarGenerationW,
      hasSolar: dashboard.ct.hasSolar,
      hourlyCurrentA: dashboard.ct.hourlyCurrentA,
      circuits: dashboard.ct.circuits.map((c) => ({
        id: c.id,
        label: c.label,
        on: c.on,
        statusLabel: c.statusLabel,
      })),
    },
    bath: {
      label: dashboard.bath.label,
      setTempC: dashboard.bath.setTempC,
      currentTempC: dashboard.bath.currentTempC,
      fillState: dashboard.bath.fillState,
      fillStateLabel: dashboard.bath.fillStateLabel,
      fillPercent: dashboard.bath.fillPercent,
      autoFill: dashboard.bath.autoFill,
      reheating: dashboard.bath.reheating,
      keepWarm: dashboard.bath.keepWarm,
      uiProfile: dashboard.bath.uiProfile,
      lastPulseMessage: dashboard.bath.lastPulseMessage,
      linkStateLabel: dashboard.bath.linkStateLabel,
    },
    aircons: dashboard.aircons.map(({ powerW: _pw, ...rest }) => rest),
    lock: {
      label: lock.label,
      locked: lock.locked,
      lockEmoji: lock.lockEmoji,
      doorOpen: lock.doorOpen,
      doorLabel: lock.doorLabel,
      batteryPercent: lock.batteryPercent,
      lockLabel: customerLockLabel(lock.locked),
      lastAccessLabel,
      accessLog: lock.accessLog.map((e) => {
        const holder = customerHolderLabel(e.holderName);
        return {
          id: e.id,
          credentialLabel: customerCredentialLabel(e.credentialType),
          holderLabel: holder,
          actionLabel: e.actionLabel,
          occurredAt: e.occurredAt,
        };
      }),
    },
    intercom: {
      label: intercom.label,
      state: intercom.state,
      stateLabel: intercom.stateLabel,
      stateEmoji: intercom.stateEmoji,
      ringing: intercom.ringing,
      lastVisitLabel: intercom.lastVisitLabel,
      snapshotUrl: intercom.snapshotUrl,
      hasLiveStream: intercom.hasLiveStream,
      autoResponseMessage: intercom.autoResponseMessage,
      unlockLinkEnabled: intercom.unlockLinkEnabled,
      visitors: intercom.visitors,
    },
    activeAirconCount: dashboard.activeAirconCount,
    intercomRinging: dashboard.intercomRinging,
    updatedAt: dashboard.updatedAt,
  };
}

/** お客様（住まい）向け — サニタイズ済み */
export function buildHomeCustomerFacingDashboardV1(
  siteId?: string | null
): HomeCustomerFacingDashboardV1 {
  return sanitizeHomeCustomerDashboardV1(
    buildHomeSiteDashboardV1(findHomeSiteV1(siteId))
  );
}
