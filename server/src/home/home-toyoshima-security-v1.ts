/**
 * 豊島邸 Security 専用ロジック v1
 *
 * 母屋（8CH RP2350）とはなれ（6CH RP2350）の
 * DI 立上り検知・DO 連動・Push 通知を管理する。
 * 既存物件データは変更せず merge のみ。
 */

import { v4 as uuid } from "uuid";
import { sendWebPush } from "../notification/channels/web-push.js";
import {
  buildHomeSecurityFirmwareRulesV1,
  getHomeSecurityRulesV1,
  homeGuardModeLabelJaV1,
  isHomeGuardActiveV1,
  isHomeNotifyAnyPushV1,
  isHomeNotifyModeV1,
  isHomeNotifyPushEnabledV1,
  isHomeSecurityArmedV1,
  type HomeGuardModeV1,
  type HomeNotifyModeV1,
  updateHomeSecurityRulesV1,
} from "./home-security-rules-v1.js";
import {
  customerControllerLabelV1,
  customerIoLabelV1,
  customerSiteTitleV1,
} from "../shared/customer/customer-display-labels-v1.js";
import { findHomeSiteV1 } from "./home-sites-v1.js";
import { recordSystemLogV1 } from "./home-system-log-v1.js";
import {
  captureSecurityAlarmSnapshotV1,
  type SecurityAlarmSnapshotV1,
} from "./home-security-alarm-snapshot-v1.js";
import {
  customerSecurityModeLabelV1,
  deriveCustomerSecurityModeV1,
  type CustomerSecurityModeV1,
} from "./home-customer-security-mode-v1.js";

/** 豊島邸 HOME / propertyId */
export const HOME_JP_TOYOSHIMA_SITE_ID_V1 = "HOME-JP-TOYOSHIMA";

/** 豊島邸 Security Floor サイト ID */
export const SEC_JP_TOYOSHIMA_SITE_ID_V1 = "SEC-JP-TOYOSHIMA-001";

/** 母屋 RP2350 deviceId */
export const TOYOSHIMA_MAIN_DEVICE_ID_V1 = "rp2350-toyoshima-main-01";

/** はなれ RP2350 deviceId */
export const TOYOSHIMA_DETACHED_DEVICE_ID_V1 =
  "rp2350-toyoshima-detached-01";

/** DI デバウンス（ms）— 実機 toyoshima_security.py と同期 */
export const TOYOSHIMA_DI_DEBOUNCE_MS_V1 = 100;

/** パトライト点滅周期（ms） */
export const TOYOSHIMA_PATLITE_BLINK_MS_V1 = 500;

/** 実機 heartbeat 送信周期（秒）— toyoshima_security.py と同期 */
export const TOYOSHIMA_HEARTBEAT_INTERVAL_SEC_V1 = 300;

/** 通信途絶とみなす猶予（ms）— 5分周期 + 1分余裕 */
export const TOYOSHIMA_HEARTBEAT_OFFLINE_MS_V1 = 6 * 60 * 1000;

/** 盤内温度 — 注意（℃） */
export const TOYOSHIMA_BOARD_TEMP_CAUTION_C_V1 = 45;

/** 盤内温度 — 過熱警告（℃） */
export const TOYOSHIMA_BOARD_TEMP_WARN_C_V1 = 60;

export type ToyoshimaBuildingIdV1 = "main" | "detached";

export type ToyoshimaDiChannelV1 = 1 | 2;

export type ToyoshimaDoChannelV1 = 1 | 2 | 3;

export interface ToyoshimaDoStateV1 {
  ch: ToyoshimaDoChannelV1;
  label: string;
  on: boolean;
  /** 点滅中（パトライト等） */
  blinking?: boolean;
}

export interface ToyoshimaDiStateV1 {
  ch: ToyoshimaDiChannelV1;
  label: string;
  /** normal=待機 / detecting=検知中 */
  state: "normal" | "detecting";
}

export interface ToyoshimaBuildingStateV1 {
  id: ToyoshimaBuildingIdV1;
  label: string;
  labelEn: string;
  controllerLabel: string;
  online: boolean;
  di: ToyoshimaDiStateV1[];
  do: ToyoshimaDoStateV1[];
}

export interface ToyoshimaTimelineEventV1 {
  id: string;
  at: string;
  building: ToyoshimaBuildingIdV1;
  kind:
    | "main_beam"
    | "detached_road"
    | "detached_path"
    | "manual"
    | "patlite_test"
    | "comm_loss"
    | "comm_recovered"
    | "shelly_auto_reboot"
    | "board_overheat"
    | "mode_change";
  title: string;
  detail?: string;
  /** 警報時カメラ静止画 */
  snapshot?: SecurityAlarmSnapshotV1 | null;
}

export type ToyoshimaNotifySensorIdV1 =
  | "detached_road"
  | "detached_path"
  | "main_beam";

export interface ToyoshimaNotifySensorV1 {
  id: ToyoshimaNotifySensorIdV1;
  label: string;
  mode: HomeNotifyModeV1;
  modeLabel: string;
}

export interface ToyoshimaDeviceHealthV1 {
  building: ToyoshimaBuildingIdV1;
  label: string;
  online: boolean;
  lastCommAt: string | null;
  lastHeartbeatAt: string | null;
  /** 盤内温度（℃） */
  boardTempC: number | null;
  boardTempLabel: string;
  boardTempLevel: "normal" | "caution" | "warning";
}

export interface ToyoshimaAlarmStateV1 {
  active: boolean;
  message: string;
  items: string[];
}

export interface ToyoshimaCommHealthV1 {
  onlineSummary: string;
  lastCommAt: string | null;
  lastCommLabel: string;
  lastHeartbeatAt: string | null;
  /** 主装置の盤内温度表示（例: 36.4℃（正常）） */
  boardTempLabel: string;
  boardTempLevel: "normal" | "caution" | "warning";
  boardTempC: number | null;
  devices: ToyoshimaDeviceHealthV1[];
}

