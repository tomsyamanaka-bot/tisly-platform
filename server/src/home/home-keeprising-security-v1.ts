/**
 * Keep Rising の通知と日中テスト。
 * リレーの夜間判断は実機が持つ。
 * サーバーは通知と命令の受付だけ。
 */

import { getDatabase } from "../db/database.js";
import {
  TISLY_HEARTBEAT_INTERVAL_SEC_V1,
  TISLY_HEARTBEAT_OFFLINE_MS_V1,
  buildHeartbeatCommLossPushBodyV1,
  buildHeartbeatCommLossPushTitleV1,
  isHeartbeatOnlineV1,
} from "./home-heartbeat-standard-v1.js";
import { sendWebPush } from "../notification/channels/web-push.js";
import { decideStaffNotifyV1 } from "../notification/staff-notify-policy-v1.js";
import { applyDeviceHealthV1 } from "./home-device-health-apply-v1.js";
import { applyCabinetTempV1, applySensorPushGateV1 } from "./home-ops-safety-apply-v1.js";
import {
  isMaintenanceActiveV1,
  markSensorCustomerPushV1,
  takeMaintenanceHoldLogV1,
} from "./home-ops-safety-v1.js";
import { siteAllowsLiveWatchV1 } from "./site-lifecycle-v1.js";
import { recordSystemLogV1 } from "./home-system-log-v1.js";
import {
  deliverCommRecoveryV1,
  noteCommOfflineV1,
  resetCommRecoveryForTestV1,
} from "./home-comm-recovery-v1.js";
import {
  deliverKeepRisingDeviceSettingsV1,
  getKeepRisingCustomerSettingsV1,
  isKeepRisingScheduleOpenV1,
  keepRisingAstroWindowV1,
  type KeepRisingBeamLinkModeV1,
  type KeepRisingCustomerSettingsV1,
} from "./home-keeprising-settings-v1.js";
import {
  compareSemverCoreV1,
  looseSemverCoreV1,
} from "../firmware/tisly-site-target-version-v1.js";
import {
  isOfferedFirmwareCurrentV1,
  readTislyOtaReportedFirmwareV1,
} from "../firmware/tisly-rp2350-ota-v1.js";
import { setSecuritySensorStateV1 } from "../security-floor/security-floor-sites-v1.js";

export const KEEPRISING_CUSTOMER_CODE_V1 = "KEEPRISING001";
export const KEEPRISING_DISPLAY_NAME_V1 = "Keep Rising";
export const SEC_JP_KEEPRISING_SITE_ID_V1 = "SEC-JP-KEEPRISING-001";
export const HOME_JP_KEEPRISING_SITE_ID_V1 = "HOME-JP-KEEPRISING";
export const KEEPRISING_DEVICE_ID_V1 = "rp2350-keeprising-main-01";
export const KEEPRISING_DI_DEBOUNCE_MS_V1 = 50;
export const KEEPRISING_HEARTBEAT_INTERVAL_SEC_V1 =
  TISLY_HEARTBEAT_INTERVAL_SEC_V1;
export const KEEPRISING_HEARTBEAT_OFFLINE_MS_V1 =
  TISLY_HEARTBEAT_OFFLINE_MS_V1;

export type KeepRisingDiV1 = 1 | 2 | 3 | 4;

/**
 * 段階連動の出力。DI2 が直前に無い DI3 は
 * 投光器だけ。DI4 と通知のみは空。
 * 実機の計画が優先で、これは画面と日中テスト用。
 */
export function keepRisingPlannedOutputsV1(
  di: KeepRisingDiV1,
  mode: KeepRisingBeamLinkModeV1,
  di2Fresh: boolean,
  patliteThreat = true
): number[] {
  if (mode === "notify" || di === 4) return [];
  let channels: number[] = [];
  if (mode === "full") channels = [1, 2, 3, 4];
  else if (di === 1) channels = [1];
  else if (di === 2) channels = [1, 2, 3];
  else if (di === 3) channels = di2Fresh ? [1, 2, 3, 4] : [2, 3];
  if (patliteThreat) return channels;
  return channels.filter((ch) => ch !== 1);
}

