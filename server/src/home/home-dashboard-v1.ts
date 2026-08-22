/**
 * TiSLY HOME — ダッシュボード組立 v1
 *
 * 社内（事業者）とお客様（住まい）の
 * 両方へ同じ4大デバイス状態を返す。
 * お客様向けは技術語を出さない。
 */

import {
  findHomeSiteV1,
  homeActiveAirconCountV1,
  homeCtLevelV1,
  homeIntercomRingingV1,
  homeLoadPercentV1,
  homePowerKwV1,
  homeSecurityAttentionV1,
  listHomeSitesV1,
  type HomeCtLevelV1,
  type HomeSiteV1,
} from "./home-sites-v1.js";
import {
  formatBathCountdownV1,
  getBathRemainingSecondsV1,
  hydrateHomeBathStateV1,
  syncBathEstimationForSiteV1,
} from "./home-bath-state-v1.js";

export type HomeOverallStatusV1 =
  | "normal"
  | "peak_warning"
  | "security_alert";

export interface HomeCtViewV1 {
  label: string;
  mainCurrentA: number;
  mainCapacityA: number;
  loadPercent: number;
  powerW: number;
  powerKw: number;
  contractDemandKw: number;
  demandPercent: number;
  level: HomeCtLevelV1;
  levelLabel: string;
  warnThresholdA: number;
  alertThresholdA: number;
  peakCutActive: boolean;
  solarGenerationW: number;
  hasSolar: boolean;
  circuits: Array<{
    id: string;
    label: string;
    voltage: number;
    currentA: number;
    on: boolean;
    peakCutTarget: boolean;
    statusLabel: string;
  }>;
  hourlyCurrentA: number[];
}

export interface HomeBathViewV1 {
  label: string;
  setTempC: number;
  currentTempC: number;
  fillState: string;
  fillStateLabel: string;
  fillPercent: number;
  autoFill: boolean;
  reheating: boolean;
  keepWarm: boolean;
  jemaTerminal: string;
  relayPort: string;
  relayChannel: number | null;
  pulseDurationMs: number | null;
  uiProfile: string;
  lastPulseMessage: string | null;
  fillStartedAt: string | null;
  fillEstimatedEndAt: string | null;
  remainingSeconds: number;
  countdownLabel: string | null;
  linkState: string;
  linkStateLabel: string;
}

export interface HomeAirconViewV1 {
  deviceKey: string;
  label: string;
  power: boolean;
  roomTempC: number;
  setTempC: number;
  mode: string;
  modeLabel: string;
  fan: string;
  fanLabel: string;
  swing: string;
  swingLabel: string;
  powerW: number;
  peakSaveActive: boolean;
}

export interface HomeLockViewV1 {
  label: string;
  locked: boolean;
  lockLabel: string;
  lockEmoji: string;
  doorOpen: boolean;
  doorLabel: string;
  batteryPercent: number;
  lastAccessLabel: string;
  accessLog: Array<{
    id: string;
    credentialType: string;
    credentialLabel: string;
    holderName: string;
    action: string;
    actionLabel: string;
    occurredAt: string;
  }>;
}

export interface HomeIntercomViewV1 {
  label: string;
  state: string;
  stateLabel: string;
  stateEmoji: string;
  ringing: boolean;
  /** 「直近来客 14:20」形式 */
  lastVisitLabel: string;
  streamKind: string;
  streamKindLabel: string;
  streamUrl: string;
  snapshotUrl: string;
  /** 実映像が来ているか（false はモック枠） */
  hasLiveStream: boolean;
  autoResponseMessage: string;
  unlockLinkEnabled: boolean;
  visitors: Array<{
    id: string;
    label: string;
    handledAs: string;
    handledLabel: string;
    occurredAt: string;
  }>;
}

export interface HomeSiteDashboardV1 {
  siteId: string;
  displayName: string;
  addressLabel: string;
  countryCode: string;
  currency: string;
  tenantId: string;
  voltageSpec: string;
  hotWaterSpec: string;
  planCode: string;
  planStatus: string;
  monthlyFee: number;
  operationMode: string;
  deviceBoardLabel: string | null;
  status: HomeOverallStatusV1;
  statusEmoji: string;
  statusLabel: string;
  ct: HomeCtViewV1;
  bath: HomeBathViewV1;
  aircons: HomeAirconViewV1[];
  lock: HomeLockViewV1;
  intercom: HomeIntercomViewV1;
  activeAirconCount: number;
  intercomRinging: boolean;
  notes: string[];
  updatedAt: string;
}