export interface ToyoshimaSecurityDashboardV1 {
  siteId: string;
  displayName: string;
  addressLabel: string;
  propertyId: string;
  homeSiteId: string;
  guardMode: HomeGuardModeV1;
  guardModeLabel: string;
  /** 顧客ワンタップ警戒モード */
  customerMode: CustomerSecurityModeV1;
  customerModeLabel: string;
  scheduleStart: string;
  scheduleEnd: string;
  lightsScheduleLabel: string;
  armed: boolean;
  lightsActive: boolean;
  lightingDurationSec: number;
  perimeterTimeoutSec: number;
  /** おでかけ警戒時パトライト威嚇 */
  patliteThreatEnabled: boolean;
  commHealth: ToyoshimaCommHealthV1;
  alarm: ToyoshimaAlarmStateV1;
  notifySensors: ToyoshimaNotifySensorV1[];
  main: ToyoshimaBuildingStateV1;
  detached: ToyoshimaBuildingStateV1;
  timeline: ToyoshimaTimelineEventV1[];
  lastUpdatedAt: string;
}

interface ToyoshimaDeviceCommRuntimeV1 {
  lastCommAt: string | null;
  lastHeartbeatAt: string | null;
  online: boolean;
  /** 途絶 Push を送ったか */
  offlineNotified: boolean;
  /** 最新盤内温度（℃） */
  boardTempC: number | null;
  /** 過熱 Push を送ったか（温度低下で解除） */
  overheatNotified: boolean;
}

/** ランタイム状態（VPS メモリ） */
interface ToyoshimaRuntimeV1 {
  main: ToyoshimaBuildingStateV1;
  detached: ToyoshimaBuildingStateV1;
  timeline: ToyoshimaTimelineEventV1[];
  patliteTimers: Map<string, ReturnType<typeof setInterval>>;
  lightAutoOffTimers: ReturnType<typeof setTimeout>[];
  deviceComm: Record<ToyoshimaBuildingIdV1, ToyoshimaDeviceCommRuntimeV1>;
  alarmLatch: boolean;
}

function defaultMainBuilding(): ToyoshimaBuildingStateV1 {
  return {
    id: "main",
    label: "母屋",
    labelEn: "Main House",
    controllerLabel:
      "Waveshare RP2350 8CH Relay Board (親機)",
    online: true,
    di: [
      {
        ch: 1,
        label: "遠近ビームセンサー DI1",
        state: "normal",
      },
      {
        ch: 2,
        label: "遠近ビームセンサー DI2",
        state: "normal",
      },
    ],
    do: [
      { ch: 1, label: "100V 防犯ライト 1号機 (DO1)", on: false },
      { ch: 2, label: "100V 防犯ライト 2号機 (DO2)", on: false },
      {
        ch: 3,
        label: "24V パトライト (DO3)",
        on: false,
        blinking: false,
      },
    ],
  };
}

function defaultDetachedBuilding(): ToyoshimaBuildingStateV1 {
  return {
    id: "detached",
    label: "はなれ",
    labelEn: "Detached House",
    controllerLabel:
      "Waveshare RP2350 6CH Relay Board (子機/拠点2)",
    online: true,
    di: [
      { ch: 1, label: "道路側 赤外線ビーム (DI1)", state: "normal" },
      { ch: 2, label: "通路側 赤外線ビーム (DI2)", state: "normal" },
    ],
    do: [
      { ch: 1, label: "100V 防犯ライト (DO1)", on: false },
      {
        ch: 2,
        label: "24V パトライト 点滅 (DO2)",
        on: false,
        blinking: false,
      },
      { ch: 3, label: "予備100V ライト (DO3)", on: false },
    ],
  };
}

function defaultDeviceComm(): ToyoshimaDeviceCommRuntimeV1 {
  const at = nowIso();
  return {
    lastCommAt: at,
    lastHeartbeatAt: at,
    online: true,
    offlineNotified: false,
    boardTempC: null,
    overheatNotified: false,
  };
}

function boardTempLevelV1(
  c: number
): "normal" | "caution" | "warning" {
  if (c >= TOYOSHIMA_BOARD_TEMP_WARN_C_V1) return "warning";
  if (c >= TOYOSHIMA_BOARD_TEMP_CAUTION_C_V1) return "caution";
  return "normal";
}

function formatBoardTempLabelV1(c: number | null): string {
  if (c == null || Number.isNaN(c)) return "—";
  const level = boardTempLevelV1(c);
  const suffix =
    level === "warning"
      ? "（警告）"
      : level === "caution"
        ? "（注意）"
        : "（正常）";
  return `${c.toFixed(1)}℃${suffix}`;
}

function parseBoardTempC(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < -40 || n > 125) return null;
  return Math.round(n * 10) / 10;
}

const runtime: ToyoshimaRuntimeV1 = {
  main: defaultMainBuilding(),
  detached: defaultDetachedBuilding(),
  timeline: [],
  patliteTimers: new Map(),
  lightAutoOffTimers: [],
  deviceComm: {
    main: defaultDeviceComm(),
    detached: defaultDeviceComm(),
  },
  alarmLatch: false,
};

/** 実機・操作の通信時刻を記録 */
export function touchToyoshimaDeviceCommV1(
  building: ToyoshimaBuildingIdV1
): void {
  const at = nowIso();
  const prev = runtime.deviceComm[building];
  runtime.deviceComm[building] = {
    ...prev,
    lastCommAt: at,
    online: true,
  };
  getBuilding(building).online = true;
}