/** DI1〜DI3 の通知。未設定は受け取る */
export function keepRisingSensorNotifyEnabledV1(
  settings: KeepRisingCustomerSettingsV1,
  di: KeepRisingDiV1
): boolean {
  if (di === 1) return settings.notifyDi1 !== false;
  if (di === 2) return settings.notifyDi2 !== false;
  if (di === 3) return settings.notifyDi3 !== false;
  return true;
}

/** 標準点灯で、DI2 の履歴が無いときの出力 */
export const KEEPRISING_SENSOR_OUTPUTS_V1: Record<
  KeepRisingDiV1,
  number[]
> = {
  1: [1],
  2: [1, 2, 3],
  3: [2, 3],
  4: [],
};

const DI_LABELS_V1: Record<KeepRisingDiV1, string> = {
  1: "ビームセンサー1（外周・遠距離）",
  2: "ビームセンサー2（敷地内・中間）",
  3: "ビームセンサー3（建物至近・事務所前）",
  4: "未使用入力",
};

const DO_LABELS_V1: Record<number, string> = {
  1: "パトライト",
  2: "投光器1",
  3: "投光器2",
  4: "事務所ライト",
};

export interface KeepRisingCommandV1 {
  command: string;
  di: KeepRisingDiV1 | null;
  channels: number[];
  durationSec: number | null;
  queuedAt: string;
  /** true のとき指定端子をすぐ切る */
  release?: boolean;
}

interface RuntimeV1 {
  inputs: Record<KeepRisingDiV1, boolean>;
  queue: KeepRisingCommandV1[];
  lastHeartbeatAt: string | null;
  boardTempC: number | null;
  firmwareVersion: string;
  logs: Array<{ at: string; message: string }>;
  /** 心拍が知らせたコイル。無いときは null */
  reportedOutputs: Record<number, boolean> | null;
  reportedAt: number;
  /** 手動操作の楽観表示。時刻を過ぎたら消灯 */
  outputUntil: Record<number, number>;
}

const runtime: RuntimeV1 = {
  inputs: { 1: false, 2: false, 3: false, 4: false },
  queue: [],
  lastHeartbeatAt: null,
  boardTempC: null,
  firmwareVersion: "",
  logs: [],
  reportedOutputs: null,
  reportedAt: 0,
  outputUntil: {},
};

function nowIso(): string {
  return new Date().toISOString();
}

function pushLog(message: string): void {
  runtime.logs.unshift({ at: nowIso(), message });
  runtime.logs.length = 40;
}

export function resetKeepRisingSecurityStateForTestV1(): void {
  runtime.inputs = { 1: false, 2: false, 3: false, 4: false };
  runtime.queue = [];
  runtime.lastHeartbeatAt = null;
  runtime.boardTempC = null;
  runtime.firmwareVersion = "";
  runtime.logs = [];
  runtime.reportedOutputs = null;
  runtime.reportedAt = 0;
  runtime.outputUntil = {};
  resetCommRecoveryForTestV1();
}

function asDi(raw: unknown): KeepRisingDiV1 | null {
  const n = Number(raw);
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return null;
}

function readActive(body: Record<string, unknown>): boolean {
  if (body.active === false || body.active === 0) return false;
  if (body.active === true || body.active === 1) return true;
  const state = String(body.state ?? body.edge ?? "").toLowerCase();
  if (state === "clear" || state === "off" || state === "fall") return false;
  return true;
}

