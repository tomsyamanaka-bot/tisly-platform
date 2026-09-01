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
    | "patlite_test";
  title: string;
  detail?: string;
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
  scheduleStart: string;
  scheduleEnd: string;
  lightsScheduleLabel: string;
  armed: boolean;
  lightsActive: boolean;
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
  online: boolean;
}

/** ランタイム状態（VPS メモリ） */
interface ToyoshimaRuntimeV1 {
  main: ToyoshimaBuildingStateV1;
  detached: ToyoshimaBuildingStateV1;
  timeline: ToyoshimaTimelineEventV1[];
  patliteTimers: Map<string, ReturnType<typeof setInterval>>;
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
  return { lastCommAt: nowIso(), online: true };
}

const runtime: ToyoshimaRuntimeV1 = {
  main: defaultMainBuilding(),
  detached: defaultDetachedBuilding(),
  timeline: [],
  patliteTimers: new Map(),
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
  runtime.deviceComm[building] = { lastCommAt: at, online: true };
  getBuilding(building).online = true;
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
        severity: "critical",
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
  const armed = isHomeSecurityArmedV1(rules);
  const lightsActive = isHomeGuardActiveV1(rules);

  runtime.main.di.forEach((d) => {
    d.state = "detecting";
  });

  const title = "🚨 豊島邸 母屋";
  appendTimeline({
    at: nowIso(),
    building: "main",
    kind: "main_beam",
    title,
    detail: "母屋 遠近ビームセンサー DI1/DI2",
  });

  recordSystemLogV1({
    siteId: homeId,
    category: "sensor_alert",
    message: title,
    detail: { building: "main", di: [1, 2] },
    actor: "rp2350",
  });

  if (armed && isHomeNotifyPushEnabledV1(rules.notifyStagedMode)) {
    await sendToyoshimaPush({
      title: "🚨 豊島邸 母屋",
      body: "母屋 遠近ビームセンサー侵入検知",
      eventType: "toyoshima_main_beam",
    });
  }

  runtime.alarmLatch = true;
  touchToyoshimaDeviceCommV1("main");

  if (lightsActive) {
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
  const armed = isHomeSecurityArmedV1(rules);
  const lightsActive = isHomeGuardActiveV1(rules);

  const diState = findDi(runtime.detached, di);
  if (diState) diState.state = "detecting";

  const isRoad = di === 1;
  const title = isRoad
    ? "🚨 豊島邸 はなれ（道路側）"
    : "🚨 豊島邸 はなれ（通路側）";
  const kind = isRoad ? "detached_road" : "detached_path";

  appendTimeline({
    at: nowIso(),
    building: "detached",
    kind,
    title: title.replace("🚨 ", ""),
    detail: isRoad ? "DI1 道路側" : "DI2 通路側",
  });

  recordSystemLogV1({
    siteId: homeId,
    category: "sensor_alert",
    message: title,
    detail: { building: "detached", di },
    actor: "rp2350",
  });

  const notifyMode =
    di === 1 ? rules.notifyDi1Mode : rules.notifyDi2Mode;

  if (armed && isHomeNotifyPushEnabledV1(notifyMode)) {
    await sendToyoshimaPush({
      title,
      body: title,
      eventType: isRoad
        ? "toyoshima_detached_road"
        : "toyoshima_detached_path",
    });
  }

  runtime.alarmLatch = true;
  touchToyoshimaDeviceCommV1("detached");

  const light = findDo(runtime.detached, 1);
  if (lightsActive && light) {
    light.on = true;
    setTimeout(() => {
      light.on = false;
    }, rules.lightingDurationSec * 1000);
  }

  startPatliteBlink("detached", 2, rules.di2AlertDurationSec * 1000);

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
      message: "母屋 遠近センサー侵入検知",
    };
  }

  await handleDetachedDi(siteId, di);
  return {
    ok: true,
    pushSent: true,
    message:
      di === 1
        ? "はなれ：道路側センサー反応"
        : "はなれ：通路側センサー反応",
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
      label: "道路側センサー",
      mode: rules.notifyDi1Mode,
      modeLabel: toyoshimaNotifyModeLabelV1(rules.notifyDi1Mode),
    },
    {
      id: "detached_path",
      label: "通路側センサー",
      mode: rules.notifyDi2Mode,
      modeLabel: toyoshimaNotifyModeLabelV1(rules.notifyDi2Mode),
    },
    {
      id: "main_beam",
      label: "母屋 遠近センサー",
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
  const active = runtime.alarmLatch || items.length > 0;
  return {
    active,
    message: active ? items[0] || "警報発報中" : "発報はありません",
    items,
  };
}

function buildToyoshimaCommHealthV1(): ToyoshimaCommHealthV1 {
  const devices: ToyoshimaDeviceHealthV1[] = [
    {
      building: "main",
      label: "主装置",
      online: runtime.deviceComm.main.online,
      lastCommAt: runtime.deviceComm.main.lastCommAt,
    },
    {
      building: "detached",
      label: "子機",
      online: runtime.deviceComm.detached.online,
      lastCommAt: runtime.deviceComm.detached.lastCommAt,
    },
  ];
  const latest = devices
    .filter((d) => d.lastCommAt)
    .sort((a, b) =>
      String(b.lastCommAt).localeCompare(String(a.lastCommAt))
    )[0];
  const allOnline = devices.every((d) => d.online);
  return {
    onlineSummary: allOnline
      ? "🟢 オンライン（接続中）"
      : "🔴 オフライン（要確認）",
    lastCommAt: latest?.lastCommAt ?? null,
    lastCommLabel: latest?.label ?? "—",
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
  actor?: string;
}): { ok: boolean } {
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
  appendTimeline({
    at: nowIso(),
    building: "main",
    kind: "manual",
    title: on ? "照明を一括ON" : "照明を一括OFF",
    detail: "母屋・はなれの防犯ライト",
  });
  return { ok: true };
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

  return {
    siteId: SEC_JP_TOYOSHIMA_SITE_ID_V1,
    displayName: customerSiteTitleV1(site.displayName || "豊島邸"),
    addressLabel: site.addressLabel || "—",
    propertyId: HOME_JP_TOYOSHIMA_SITE_ID_V1,
    homeSiteId: homeId,
    guardMode: rules.guardMode,
    guardModeLabel: toyoshimaGuardScheduleLabelV1(rules),
    scheduleStart,
    scheduleEnd,
    lightsScheduleLabel: `${scheduleStart}〜${scheduleEnd}`,
    armed: isHomeSecurityArmedV1(rules),
    lightsActive: isHomeGuardActiveV1(rules),
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