/** RP2350 からの生存確認 heartbeat を記録 */
export async function recordToyoshimaHeartbeatV1(input: {
  building: ToyoshimaBuildingIdV1;
  deviceId?: string;
  siteId?: string;
  boardTemp?: unknown;
}): Promise<void> {
  const at = nowIso();
  const prev = runtime.deviceComm[input.building];
  const wasOffline = !prev.online || prev.offlineNotified;
  runtime.deviceComm[input.building] = {
    ...prev,
    lastCommAt: at,
    lastHeartbeatAt: at,
    online: true,
    offlineNotified: false,
  };
  getBuilding(input.building).online = true;
  if (wasOffline && prev.lastHeartbeatAt) {
    const label = input.building === "main" ? "主装置" : "子機";
    appendTimeline({
      at,
      building: input.building,
      kind: "comm_recovered",
      title: `${label} 通信復旧`,
      detail: "ハートビートを再受信しました",
    });
  }
  const temp = parseBoardTempC(input.boardTemp);
  if (temp != null) {
    await processToyoshimaBoardTempV1(input.building, temp);
  }
}

/** 盤内温度 — 過熱判定と Push・履歴 */
async function processToyoshimaBoardTempV1(
  building: ToyoshimaBuildingIdV1,
  boardTempC: number
): Promise<void> {
  const comm = runtime.deviceComm[building];
  comm.boardTempC = boardTempC;
  const label = building === "main" ? "主装置" : "子機";
  const level = boardTempLevelV1(boardTempC);

  if (boardTempC >= TOYOSHIMA_BOARD_TEMP_WARN_C_V1) {
    if (!comm.overheatNotified) {
      comm.overheatNotified = true;
      const now = boardTempC.toFixed(1);
      const title = `⚠️ 豊島邸：${label}の盤内温度が${TOYOSHIMA_BOARD_TEMP_WARN_C_V1}℃を超えました`;
      const body = `⚠️ 豊島邸：${label}の盤内温度が${TOYOSHIMA_BOARD_TEMP_WARN_C_V1}℃を超えました（現在${now}℃）。換気または直射日光を確認してください`;
      appendTimeline({
        at: nowIso(),
        building,
        kind: "board_overheat",
        title: "盤内過熱警告",
        detail: `${label} 盤内温度 ${now}℃（しきい値 ${TOYOSHIMA_BOARD_TEMP_WARN_C_V1}℃）`,
      });
      recordSystemLogV1({
        siteId: HOME_JP_TOYOSHIMA_SITE_ID_V1,
        category: "sensor_alert",
        message: title,
        detail: { building, boardTempC, level },
        actor: "rp2350",
      });
      await sendToyoshimaPush({
        title,
        body,
        eventType: "toyoshima_board_overheat",
      });
      runtime.alarmLatch = true;
    }
    return;
  }

  comm.overheatNotified = false;
  if (level === "normal" && boardTempC < TOYOSHIMA_BOARD_TEMP_CAUTION_C_V1) {
    /* 正常復帰 — ラッチは手動解除または別警報で維持 */
  }
}