async function sendKeepRisingPush(input: {
  title: string;
  body: string;
  eventType: string;
  audience?: "toms" | "customer";
}): Promise<boolean> {
  try {
    const staff = input.audience === "toms";
    const result = await sendWebPush({
      title: input.title,
      body: input.body,
      eventType: input.eventType,
      deviceId: SEC_JP_KEEPRISING_SITE_ID_V1,
      url: staff ? "/app/security" : "/customer/security",
      audience: input.audience ?? "customer",
      icon: "/icons/icon-192.png?v=2003",
      badge: "/icons/icon-192.png?v=2003",
      data: {
        siteId: SEC_JP_KEEPRISING_SITE_ID_V1,
        propertyId: HOME_JP_KEEPRISING_SITE_ID_V1,
        homeSiteId: HOME_JP_KEEPRISING_SITE_ID_V1,
        securitySiteId: SEC_JP_KEEPRISING_SITE_ID_V1,
        customerCode: KEEPRISING_CUSTOMER_CODE_V1,
        audience: input.audience ?? "customer",
      },
    });
    return Boolean(result.success);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`Push Send Error: ${reason}`);
    return false;
  }
}

/**
 * 実機が送った検知を記録して通知する。
 * ここではリレー命令を積まない。
 */
export async function processKeepRisingSecurityEventV1(input: {
  siteId?: string | null;
  di: unknown;
  active?: unknown;
  deviceId?: string | null;
  body?: Record<string, unknown>;
}): Promise<{
  ok: true;
  accepted: true;
  di: KeepRisingDiV1;
  active: boolean;
  pushSent: boolean;
  sensorLabel: string;
  linkedOutput: boolean;
  channels: number[];
  notifyEnabled: boolean;
}> {
  const di = asDi(input.di);
  if (!di) throw new Error("di must be 1, 2, 3 or 4");
  const body = input.body ?? {};
  const active =
    input.active === undefined ? readActive(body) : Boolean(input.active);
  const label = DI_LABELS_V1[di];
  const was = runtime.inputs[di];
  runtime.inputs[di] = active;
  const rising = active && !was;
  const falling = !active && was;
  const scheduleOpen = body.scheduleOpen !== false;
  const settings = getKeepRisingCustomerSettingsV1();
  const guardMode = settings.guardMode;
  const reported = Array.isArray(body.outputs)
    ? body.outputs.map((ch) => Number(ch)).filter((ch) => Number.isFinite(ch))
    : scheduleOpen
      ? keepRisingPlannedOutputsV1(
          di,
          settings.beamLinkMode,
          false,
          settings.patliteThreatEnabled
        )
      : [];
  const channels =
    guardMode === "away" &&
    settings.beamLinkMode !== "notify" &&
    settings.patliteThreatEnabled === false
      ? reported.filter((ch) => ch !== 1)
      : guardMode === "away" && settings.beamLinkMode !== "notify"
        ? reported
        : [];
  const notifyEnabled =
    guardMode !== "disarmed" &&
    keepRisingSensorNotifyEnabledV1(settings, di);
  let pushSent = false;
  if (guardMode === "disarmed") {
    return {
      ok: true,
      accepted: true,
      di,
      active,
      pushSent: false,
      sensorLabel: label,
      linkedOutput: false,
      channels: [],
      notifyEnabled: false,
    };
  }
  if (rising || falling) {
    const message = rising
      ? `${label}が反応しました`
      : `${label}が復帰しました`;
    const daytime =
      rising &&
      channels.length === 0 &&
      guardMode === "away" &&
      scheduleOpen === false &&
      settings.beamLinkMode !== "notify";
    const title = rising
      ? `【TiSLY警報】${KEEPRISING_DISPLAY_NAME_V1}`
      : `【TiSLY】${KEEPRISING_DISPLAY_NAME_V1}`;
    const text =
      guardMode === "home" || settings.beamLinkMode === "notify"
        ? `${message}。ライトとパトライトは止めています。`
        : daytime
          ? `${message}。稼働時間外のためライトとパトライトは止めています。`
          : `${message}（${KEEPRISING_DISPLAY_NAME_V1}）`;
    setSecuritySensorStateV1(
      SEC_JP_KEEPRISING_SITE_ID_V1,
      `kr-di${di}`,
      rising ? "alert" : "normal"
    );
    const gate = rising
      ? await applySensorPushGateV1({
          siteId: HOME_JP_KEEPRISING_SITE_ID_V1,
          di,
          siteName: KEEPRISING_DISPLAY_NAME_V1,
        })
      : null;
    if (notifyEnabled && (!gate || gate.allowCustomerPush)) {
      pushSent = await sendKeepRisingPush({
        title,
        body: text,
        eventType: rising
          ? "keeprising_sensor_alert"
          : "keeprising_sensor_clear",
      });
      if (rising && pushSent) {
        markSensorCustomerPushV1(HOME_JP_KEEPRISING_SITE_ID_V1, di);
      }
      if (rising) {
        const staff = decideStaffNotifyV1({
          siteId: HOME_JP_KEEPRISING_SITE_ID_V1,
          eventType: "keeprising_sensor_alert",
          title,
        });
        if (staff.deliver) {
          await sendKeepRisingPush({
            title,
            body: text,
            eventType: "keeprising_sensor_alert",
            audience: "toms",
          });
        }
      }
    } else if (notifyEnabled && gate && gate.reason === "maintenance") {
      pushSent = await sendKeepRisingPush({
        title,
        body: text,
        eventType: "keeprising_sensor_alert",
        audience: "toms",
      });
    }
    pushLog(message);
    recordSystemLogV1({
      siteId: HOME_JP_KEEPRISING_SITE_ID_V1,
      tenantId: KEEPRISING_CUSTOMER_CODE_V1,
      category: "sensor_alert",
      message: `${gate?.logPrefix || ""}${message}`,
      detail: {
        di,
        active,
        scheduleOpen,
        channels,
        customerCode: KEEPRISING_CUSTOMER_CODE_V1,
      },
      actor: "rp2350",
    });
  }
  return {
    ok: true,
    accepted: true,
    di,
    active,
    pushSent,
    sensorLabel: label,
    linkedOutput: channels.length > 0,
    channels,
    notifyEnabled,
  };
}

