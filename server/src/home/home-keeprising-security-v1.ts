/**
 * Keep Rising の通知と日中テスト。
 * リレーの夜間判断は実機が持つ。
 * サーバーは通知と命令の受付だけ。
 */

import { getDatabase } from "../db/database.js";
import {
  TISLY_HEARTBEAT_INTERVAL_SEC_V1,
  TISLY_HEARTBEAT_OFFLINE_MS_V1,
  isHeartbeatOnlineV1,
} from "./home-heartbeat-standard-v1.js";
import { sendWebPush } from "../notification/channels/web-push.js";
import { recordSystemLogV1 } from "./home-system-log-v1.js";
import {
  getKeepRisingCustomerSettingsV1,
  type KeepRisingCustomerSettingsV1,
} from "./home-keeprising-settings-v1.js";
import {
  compareSemverCoreV1,
  deviceNeedsSiteFirmwareUpdateV1,
  looseSemverCoreV1,
} from "../firmware/tisly-site-target-version-v1.js";
import { readTislyOtaReportedFirmwareV1 } from "../firmware/tisly-rp2350-ota-v1.js";

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

/** 投光器4は DO7。DI4 では DO3 と束ねて出す */
export const KEEPRISING_SENSOR_OUTPUTS_V1: Record<
  KeepRisingDiV1,
  number[]
> = {
  1: [6],
  2: [],
  3: [1, 2, 4],
  4: [1, 2, 3, 7, 4, 5],
};

const DI_LABELS_V1: Record<KeepRisingDiV1, string> = {
  1: "センサー1（赤外線ビーム）",
  2: "門マグネットセンサー",
  3: "センサー2（赤外線ビーム）",
  4: "センサー3（赤外線ビーム）",
};

const DO_LABELS_V1: Record<number, string> = {
  1: "投光器1",
  2: "投光器2",
  3: "投光器3",
  4: "赤色スピーカーパトライト",
  5: "事務所ベースライト",
  6: "青丸位置の赤色パトライト",
  7: "投光器4",
};

export interface KeepRisingCommandV1 {
  command: string;
  di: KeepRisingDiV1 | null;
  channels: number[];
  durationSec: number | null;
  queuedAt: string;
}

interface RuntimeV1 {
  inputs: Record<KeepRisingDiV1, boolean>;
  queue: KeepRisingCommandV1[];
  lastHeartbeatAt: string | null;
  boardTempC: number | null;
  firmwareVersion: string;
  logs: Array<{ at: string; message: string }>;
}

const runtime: RuntimeV1 = {
  inputs: { 1: false, 2: false, 3: false, 4: false },
  queue: [],
  lastHeartbeatAt: null,
  boardTempC: null,
  firmwareVersion: "",
  logs: [],
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
}): Promise<boolean> {
  try {
    const result = await sendWebPush({
      title: input.title,
      body: input.body,
      eventType: input.eventType,
      deviceId: SEC_JP_KEEPRISING_SITE_ID_V1,
      url: "/customer/security",
      audience: "customer",
      icon: "/icons/icon-192.png?v=2003",
      badge: "/icons/icon-192.png?v=2003",
      data: {
        siteId: SEC_JP_KEEPRISING_SITE_ID_V1,
        propertyId: HOME_JP_KEEPRISING_SITE_ID_V1,
        homeSiteId: HOME_JP_KEEPRISING_SITE_ID_V1,
        securitySiteId: SEC_JP_KEEPRISING_SITE_ID_V1,
        customerCode: KEEPRISING_CUSTOMER_CODE_V1,
        audience: "customer",
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
  const guardMode = getKeepRisingCustomerSettingsV1().guardMode;
  const reported = Array.isArray(body.outputs)
    ? body.outputs.map((ch) => Number(ch)).filter((ch) => Number.isFinite(ch))
    : scheduleOpen
      ? [...KEEPRISING_SENSOR_OUTPUTS_V1[di]]
      : [];
  const channels = guardMode === "away" ? reported : [];
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
    };
  }
  if (rising || falling) {
    const message = rising
      ? `${label}が反応しました`
      : `${label}が復帰しました`;
    const daytime =
      rising && channels.length === 0 && di !== 2 && guardMode === "away";
    const title = `⚠️ ${KEEPRISING_DISPLAY_NAME_V1}：${message}`;
    const text =
      guardMode === "home"
        ? `${message}。ライトとパトライトは止めています。`
        : daytime
          ? `${message}。稼働時間外のためライトとパトライトは止めています。`
          : `${message}（${KEEPRISING_DISPLAY_NAME_V1}）`;
    pushSent = await sendKeepRisingPush({
      title,
      body: text,
      eventType: rising
        ? "keeprising_sensor_alert"
        : "keeprising_sensor_clear",
    });
    pushLog(message);
    recordSystemLogV1({
      siteId: HOME_JP_KEEPRISING_SITE_ID_V1,
      tenantId: KEEPRISING_CUSTOMER_CODE_V1,
      category: "sensor_alert",
      message,
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
  const channels = [...KEEPRISING_SENSOR_OUTPUTS_V1[di]];
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
} {
  return {
    ok: true,
    command: row?.command ?? null,
    di: row?.di ?? null,
    channels: row?.channels ?? [],
    durationSec: row?.durationSec ?? null,
    queuedAt: row?.queuedAt ?? null,
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
}): Promise<{ online: true; boardTempC: number | null }> {
  runtime.lastHeartbeatAt = nowIso();
  const version = String(input.firmwareVersion ?? "").trim();
  if (version) runtime.firmwareVersion = version;
  const temp = readTemp(input.boardTemp);
  if (temp != null) runtime.boardTempC = temp;
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

export function buildKeepRisingStatusV1(nowMs: number = Date.now()) {
  const settings = getKeepRisingCustomerSettingsV1();
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
      ? !deviceNeedsSiteFirmwareUpdateV1("keeprising", firmwareVersion)
      : true,
    commandPending: runtime.queue.length,
    settings,
    inputs: ([1, 2, 3, 4] as KeepRisingDiV1[]).map((ch) => ({
      ch,
      label: DI_LABELS_V1[ch],
      active: runtime.inputs[ch],
    })),
    outputs: Object.entries(DO_LABELS_V1).map(([ch, label]) => ({
      ch: Number(ch),
      label,
    })),
    logs: runtime.logs.slice(0, 40),
  };
}

export function keepRisingOutputLabelsV1(): Record<number, string> {
  return { ...DO_LABELS_V1 };
}