export interface HomeOperatorDashboardV1 {
  totalSites: number;
  overloadCount: number;
  securityAlertCount: number;
  bathRunningCount: number;
  airconRunningCount: number;
  intercomRingingCount: number;
  sites: HomeSiteDashboardV1[];
  updatedAt: string;
}

const CT_LEVEL_LABEL_V1: Record<HomeCtLevelV1, string> = {
  normal: "正常",
  warning: "過負荷警告",
  alert: "過負荷アラート",
};

const FILL_STATE_LABEL_V1: Record<string, string> = {
  idle: "停止中",
  filling: "湯はり中",
  done: "湯はり完了 / 待機中",
};

const LINK_STATE_LABEL_V1: Record<string, string> = {
  connected: "連携中",
  standby: "待機",
  offline: "未接続",
};

const AIRCON_MODE_LABEL_V1: Record<string, string> = {
  cool: "冷房",
  heat: "暖房",
  dry: "除湿",
  fan: "送風",
};

const AIRCON_FAN_LABEL_V1: Record<string, string> = {
  auto: "自動",
  low: "弱",
  mid: "中",
  high: "強",
};

const AIRCON_SWING_LABEL_V1: Record<string, string> = {
  auto: "自動",
  up: "上",
  middle: "中央",
  down: "下",
};

const INTERCOM_STATE_META_V1: Record<
  string,
  { label: string; emoji: string }
> = {
  idle: { label: "待機中", emoji: "🏠" },
  ringing: { label: "呼出中", emoji: "🔔" },
  talking: { label: "通話中", emoji: "📞" },
  auto_responded: { label: "自動応答済み", emoji: "🗣️" },
};

const INTERCOM_STREAM_LABEL_V1: Record<string, string> = {
  rtsp: "RTSP カメラ",
  webrtc: "WebRTC ライブ",
  mock: "カメラ未接続（デモ表示）",
};

const INTERCOM_HANDLED_LABEL_V1: Record<string, string> = {
  answered: "通話応答",
  auto: "自動応答",
  unlocked: "解錠",
  missed: "未応答",
};

const CREDENTIAL_LABEL_V1: Record<string, string> = {
  nfc: "NFC",
  rfid: "RFID",
  pin: "暗証番号",
  app: "アプリ",
  key: "物理キー",
};