function enqueue(row: KeepRisingCommandV1): void {
  runtime.queue.push(row);
  if (runtime.queue.length > 8) {
    runtime.queue.splice(0, runtime.queue.length - 8);
  }
}

/**
 * 日中テスト発報。確認後だけ命令を積む。
 * 実機は時間帯を無視して同じ出力を出す。
 */
export function applyKeepRisingDayTestV1(input: {
  di: unknown;
  confirmed: unknown;
}):
  | {
      ok: true;
      command: string;
      di: KeepRisingDiV1;
      channels: number[];
      durationSec: number;
      settings: KeepRisingCustomerSettingsV1;
    }
  | { ok: false; error: string } {
  if (input.confirmed !== true) {
    return { ok: false, error: "最終確認が必要です" };
  }
  const di = asDi(input.di);
  if (!di) return { ok: false, error: "センサー番号が不正です" };
  const settings = getKeepRisingCustomerSettingsV1();
  const channels = keepRisingPlannedOutputsV1(
    di,
    settings.beamLinkMode,
    false,
    settings.patliteThreatEnabled
  );
  const row: KeepRisingCommandV1 = {
    command: "day_test",
    di,
    channels,
    durationSec: settings.durationSec,
    queuedAt: nowIso(),
  };
  enqueue(row);
  const names = channels.map((ch) => DO_LABELS_V1[ch] || `DO${ch}`);
  pushLog(
    names.length
      ? `日中テスト：${DI_LABELS_V1[di]} → ${names.join("、")}`
      : `日中テスト：${DI_LABELS_V1[di]}は通知のみ`
  );
  return {
    ok: true,
    command: row.command,
    di,
    channels,
    durationSec: settings.durationSec,
    settings,
  };
}