/** 5分 heartbeat 監視 — 途絶時に Push・履歴・Shelly自動キック */
export async function runToyoshimaHeartbeatWatchdogV1(): Promise<void> {
  const now = Date.now();
  for (const building of ["main", "detached"] as ToyoshimaBuildingIdV1[]) {
    const comm = runtime.deviceComm[building];
    const hbAt = comm.lastHeartbeatAt;
    if (!hbAt) continue;
    const elapsed = now - Date.parse(hbAt);
    if (elapsed < TOYOSHIMA_HEARTBEAT_OFFLINE_MS_V1) {
      continue;
    }
    const label = building === "main" ? "主装置" : "子機";
    if (comm.online) {
      comm.online = false;
      getBuilding(building).online = false;
    }
    if (comm.offlineNotified) {
      continue;
    }
    comm.offlineNotified = true;
    appendTimeline({
      at: nowIso(),
      building,
      kind: "comm_loss",
      title: "通信断検知",
      detail: `${label}：5分以上ハートビート未受信`,
    });
    await sendToyoshimaPush({
      title:
        building === "main"
          ? "⚠️ 豊島邸：主装置との通信が途絶えました"
          : "⚠️ 豊島邸：子機との通信が途絶えました",
      body: `${label}から5分以上ハートビート未受信（通信途絶）`,
      eventType: "toyoshima_comm_loss",
    });

    /* Shelly 電源自動復旧（設定ON・クールダウン外のみ） */
    try {
      const { maybeTriggerShellyAutoRebootV1 } = await import(
        "./home-shelly-failsafe-v1.js"
      );
      const attempt = await maybeTriggerShellyAutoRebootV1({
        siteId: HOME_JP_TOYOSHIMA_SITE_ID_V1,
        buildingLabel: label,
        reason: `${label}ハートビート途絶`,
      });
      if (attempt.triggered) {
        appendTimeline({
          at: nowIso(),
          building,
          kind: "shelly_auto_reboot",
          title: "電源自動復旧",
          detail:
            "⚡ RP通信途絶を検知：Shelly電源自動再投入を実行",
        });
      }
    } catch (err) {
      console.warn(
        "[toyoshima] shelly failsafe",
        err instanceof Error ? err.message : err
      );
    }
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function isToyoshimaSiteId(siteId: string): boolean {
  const sid = String(siteId || "").trim();
  return (
    sid === HOME_JP_TOYOSHIMA_SITE_ID_V1 ||
    sid === SEC_JP_TOYOSHIMA_SITE_ID_V1 ||
    sid === "HOME-JP-TOSHIMA" ||
    sid === "SEC-JP-TOSHIMA-001"
  );
}

function resolveHomeSiteId(siteId: string): string {
  const sid = String(siteId || "").trim();
  if (sid === SEC_JP_TOYOSHIMA_SITE_ID_V1 || sid === "SEC-JP-TOSHIMA-001") {
    return HOME_JP_TOYOSHIMA_SITE_ID_V1;
  }
  if (sid === "HOME-JP-TOSHIMA") {
    return HOME_JP_TOYOSHIMA_SITE_ID_V1;
  }
  return sid || HOME_JP_TOYOSHIMA_SITE_ID_V1;
}

function getBuilding(
  building: ToyoshimaBuildingIdV1
): ToyoshimaBuildingStateV1 {
  return building === "main" ? runtime.main : runtime.detached;
}

function findDo(
  building: ToyoshimaBuildingStateV1,
  ch: ToyoshimaDoChannelV1
): ToyoshimaDoStateV1 | undefined {
  return building.do.find((d) => d.ch === ch);
}

function findDi(
  building: ToyoshimaBuildingStateV1,
  ch: ToyoshimaDiChannelV1
): ToyoshimaDiStateV1 | undefined {
  return building.di.find((d) => d.ch === ch);
}

function appendTimeline(event: Omit<ToyoshimaTimelineEventV1, "id">): void {
  const row: ToyoshimaTimelineEventV1 = {
    id: uuid(),
    ...event,
  };
  runtime.timeline.unshift(row);
  if (runtime.timeline.length > 100) {
    runtime.timeline.length = 100;
  }
}

function patliteTimerKey(
  building: ToyoshimaBuildingIdV1,
  ch: ToyoshimaDoChannelV1
): string {
  return `${building}:do${ch}`;
}

function stopPatliteBlink(
  building: ToyoshimaBuildingIdV1,
  ch: ToyoshimaDoChannelV1
): void {
  const key = patliteTimerKey(building, ch);
  const timer = runtime.patliteTimers.get(key);
  if (timer) {
    clearInterval(timer);
    runtime.patliteTimers.delete(key);
  }
  const b = getBuilding(building);
  const dout = findDo(b, ch);
  if (dout) {
    dout.blinking = false;
    dout.on = false;
  }
}

function startPatliteBlink(
  building: ToyoshimaBuildingIdV1,
  ch: ToyoshimaDoChannelV1,
  durationMs = 45_000
): void {
  stopPatliteBlink(building, ch);
  const b = getBuilding(building);
  const dout = findDo(b, ch);
  if (!dout) return;
  dout.blinking = true;
  let on = false;
  const key = patliteTimerKey(building, ch);
  const timer = setInterval(() => {
    on = !on;
    dout.on = on;
  }, TOYOSHIMA_PATLITE_BLINK_MS_V1);
  runtime.patliteTimers.set(key, timer);
  setTimeout(() => {
    stopPatliteBlink(building, ch);
  }, durationMs);
}

async function sendToyoshimaPush(input: {
  title: string;
  body: string;
  eventType: string;
  severity?: "critical" | "silent";
  snapshotUrl?: string | null;
}): Promise<boolean> {
  try {
    const result = await sendWebPush({
      title: input.title,
      body: input.body,
      eventType: input.eventType,
      deviceId: HOME_JP_TOYOSHIMA_SITE_ID_V1,
      url: "/customer/security",
      icon: "/icons/icon-192.png?v=2003",
      badge: "/icons/icon-192.png?v=2003",
      data: {
        siteId: HOME_JP_TOYOSHIMA_SITE_ID_V1,
        severity: input.severity || "critical",
        snapshotUrl: input.snapshotUrl || undefined,
      },
    });
    return result.success;
  } catch {
    return false;
  }
}

/** 母屋：遠近センサー検知 → DO1+DO2 点灯（夜間のみ） */
async function handleMainBeamDetect(siteId: string): Promise<void> {
  const homeId = resolveHomeSiteId(siteId);
  const rules = getHomeSecurityRulesV1(homeId);
  const customerMode = deriveCustomerSecurityModeV1(rules);
  const armed = isHomeSecurityArmedV1(rules);
  const lightsActive = isHomeGuardActiveV1(rules);
  /* 在宅見守りでは屋内（母屋）はログのみ */
  const mainActive = customerMode === "away";

  runtime.main.di.forEach((d) => {
    d.state = "detecting";
  });

  const title = "🚨 豊島邸 母屋";
  const at = nowIso();
  const snapshot = captureSecurityAlarmSnapshotV1({
    eventKind: "main_beam",
    at,
    customerCode: "TOYOSHIMA001",
  });
  appendTimeline({
    at,
    building: "main",
    kind: "main_beam",
    title,
    detail: "母屋 遠近ビームセンサー",
    snapshot,
  });

  recordSystemLogV1({
    siteId: homeId,
    category: "sensor_alert",
    message: title,
    detail: { building: "main", di: [1, 2], customerMode },
    actor: "rp2350",
  });

  if (
    armed &&
    mainActive &&
    isHomeNotifyAnyPushV1(rules.notifyStagedMode)
  ) {
    await sendToyoshimaPush({
      title: "🚨 豊島邸 母屋",
      body: "母屋 遠近ビームセンサー侵入検知",
      eventType: "toyoshima_main_beam",
      severity:
        rules.notifyStagedMode === "silent" ? "silent" : "critical",
      snapshotUrl: snapshot?.imageUrl,
    });
  }

  runtime.alarmLatch = mainActive && armed;
  touchToyoshimaDeviceCommV1("main");

  if (mainActive && lightsActive) {
    const d1 = findDo(runtime.main, 1);
    const d2 = findDo(runtime.main, 2);
    if (d1) d1.on = true;
    if (d2) d2.on = true;
    const durationMs = rules.lightingDurationSec * 1000;
    setTimeout(() => {
      if (d1) d1.on = false;
      if (d2) d2.on = false;
    }, durationMs);
  }

  if (mainActive && armed && rules.patliteThreatEnabled !== false) {
    startPatliteBlink("main", 3, rules.di2AlertDurationSec * 1000);
  }

  setTimeout(() => {
    runtime.main.di.forEach((d) => {
      d.state = "normal";
    });
  }, 5000);
}

/** はなれ：DI1 道路側 / DI2 通路側 */
async function handleDetachedDi(
  siteId: string,
  di: ToyoshimaDiChannelV1
): Promise<void> {
  const homeId = resolveHomeSiteId(siteId);
  const rules = getHomeSecurityRulesV1(homeId);
  const customerMode = deriveCustomerSecurityModeV1(rules);
  const armed = isHomeSecurityArmedV1(rules);
  const lightsActive = isHomeGuardActiveV1(rules);
  /* 一時解除以外は外周センサーを有効 */
  const perimeterActive =
    customerMode === "away" || customerMode === "home";

  const diState = findDi(runtime.detached, di);
  if (diState) diState.state = "detecting";

  const isRoad = di === 1;
  const title = isRoad
    ? "🚨 豊島邸 はなれ（道路側）"
    : "🚨 豊島邸 はなれ（通路側）";
  const kind = isRoad ? "detached_road" : "detached_path";
  const at = nowIso();
  const snapshot = captureSecurityAlarmSnapshotV1({
    eventKind: kind,
    at,
    customerCode: "TOYOSHIMA001",
  });

  appendTimeline({
    at,
    building: "detached",
    kind,
    title: title.replace("🚨 ", ""),
    detail: isRoad ? "道路側センサー" : "通路側センサー",
    snapshot,
  });

  recordSystemLogV1({
    siteId: homeId,
    category: "sensor_alert",
    message: title,
    detail: { building: "detached", di, customerMode },
    actor: "rp2350",
  });

  const notifyMode =
    di === 1 ? rules.notifyDi1Mode : rules.notifyDi2Mode;

  if (
    armed &&
    perimeterActive &&
    isHomeNotifyAnyPushV1(notifyMode)
  ) {
    await sendToyoshimaPush({
      title,
      body: title,
      eventType: isRoad
        ? "toyoshima_detached_road"
        : "toyoshima_detached_path",
      severity: notifyMode === "silent" ? "silent" : "critical",
      snapshotUrl: snapshot?.imageUrl,
    });
  }

  runtime.alarmLatch = perimeterActive && armed;
  touchToyoshimaDeviceCommV1("detached");

  const light = findDo(runtime.detached, 1);
  if (perimeterActive && lightsActive && light) {
    light.on = true;
    setTimeout(() => {
      light.on = false;
    }, rules.lightingDurationSec * 1000);
  }

  /* おでかけ警戒 + パトライト威嚇ON のみ */
  if (
    customerMode === "away" &&
    armed &&
    rules.patliteThreatEnabled !== false
  ) {
    startPatliteBlink("detached", 2, rules.di2AlertDurationSec * 1000);
  }

  setTimeout(() => {
    if (diState) diState.state = "normal";
  }, 5000);
}

/** DI 立上りイベント（API / 実機 POST 用） */
export async function processToyoshimaSecurityEventV1(input: {
  siteId?: string;
  building: ToyoshimaBuildingIdV1;
  di: number;
  deviceId?: string;
}): Promise<{
  ok: boolean;
  pushSent: boolean;
  message: string;
}> {
  const siteId = resolveHomeSiteId(
    String(input.siteId ?? HOME_JP_TOYOSHIMA_SITE_ID_V1)
  );
  findHomeSiteV1(siteId);

  const di = Number(input.di) as ToyoshimaDiChannelV1;
  if (di !== 1 && di !== 2) {
    throw new Error("di must be 1 or 2");
  }

  if (input.building === "main") {
    await handleMainBeamDetect(siteId);
    return {
      ok: true,
      pushSent: true,
      message: "母屋 遠近検知",
    };
  }

  await handleDetachedDi(siteId, di);
  return {
    ok: true,
    pushSent: true,
    message:
      di === 1 ? "はなれ 道路側検知" : "はなれ 通路側検知",
  };
}

/** 手動 DO 操作（PWA トグル / テスト） */
export function applyToyoshimaManualControlV1(input: {
  siteId?: string;
  building: ToyoshimaBuildingIdV1;
  action:
    | "do1_on"
    | "do1_off"
    | "do2_on"
    | "do2_off"
    | "do3_on"
    | "do3_off"
    | "patlite_test";
  actor?: string;
}): { ok: boolean; state: ToyoshimaBuildingStateV1 } {
  const siteId = resolveHomeSiteId(
    String(input.siteId ?? HOME_JP_TOYOSHIMA_SITE_ID_V1)
  );
  const building = getBuilding(input.building);
  const actor = input.actor ?? "app";
  touchToyoshimaDeviceCommV1(input.building);

  if (input.action === "patlite_test") {
    const ch = input.building === "main" ? 3 : 2;
    startPatliteBlink(input.building, ch as ToyoshimaDoChannelV1, 10_000);
    appendTimeline({
      at: nowIso(),
      building: input.building,
      kind: "patlite_test",
      title: `${building.label} パトライト手動テスト`,
    });
    recordSystemLogV1({
      siteId,
      category: "manual_control",
      message: `${building.label} パトライト手動テスト`,
      actor,
    });
    return { ok: true, state: building };
  }

  const map: Record<string, { ch: ToyoshimaDoChannelV1; on: boolean }> = {
    do1_on: { ch: 1, on: true },
    do1_off: { ch: 1, on: false },
    do2_on: { ch: 2, on: true },
    do2_off: { ch: 2, on: false },
    do3_on: { ch: 3, on: true },
    do3_off: { ch: 3, on: false },
  };
  const spec = map[input.action];
  if (!spec) {
    return { ok: false, state: building };
  }

  const dout = findDo(building, spec.ch);
  if (dout) {
    if (!spec.on && dout.blinking) {
      stopPatliteBlink(input.building, spec.ch);
    } else {
      dout.on = spec.on;
      dout.blinking = false;
    }
  }

  appendTimeline({
    at: nowIso(),
    building: input.building,
    kind: "manual",
    title: `${building.label} ${dout?.label ?? "DO"} ${spec.on ? "ON" : "OFF"}`,
  });

  recordSystemLogV1({
    siteId,
    category: "manual_control",
    message: `${building.label} DO${spec.ch} ${spec.on ? "ON" : "OFF"}`,
    detail: { building: input.building, do: spec.ch, on: spec.on },
    actor,
  });

  return { ok: true, state: building };
}

/** DO ワンショット強制出力（配線テスト用） */
export function pulseToyoshimaDoV1(input: {
  siteId?: string;
  building: ToyoshimaBuildingIdV1;
  channel: 1 | 2 | 3;
  durationMs?: number;
  actor?: string;
}): { ok: boolean; message: string } {
  const durationMs = Math.max(
    500,
    Math.min(3000, Math.round(Number(input.durationMs) || 1000))
  );
  const onAction =
    input.channel === 1
      ? "do1_on"
      : input.channel === 2
        ? "do2_on"
        : "do3_on";
  const offAction =
    input.channel === 1
      ? "do1_off"
      : input.channel === 2
        ? "do2_off"
        : "do3_off";

  applyToyoshimaManualControlV1({
    siteId: input.siteId,
    building: input.building,
    action: onAction,
    actor: input.actor ?? "operator-pro",
  });

  setTimeout(() => {
    applyToyoshimaManualControlV1({
      siteId: input.siteId,
      building: input.building,
      action: offAction,
      actor: input.actor ?? "operator-pro",
    });
  }, durationMs);

  const building = getBuilding(input.building);
  return {
    ok: true,
    message: `${building.label} DO${input.channel} を ${durationMs}ms テストON`,
  };
}

/** 顧客向けに建物カードのラベルを整形 */
function mapToyoshimaBuildingForCustomerV1(
  building: ToyoshimaBuildingStateV1
): ToyoshimaBuildingStateV1 {
  return {
    ...building,
    controllerLabel: customerControllerLabelV1(building.controllerLabel),
    di: building.di.map((row) => ({
      ...row,
      label: customerIoLabelV1(row.label),
    })),
    do: building.do.map((row) => ({
      ...row,
      label: customerIoLabelV1(row.label),
    })),
  };
}

/** 通知モードの日本語ラベル */
function toyoshimaNotifyModeLabelV1(mode: HomeNotifyModeV1): string {
  if (mode === "critical") return "緊急通知ON";
  if (mode === "silent") return "サイレント";
  return "OFF";
}

/** センサー別通知設定（UI 用） */
function buildToyoshimaNotifySensorsV1(
  rules: ReturnType<typeof getHomeSecurityRulesV1>
): ToyoshimaNotifySensorV1[] {
  return [
    {
      id: "detached_road",
      label: "道路側センサー（はなれ）",
      mode: rules.notifyDi1Mode,
      modeLabel: toyoshimaNotifyModeLabelV1(rules.notifyDi1Mode),
    },
    {
      id: "detached_path",
      label: "通路側センサー（はなれ）",
      mode: rules.notifyDi2Mode,
      modeLabel: toyoshimaNotifyModeLabelV1(rules.notifyDi2Mode),
    },
    {
      id: "main_beam",
      label: "遠近センサー（母屋）",
      mode: rules.notifyStagedMode,
      modeLabel: toyoshimaNotifyModeLabelV1(rules.notifyStagedMode),
    },
  ];
}

function buildToyoshimaAlarmStateV1(): ToyoshimaAlarmStateV1 {
  const items: string[] = [];
  if (runtime.main.di.some((d) => d.state === "detecting")) {
    items.push("母屋 遠近センサー検知");
  }
  if (runtime.detached.di.some((d) => d.state === "detecting")) {
    const det = runtime.detached.di.find((d) => d.state === "detecting");
    items.push(
      det?.ch === 1 ? "はなれ 道路側センサー検知" : "はなれ 通路側センサー検知"
    );
  }
  if (runtime.detached.do.some((d) => d.blinking)) {
    items.push("はなれ パトライト作動中");
  }
  if (runtime.main.do.some((d) => d.blinking)) {
    items.push("母屋 パトライト作動中");
  }
  for (const building of ["main", "detached"] as ToyoshimaBuildingIdV1[]) {
    const comm = runtime.deviceComm[building];
    if (
      comm.boardTempC != null &&
      comm.boardTempC >= TOYOSHIMA_BOARD_TEMP_WARN_C_V1
    ) {
      const label = building === "main" ? "主装置" : "子機";
      items.push(
        `${label} 盤内高温（${comm.boardTempC.toFixed(1)}℃）`
      );
    }
  }
  const active = runtime.alarmLatch || items.length > 0;
  return {
    active,
    message: active ? items[0] || "警報発報中" : "発報はありません",
    items,
  };
}

function buildToyoshimaCommHealthV1(): ToyoshimaCommHealthV1 {
  const now = Date.now();
  const devices: ToyoshimaDeviceHealthV1[] = (
    ["main", "detached"] as ToyoshimaBuildingIdV1[]
  ).map((building) => {
    const comm = runtime.deviceComm[building];
    const hbAt = comm.lastHeartbeatAt;
    const elapsed = hbAt ? now - Date.parse(hbAt) : 0;
    const online =
      Boolean(hbAt) && elapsed < TOYOSHIMA_HEARTBEAT_OFFLINE_MS_V1;
    comm.online = online;
    getBuilding(building).online = online;
    const boardTempC = comm.boardTempC;
    return {
      building,
      label: building === "main" ? "主装置" : "子機",
      online,
      lastCommAt: comm.lastCommAt,
      lastHeartbeatAt: comm.lastHeartbeatAt,
      boardTempC,
      boardTempLabel: formatBoardTempLabelV1(boardTempC),
      boardTempLevel:
        boardTempC != null ? boardTempLevelV1(boardTempC) : "normal",
    };
  });
  const latestHb = devices
    .filter((d) => d.lastHeartbeatAt)
    .sort((a, b) =>
      String(b.lastHeartbeatAt).localeCompare(String(a.lastHeartbeatAt))
    )[0];
  const latest = devices
    .filter((d) => d.lastCommAt)
    .sort((a, b) =>
      String(b.lastCommAt).localeCompare(String(a.lastCommAt))
    )[0];
  const allOnline = devices.every((d) => d.online);
  const mainDevice = devices.find((d) => d.building === "main");
  const mainTemp = mainDevice?.boardTempC ?? null;
  const mainLevel =
    mainTemp != null ? boardTempLevelV1(mainTemp) : "normal";
  const anyOverheat = devices.some(
    (d) =>
      d.boardTempC != null &&
      d.boardTempC >= TOYOSHIMA_BOARD_TEMP_WARN_C_V1
  );

  let onlineSummary = allOnline
    ? "🟢 オンライン（主装置・子機 接続中）"
    : "🔴 オフライン（通信途絶）";
  if (allOnline && anyOverheat) {
    onlineSummary = "⚠️ 盤内高温警告";
  }

  return {
    onlineSummary,
    lastCommAt: latest?.lastCommAt ?? null,
    lastCommLabel: latest?.label ?? "—",
    lastHeartbeatAt: latestHb?.lastHeartbeatAt ?? null,
    boardTempC: mainTemp,
    boardTempLabel: formatBoardTempLabelV1(mainTemp),
    boardTempLevel: mainLevel,
    devices,
  };
}

const NOTIFY_SENSOR_FIELD: Record<
  ToyoshimaNotifySensorIdV1,
  "notifyDi1Mode" | "notifyDi2Mode" | "notifyStagedMode"
> = {
  detached_road: "notifyDi1Mode",
  detached_path: "notifyDi2Mode",
  main_beam: "notifyStagedMode",
};

/** センサー通知モードを切替 */
export function updateToyoshimaNotifyModeV1(input: {
  siteId?: string;
  sensorId: ToyoshimaNotifySensorIdV1;
  mode: HomeNotifyModeV1;
  actor?: string;
}): { ok: boolean; rules: ReturnType<typeof getHomeSecurityRulesV1> } {
  const homeId = resolveHomeSiteId(
    String(input.siteId ?? HOME_JP_TOYOSHIMA_SITE_ID_V1)
  );
  if (!isHomeNotifyModeV1(input.mode)) {
    throw new Error("mode must be critical, silent, or off");
  }
  const field = NOTIFY_SENSOR_FIELD[input.sensorId];
  const rules = updateHomeSecurityRulesV1(homeId, {
    [field]: input.mode,
  });
  recordSystemLogV1({
    siteId: homeId,
    category: "manual_control",
    message: `通知設定変更: ${input.sensorId} → ${input.mode}`,
    actor: input.actor ?? "customer-portal",
  });
  return { ok: true, rules };
}

/** 警報ラッチ解除・検知状態リセット */
export function clearToyoshimaAlarmsV1(input?: {
  siteId?: string;
  actor?: string;
}): { ok: boolean } {
  const homeId = resolveHomeSiteId(
    String(input?.siteId ?? HOME_JP_TOYOSHIMA_SITE_ID_V1)
  );
  runtime.alarmLatch = false;
  runtime.main.di.forEach((d) => {
    d.state = "normal";
  });
  runtime.detached.di.forEach((d) => {
    d.state = "normal";
  });
  stopPatliteBlink("main", 3);
  stopPatliteBlink("detached", 2);
  recordSystemLogV1({
    siteId: homeId,
    category: "manual_control",
    message: "アラーム対応完了",
    actor: input?.actor ?? "customer-portal",
  });
  return { ok: true };
}

/** 防犯ライト一括 ON/OFF（パトライト除く） */
export function applyToyoshimaBulkLightsV1(input: {
  siteId?: string;
  action: "on" | "off";
  /** ON 時の自動消灯秒数（帰宅確認用・既定なし） */
  durationSec?: number;
  actor?: string;
}): { ok: boolean; durationSec?: number } {
  const on = input.action === "on";
  const actor = input.actor ?? "customer-portal";
  for (const building of ["main", "detached"] as ToyoshimaBuildingIdV1[]) {
    touchToyoshimaDeviceCommV1(building);
    applyToyoshimaManualControlV1({
      building,
      action: on ? "do1_on" : "do1_off",
      actor,
    });
    if (building === "main") {
      applyToyoshimaManualControlV1({
        building,
        action: on ? "do2_on" : "do2_off",
        actor,
      });
    }
  }
  const durationSec =
    on && input.durationSec != null
      ? Math.max(5, Math.min(180, Math.round(Number(input.durationSec) || 180)))
      : undefined;
  if (durationSec) {
    const timer = setTimeout(() => {
      applyToyoshimaBulkLightsV1({
        siteId: input.siteId,
        action: "off",
        actor: "auto-off",
      });
    }, durationSec * 1000);
    if (typeof (timer as NodeJS.Timeout).unref === "function") {
      (timer as NodeJS.Timeout).unref();
    }
    runtime.lightAutoOffTimers.push(timer);
  }
  appendTimeline({
    at: nowIso(),
    building: "main",
    kind: "manual",
    title: on
      ? durationSec
        ? `外構ライト点灯（${durationSec}秒）`
        : "照明を一括ON"
      : "照明を一括OFF",
    detail: "母屋・はなれの防犯ライト",
  });
  return { ok: true, durationSec };
}

/** RP2350 向け設定 JSON を返す（同期ボタン用） */
export function syncToyoshimaConfigToFirmwareV1(
  siteId?: string | null
): ReturnType<typeof buildHomeSecurityFirmwareRulesV1> {
  const homeId = resolveHomeSiteId(
    String(siteId ?? HOME_JP_TOYOSHIMA_SITE_ID_V1)
  );
  touchToyoshimaDeviceCommV1("main");
  touchToyoshimaDeviceCommV1("detached");
  recordSystemLogV1({
    siteId: homeId,
    category: "manual_control",
    message: "主装置・子機へ設定を反映",
    actor: "customer-portal",
  });
  return buildHomeSecurityFirmwareRulesV1(homeId);
}

/** 模擬 Push 通知 */
export async function sendToyoshimaTestNotifyV1(
  siteId?: string | null
): Promise<{ ok: boolean; pushSent: boolean }> {
  const homeId = resolveHomeSiteId(
    String(siteId ?? HOME_JP_TOYOSHIMA_SITE_ID_V1)
  );
  const pushSent = await sendToyoshimaPush({
    title: "🔔 豊島邸 通知テスト",
    body: "Push通知が正常に届きました（豊島邸 Security）",
    eventType: "toyoshima_test_notify",
  });
  recordSystemLogV1({
    siteId: homeId,
    category: "manual_control",
    message: "通知テスト送信",
    detail: { pushSent },
    actor: "customer-portal",
  });
  return { ok: true, pushSent };
}

/** 動作ログレポート（テキスト） */
export function buildToyoshimaActivityReportV1(
  siteId?: string | null
): string {
  const dash = buildToyoshimaSecurityDashboardV1(siteId);
  const lines = [
    `豊島邸 Security 動作レポート`,
    `出力日時: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`,
    `警戒: ${dash.guardModeLabel}`,
    `ライト点灯: ${dash.lightsScheduleLabel}`,
    `通信: ${dash.commHealth.onlineSummary}`,
    "",
    "— イベント履歴 —",
  ];
  for (const ev of dash.timeline) {
    lines.push(
      `${ev.at} | ${ev.title}${ev.detail ? ` / ${ev.detail}` : ""}`
    );
  }
  return lines.join("\n");
}

/** 警戒時間帯の表示ラベル */
function toyoshimaGuardScheduleLabelV1(
  rules: ReturnType<typeof getHomeSecurityRulesV1>
): string {
  if (rules.guardMode === "off") {
    return homeGuardModeLabelJaV1("off");
  }
  if (rules.guardMode === "always") {
    return homeGuardModeLabelJaV1("always");
  }
  return `警戒時間 ${rules.scheduleStart}〜${rules.scheduleEnd}`;
}

/** 豊島邸ダッシュボード JSON */
export function buildToyoshimaSecurityDashboardV1(
  siteId?: string | null
): ToyoshimaSecurityDashboardV1 {
  const homeId = resolveHomeSiteId(
    String(siteId ?? SEC_JP_TOYOSHIMA_SITE_ID_V1)
  );
  const site = findHomeSiteV1(homeId);
  const rules = getHomeSecurityRulesV1(homeId);
  const scheduleStart = rules.scheduleStart || "18:00";
  const scheduleEnd = rules.scheduleEnd || "06:00";
  const customerMode = deriveCustomerSecurityModeV1(rules);

  return {
    siteId: SEC_JP_TOYOSHIMA_SITE_ID_V1,
    displayName: customerSiteTitleV1(site.displayName || "豊島邸"),
    addressLabel: site.addressLabel || "—",
    propertyId: HOME_JP_TOYOSHIMA_SITE_ID_V1,
    homeSiteId: homeId,
    guardMode: rules.guardMode,
    guardModeLabel: toyoshimaGuardScheduleLabelV1(rules),
    customerMode,
    customerModeLabel: customerSecurityModeLabelV1(customerMode),
    scheduleStart,
    scheduleEnd,
    lightsScheduleLabel: `${scheduleStart}〜${scheduleEnd}`,
    armed: isHomeSecurityArmedV1(rules),
    lightsActive: isHomeGuardActiveV1(rules),
    lightingDurationSec:
      rules.lightingDurationSec ?? rules.di1DurationSec ?? 45,
    perimeterTimeoutSec: rules.perimeterTimeoutSec ?? 120,
    patliteThreatEnabled: rules.patliteThreatEnabled !== false,
    commHealth: buildToyoshimaCommHealthV1(),
    alarm: buildToyoshimaAlarmStateV1(),
    notifySensors: buildToyoshimaNotifySensorsV1(rules),
    main: mapToyoshimaBuildingForCustomerV1({
      ...runtime.main,
      di: [...runtime.main.di],
      do: [...runtime.main.do],
    }),
    detached: mapToyoshimaBuildingForCustomerV1({
      ...runtime.detached,
      di: [...runtime.detached.di],
      do: [...runtime.detached.do],
    }),
    timeline: [...runtime.timeline],
    lastUpdatedAt: nowIso(),
  };
}

/** テスト用：heartbeat 時刻を手動設定 */
export function setToyoshimaHeartbeatAtForTestV1(
  building: ToyoshimaBuildingIdV1,
  at: string
): void {
  runtime.deviceComm[building].lastHeartbeatAt = at;
  runtime.deviceComm[building].lastCommAt = at;
}

/** テスト用：状態リセット */
export function resetToyoshimaSecurityStateForTestV1(): void {
  runtime.main = defaultMainBuilding();
  runtime.detached = defaultDetachedBuilding();
  runtime.timeline = [];
  runtime.deviceComm = {
    main: defaultDeviceComm(),
    detached: defaultDeviceComm(),
  };
  runtime.alarmLatch = false;
  for (const [, timer] of runtime.patliteTimers) {
    clearInterval(timer);
  }
  runtime.patliteTimers.clear();
  for (const timer of runtime.lightAutoOffTimers) {
    clearTimeout(timer);
  }
  runtime.lightAutoOffTimers = [];
}

/** 豊島邸の初期ルールを merge（初回のみ） */
export function ensureToyoshimaSecurityRulesV1(): void {
  updateHomeSecurityRulesV1(HOME_JP_TOYOSHIMA_SITE_ID_V1, {
    guardMode: "scheduled",
    scheduleStart: "18:00",
    scheduleEnd: "06:00",
    lightingDurationSec: 45,
    notifyDi1Mode: "critical",
    notifyDi2Mode: "critical",
    notifyStagedMode: "critical",
  });
}

export function isToyoshimaSecuritySiteIdV1(
  siteId: string | null | undefined
): boolean {
  return isToyoshimaSiteId(String(siteId ?? ""));
}

ensureToyoshimaSecurityRulesV1();