function formatAccessTimeV1(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("ja-JP", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function buildCtViewV1(site: HomeSiteV1): HomeCtViewV1 {
  const level = homeCtLevelV1(site);
  const powerKw = homePowerKwV1(site);
  const demandPercent =
    site.ct.contractDemandKw > 0
      ? Math.round((powerKw / site.ct.contractDemandKw) * 1000) / 10
      : 0;
  return {
    label: site.ct.label,
    mainCurrentA: site.ct.mainCurrentA,
    mainCapacityA: site.ct.mainCapacityA,
    loadPercent: homeLoadPercentV1(site),
    powerW: site.ct.powerW,
    powerKw,
    contractDemandKw: site.ct.contractDemandKw,
    demandPercent,
    level,
    levelLabel: CT_LEVEL_LABEL_V1[level],
    warnThresholdA: site.ct.warnThresholdA,
    alertThresholdA: site.ct.alertThresholdA,
    peakCutActive: site.ct.peakCutActive,
    solarGenerationW: site.ct.solarGenerationW,
    hasSolar: site.ct.solarGenerationW > 0,
    circuits: site.ct.circuits.map((c) => ({
      id: c.id,
      label: c.label,
      voltage: c.voltage,
      currentA: c.currentA,
      on: c.on,
      peakCutTarget: c.peakCutTarget,
      statusLabel: c.on ? "稼働中" : "停止",
    })),
    hourlyCurrentA: [...site.ct.hourlyCurrentA],
  };
}

function buildBathViewV1(site: HomeSiteV1): HomeBathViewV1 {
  syncBathEstimationForSiteV1(site);
  hydrateHomeBathStateV1(site.id);
  const b = site.bath;
  const uiProfile = b.uiProfile || "full";
  const oneshot =
    uiProfile === "oneshot_autofill" || site.operationMode === "live";
  const remainingSeconds = oneshot
    ? getBathRemainingSecondsV1(site)
    : 0;
  const countdownLabel =
    oneshot && b.fillState === "filling" && remainingSeconds > 0
      ? formatBathCountdownV1(remainingSeconds)
      : null;
  let fillLabel =
    b.lastPulseMessage ||
    FILL_STATE_LABEL_V1[b.fillState] ||
    b.fillState;
  if (countdownLabel) {
    fillLabel = `湯はり中（残り ${countdownLabel}）`;
  }
  return {
    label: b.label,
    setTempC: b.setTempC,
    currentTempC: b.currentTempC,
    fillState: b.fillState,
    fillStateLabel: fillLabel,
    fillPercent: b.fillPercent,
    autoFill: b.autoFill,
    reheating: b.reheating,
    keepWarm: b.keepWarm,
    jemaTerminal: b.jemaTerminal,
    relayPort: b.relayPort,
    relayChannel: b.relayChannel ?? null,
    pulseDurationMs: b.pulseDurationMs ?? null,
    uiProfile,
    lastPulseMessage: b.lastPulseMessage ?? null,
    fillStartedAt: b.fillStartedAt ?? null,
    fillEstimatedEndAt: b.fillEstimatedEndAt ?? null,
    remainingSeconds,
    countdownLabel,
    linkState: b.linkState,
    linkStateLabel:
      LINK_STATE_LABEL_V1[b.linkState] ?? b.linkState,
  };
}

function buildAirconViewsV1(site: HomeSiteV1): HomeAirconViewV1[] {
  return site.aircons.map((a) => ({
    deviceKey: a.deviceKey,
    label: a.label,
    power: a.power,
    roomTempC: a.roomTempC,
    setTempC: a.setTempC,
    mode: a.mode,
    modeLabel: AIRCON_MODE_LABEL_V1[a.mode] ?? a.mode,
    fan: a.fan,
    fanLabel: AIRCON_FAN_LABEL_V1[a.fan] ?? a.fan,
    swing: a.swing,
    swingLabel: AIRCON_SWING_LABEL_V1[a.swing] ?? a.swing,
    powerW: a.powerW,
    peakSaveActive: a.peakSaveActive,
  }));
}

function buildLockViewV1(site: HomeSiteV1): HomeLockViewV1 {
  const l = site.lock;
  const last = l.accessLog[0];
  return {
    label: l.label,
    locked: l.locked,
    lockLabel: l.locked ? "LOCKED" : "UNLOCKED",
    lockEmoji: l.locked ? "🔒" : "🔓",
    doorOpen: l.doorOpen,
    doorLabel: l.doorOpen ? "ドア開" : "ドア閉",
    batteryPercent: l.batteryPercent,
    lastAccessLabel: last
      ? `${last.holderName}（${
          CREDENTIAL_LABEL_V1[last.credentialType] ??
          last.credentialType
        }） ${formatAccessTimeV1(last.occurredAt)}`
      : "履歴なし",
    accessLog: l.accessLog.map((e) => ({
      id: e.id,
      credentialType: e.credentialType,
      credentialLabel:
        CREDENTIAL_LABEL_V1[e.credentialType] ?? e.credentialType,
      holderName: e.holderName,
      action: e.action,
      actionLabel: e.action === "unlock" ? "解錠" : "施錠",
      occurredAt: formatAccessTimeV1(e.occurredAt),
    })),
  };
}

function buildIntercomViewV1(site: HomeSiteV1): HomeIntercomViewV1 {
  const ic = site.intercom;
  const meta =
    INTERCOM_STATE_META_V1[ic.state] ?? INTERCOM_STATE_META_V1.idle;
  const hasLiveStream = Boolean(ic.streamUrl || ic.snapshotUrl);
  return {
    label: ic.label,
    state: ic.state,
    stateLabel: meta.label,
    stateEmoji: meta.emoji,
    ringing: ic.state === "ringing",
    lastVisitLabel: ic.lastVisitAt
      ? `直近来客 ${formatAccessTimeV1(ic.lastVisitAt)}`
      : "来客はまだありません",
    streamKind: ic.streamKind,
    streamKindLabel:
      INTERCOM_STREAM_LABEL_V1[ic.streamKind] ?? ic.streamKind,
    streamUrl: ic.streamUrl,
    snapshotUrl: ic.snapshotUrl,
    hasLiveStream,
    autoResponseMessage: ic.autoResponseMessage,
    unlockLinkEnabled: ic.unlockLinkEnabled,
    visitors: ic.visitors.slice(0, 8).map((v) => ({
      id: v.id,
      label: v.label,
      handledAs: v.handledAs,
      handledLabel:
        INTERCOM_HANDLED_LABEL_V1[v.handledAs] ?? v.handledAs,
      occurredAt: formatAccessTimeV1(v.occurredAt),
    })),
  };
}

/** 物件の総合ステータス */
export function resolveHomeStatusV1(
  site: HomeSiteV1
): HomeOverallStatusV1 {
  if (homeSecurityAttentionV1(site)) return "security_alert";
  if (homeCtLevelV1(site) !== "normal") return "peak_warning";
  return "normal";
}

const STATUS_META_V1: Record<
  HomeOverallStatusV1,
  { emoji: string; label: string }
> = {
  normal: { emoji: "🟢", label: "すべて正常です" },
  peak_warning: { emoji: "🟠", label: "電気の使いすぎに注意" },
  security_alert: { emoji: "🔴", label: "玄関を確認してください" },
};

/** 1物件分のダッシュボード */
export function buildHomeSiteDashboardV1(
  site: HomeSiteV1
): HomeSiteDashboardV1 {
  const status = resolveHomeStatusV1(site);
  const meta = STATUS_META_V1[status];
  return {
    siteId: site.id,
    displayName: site.displayName,
    addressLabel: site.addressLabel,
    countryCode: site.countryCode,
    currency: site.currency,
    tenantId: site.tenantId,
    voltageSpec: site.voltageSpec,
    hotWaterSpec: site.hotWaterSpec,
    planCode: site.planCode,
    planStatus: site.planStatus,
    monthlyFee: site.monthlyFee,
    operationMode: site.operationMode || "mock",
    deviceBoardLabel: site.deviceBoardLabel || null,
    status,
    statusEmoji: meta.emoji,
    statusLabel: meta.label,
    ct: buildCtViewV1(site),
    bath: buildBathViewV1(site),
    aircons: buildAirconViewsV1(site),
    lock: buildLockViewV1(site),
    intercom: buildIntercomViewV1(site),
    activeAirconCount: homeActiveAirconCountV1(site),
    intercomRinging: homeIntercomRingingV1(site),
    notes: [...site.notes],
    updatedAt: new Date().toISOString(),
  };
}

/** お客様（住まい）向け */
export function buildHomeCustomerDashboardV1(
  siteId?: string | null
): HomeSiteDashboardV1 {
  return buildHomeSiteDashboardV1(findHomeSiteV1(siteId));
}

/**
 * 社内・事業者向け
 * 防犯 → 過負荷 → 正常 の順に並べる。
 */
export function buildHomeOperatorDashboardV1(): HomeOperatorDashboardV1 {
  const sites = listHomeSitesV1().map(buildHomeSiteDashboardV1);
  const rank = (s: HomeSiteDashboardV1): number => {
    if (s.status === "security_alert") return 0;
    if (s.status === "peak_warning") return 1;
    return 2;
  };
  sites.sort((a, b) => rank(a) - rank(b));
  return {
    totalSites: sites.length,
    overloadCount: sites.filter((s) => s.ct.level !== "normal").length,
    securityAlertCount: sites.filter(
      (s) => s.status === "security_alert"
    ).length,
    bathRunningCount: sites.filter(
      (s) => s.bath.fillState === "filling" || s.bath.reheating
    ).length,
    airconRunningCount: sites.reduce(
      (sum, s) => sum + s.activeAirconCount,
      0
    ),
    intercomRingingCount: sites.filter((s) => s.intercomRinging).length,
    sites,
    updatedAt: new Date().toISOString(),
  };
}

export interface HomeQuickSwitchItemV1 {
  siteId: string;
  displayName: string;
  countryCode: string;
  currency: string;
  statusEmoji: string;
  statusLabel: string;
  internalHref: string;
  customerHref: string;
}

/**
 * クイック切り替えコンポーネント用
 * どの画面からでも TiSLY HOME へ飛べる。
 */
export function buildHomeQuickSwitchV1(): HomeQuickSwitchItemV1[] {
  return listHomeSitesV1().map((site) => {
    const status = resolveHomeStatusV1(site);
    const meta = STATUS_META_V1[status];
    return {
      siteId: site.id,
      displayName: site.displayName,
      countryCode: site.countryCode,
      currency: site.currency,
      statusEmoji: meta.emoji,
      statusLabel: meta.label,
      internalHref: `/home-v1?siteId=${encodeURIComponent(site.id)}`,
      customerHref: `/customer/home?siteId=${encodeURIComponent(
        site.id
      )}`,
    };
  });
}