export async function notifyKeepRisingDayTestV1(
  di: KeepRisingDiV1,
  channels: number[]
): Promise<boolean> {
  const label = DI_LABELS_V1[di];
  const names = channels.map((ch) => DO_LABELS_V1[ch] || `DO${ch}`);
  const body = names.length
    ? `${label}の連動を時間外に確認しています（${names.join("、")}）`
    : `${label}の日中テストです。通知のみです。`;
  return sendKeepRisingPush({
    title: `⚠️ ${KEEPRISING_DISPLAY_NAME_V1}：日中テスト発報`,
    body,
    eventType: "keeprising_day_test",
  });
}

export function consumeKeepRisingDeviceCommandV1(): KeepRisingCommandV1 | null {
  return runtime.queue.shift() ?? null;
}

export function serializeKeepRisingCommandV1(
  row: KeepRisingCommandV1 | null
): {
  ok: true;
  command: string | null;
  di: KeepRisingDiV1 | null;
  channels: number[];
  durationSec: number | null;
  queuedAt: string | null;
  release: boolean;
} {
  return {
    ok: true,
    command: row?.command ?? null,
    di: row?.di ?? null,
    channels: row?.channels ?? [],
    durationSec: row?.durationSec ?? null,
    queuedAt: row?.queuedAt ?? null,
    release: Boolean(row?.release),
  };
}

const MANUAL_ACTIONS_V1: Record<
  string,
  { channels: number[]; release: boolean }
> = {
  flood1_on: { channels: [2], release: false },
  flood2_on: { channels: [3], release: false },
  office_on: { channels: [4], release: false },
  bulk_on: { channels: [2, 3, 4], release: false },
  bulk_off: { channels: [2, 3, 4], release: true },
  patlite_test: { channels: [1], release: false },
};

/**
 * 手動ボタンは確定を待たず命令を積む。
 * 照明の一括 OFF はパトライトを切らない。
 */
export function applyKeepRisingManualV1(action: unknown):
  | {
      ok: true;
      command: string;
      channels: number[];
      release: boolean;
      durationSec: number;
    }
  | { ok: false; error: string } {
  const key = String(action ?? "").trim();
  const spec = MANUAL_ACTIONS_V1[key];
  if (!spec) return { ok: false, error: "操作が不正です" };
  const settings = getKeepRisingCustomerSettingsV1();
  const row: KeepRisingCommandV1 = {
    command: "manual",
    di: null,
    channels: spec.channels,
    durationSec: spec.release ? 0 : settings.durationSec,
    queuedAt: nowIso(),
    release: spec.release,
  };
  enqueue(row);
  const now = Date.now();
  const until = spec.release ? 0 : now + settings.durationSec * 1000;
  for (const ch of spec.channels) {
    runtime.outputUntil[ch] = until;
  }
  const names = spec.channels.map((ch) => DO_LABELS_V1[ch] || `DO${ch}`);
  pushLog(
    spec.release
      ? `手動消灯：${names.join("、")}`
      : `手動点灯：${names.join("、")}`
  );
  return {
    ok: true,
    command: row.command,
    channels: row.channels,
    release: spec.release,
    durationSec: row.durationSec ?? 0,
  };
}

function readTemp(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < -40 || n > 125) return null;
  return Math.round(n * 10) / 10;
}

export async function recordKeepRisingHeartbeatV1(input: {
  deviceId?: string | null;
  boardTemp?: unknown;
  firmwareVersion?: string | null;
  uptimeSec?: unknown;
  resetReason?: unknown;
  doLimitCuts?: unknown;
  outputs?: unknown;
}): Promise<{ online: true; boardTempC: number | null }> {
  runtime.lastHeartbeatAt = nowIso();
  await deliverCommRecoveryV1({
    siteId: HOME_JP_KEEPRISING_SITE_ID_V1,
    deviceKey: "main",
    siteName: KEEPRISING_DISPLAY_NAME_V1,
    maintenance: isMaintenanceActiveV1(HOME_JP_KEEPRISING_SITE_ID_V1),
  });
  const version = String(input.firmwareVersion ?? "").trim();
  if (version) runtime.firmwareVersion = version;
  const temp = readTemp(input.boardTemp);
  if (temp != null) runtime.boardTempC = temp;
  const reported = readReportedOutputsV1(input.outputs);
  if (reported) {
    runtime.reportedOutputs = reported;
    runtime.reportedAt = Date.now();
  }
  await applyDeviceHealthV1({
    siteId: HOME_JP_KEEPRISING_SITE_ID_V1,
    uptimeSec: input.uptimeSec,
    resetReason: input.resetReason,
    doLimitCuts: input.doLimitCuts,
  });
  await applyCabinetTempV1({
    siteId: HOME_JP_KEEPRISING_SITE_ID_V1,
    siteName: KEEPRISING_DISPLAY_NAME_V1,
    tempC: temp,
  });
  return { online: true, boardTempC: runtime.boardTempC };
}

function newerFirmwareV1(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  const left = looseSemverCoreV1(a);
  const right = looseSemverCoreV1(b);
  if (!left) return b;
  if (!right) return a;
  return compareSemverCoreV1(left, right) >= 0 ? a : b;
}

function readReportedOutputsV1(
  raw: unknown
): Record<number, boolean> | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const out: Record<number, boolean> = {};
  let seen = false;
  for (const ch of [1, 2, 3, 4]) {
    const value = row[ch] ?? row[String(ch)];
    if (value === undefined) continue;
    out[ch] = value === true || value === 1 || value === "1" || value === "on";
    seen = true;
  }
  return seen ? out : null;
}

function outputIsOnV1(ch: number, nowMs: number): boolean {
  const fresh =
    runtime.reportedOutputs != null &&
    nowMs - runtime.reportedAt < 6 * 60 * 1000;
  if (fresh && runtime.reportedOutputs && ch in runtime.reportedOutputs) {
    return Boolean(runtime.reportedOutputs[ch]);
  }
  return (runtime.outputUntil[ch] || 0) > nowMs;
}

export function buildKeepRisingStatusV1(nowMs: number = Date.now()) {
  const settings = getKeepRisingCustomerSettingsV1();
  const delivered = deliverKeepRisingDeviceSettingsV1(new Date(nowMs));
  const astro = keepRisingAstroWindowV1(settings, new Date(nowMs));
  const online = isHeartbeatOnlineV1(
    runtime.lastHeartbeatAt,
    nowMs,
    KEEPRISING_HEARTBEAT_OFFLINE_MS_V1
  );
  const firmwareVersion = newerFirmwareV1(
    String(runtime.firmwareVersion || "").trim(),
    readTislyOtaReportedFirmwareV1("keeprising", KEEPRISING_DEVICE_ID_V1)
  );
  return {
    ok: true as const,
    siteId: SEC_JP_KEEPRISING_SITE_ID_V1,
    homeSiteId: HOME_JP_KEEPRISING_SITE_ID_V1,
    customerCode: KEEPRISING_CUSTOMER_CODE_V1,
    displayName: KEEPRISING_DISPLAY_NAME_V1,
    deviceId: KEEPRISING_DEVICE_ID_V1,
    linkage: "local-night" as const,
    debounceMs: KEEPRISING_DI_DEBOUNCE_MS_V1,
    heartbeatIntervalSec: KEEPRISING_HEARTBEAT_INTERVAL_SEC_V1,
    offlineAfterMs: KEEPRISING_HEARTBEAT_OFFLINE_MS_V1,
    online,
    isHardwareOnline: online,
    lastHeartbeatAt: runtime.lastHeartbeatAt,
    boardTempC: runtime.boardTempC,
    cabinetTemp: runtime.boardTempC,
    boardTemp: runtime.boardTempC,
    firmwareVersion: firmwareVersion || null,
    firmwareLatest: firmwareVersion
      ? isOfferedFirmwareCurrentV1("keeprising", firmwareVersion)
      : true,
    commandPending: runtime.queue.length,
    settings,
    scheduleLabel: `${delivered.scheduleStart}〜${delivered.scheduleEnd}`,
    nightNow: isKeepRisingScheduleOpenV1(
      new Date(nowMs),
      delivered.scheduleStart,
      delivered.scheduleEnd
    ),
    astroLabel: astro?.label || "",
    monthAlerts: countKeepRisingMonthAlertsV1(new Date(nowMs)),
    inputs: ([1, 2, 3, 4] as KeepRisingDiV1[]).map((ch) => ({
      ch,
      label: DI_LABELS_V1[ch],
      active: runtime.inputs[ch],
    })),
    outputs: Object.entries(DO_LABELS_V1).map(([ch, label]) => ({
      ch: Number(ch),
      label,
      on: outputIsOnV1(Number(ch), nowMs),
    })),
    logs: runtime.logs.slice(0, 40),
  };
}

let keepRisingLossNotified = false;

/** 5分途絶の通知。点検中は送らず、期限後に戻す。 */
export async function runKeepRisingHeartbeatWatchdogV1(): Promise<void> {
  if (!siteAllowsLiveWatchV1(HOME_JP_KEEPRISING_SITE_ID_V1)) return;
  if (!runtime.lastHeartbeatAt) return;
  const online = isHeartbeatOnlineV1(
    runtime.lastHeartbeatAt,
    Date.now(),
    KEEPRISING_HEARTBEAT_OFFLINE_MS_V1
  );
  if (online) {
    keepRisingLossNotified = false;
    return;
  }
  if (isMaintenanceActiveV1(HOME_JP_KEEPRISING_SITE_ID_V1)) {
    noteCommOfflineV1(
      HOME_JP_KEEPRISING_SITE_ID_V1,
      "main",
      Date.now(),
      false
    );
    if (takeMaintenanceHoldLogV1(HOME_JP_KEEPRISING_SITE_ID_V1, "comm")) {
      recordSystemLogV1({
        siteId: HOME_JP_KEEPRISING_SITE_ID_V1,
        tenantId: KEEPRISING_CUSTOMER_CODE_V1,
        category: "rp2350_comm",
        message: "[点検中] 主装置の途絶通知を保留",
        detail: { maintenance: true },
        actor: "ops-safety",
      });
    }
    return;
  }
  if (keepRisingLossNotified) return;
  keepRisingLossNotified = true;
  noteCommOfflineV1(HOME_JP_KEEPRISING_SITE_ID_V1, "main", Date.now(), true);
  await sendKeepRisingPush({
    title: buildHeartbeatCommLossPushTitleV1({
      siteDisplayName: KEEPRISING_DISPLAY_NAME_V1,
      deviceLabel: "主装置",
    }),
    body: buildHeartbeatCommLossPushBodyV1({ deviceLabel: "主装置" }),
    eventType: "keeprising_heartbeat_lost",
  });
}

export function keepRisingOutputLabelsV1(): Record<number, string> {
  return { ...DO_LABELS_V1 };
}

/** 今月の反応件数。表が無くても画面は 0 件 */
function countKeepRisingMonthAlertsV1(at: Date): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(at);
    const year = parts.find((part) => part.type === "year")?.value || "1970";
    const month = parts.find((part) => part.type === "month")?.value || "01";
    const start = new Date(
      `${year}-${month}-01T00:00:00+09:00`
    ).toISOString();
    const row = getDatabase()
      .prepare(
        `SELECT COUNT(*) AS n FROM home_system_logs_v1
         WHERE site_id = ?
           AND category = 'sensor_alert'
           AND message LIKE '%反応しました%'
           AND created_at >= ?`
      )
      .get(HOME_JP_KEEPRISING_SITE_ID_V1, start) as
      | { n?: number }
      | undefined;
    return Number(row?.n || 0);
  } catch {
    return 0;
  }
}
