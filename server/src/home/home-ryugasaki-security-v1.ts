/**
 * ウォッシュメイト龍ヶ崎店 Security v1
 *
 * DI1〜DI3 は通知専用。検知しても
 * 回転灯・ベルのリレーは動かさない。
 * DO は確認済みの遠隔命令だけ積む。
 * 既存の豊島邸・板橋の状態は触らない。
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
import { recordSystemLogV1 } from "./home-system-log-v1.js";
import { durationSecForDoChannelV1 } from "./home-ryugasaki-settings-v1.js";
import { deviceNeedsSiteFirmwareUpdateV1 } from "../firmware/tisly-site-target-version-v1.js";

export const RYUGASAKI_CUSTOMER_CODE_V1 = "WASHMATE001";
export const RYUGASAKI_DISPLAY_NAME_V1 = "ウォッシュメイト龍ヶ崎店";
export const SEC_JP_RYUGASAKI_SITE_ID_V1 = "SEC-JP-RYUGASAKI-001";
export const HOME_JP_RYUGASAKI_SITE_ID_V1 = "HOME-JP-RYUGASAKI";
export const RYUGASAKI_DEVICE_ID_V1 = "rp2350-ryugasaki-main-01";
export const RYUGASAKI_DI_DEBOUNCE_MS_V1 = 100;
export const RYUGASAKI_HEARTBEAT_INTERVAL_SEC_V1 =
  TISLY_HEARTBEAT_INTERVAL_SEC_V1;
export const RYUGASAKI_HEARTBEAT_OFFLINE_MS_V1 =
  TISLY_HEARTBEAT_OFFLINE_MS_V1;

/** 盤内温度の注意と緊急。リレーは動かさない */
export const RYUGASAKI_TEMP_WATCH_C_V1 = 45;
export const RYUGASAKI_TEMP_CRITICAL_C_V1 = 60;

const DI_LABELS_V1: Record<1 | 2 | 3, { name: string; body: string }> = {
  1: {
    name: "バックヤード入口MS",
    body: "バックヤード入口のマグネットスイッチが反応しました",
  },
  2: {
    name: "両替機MS",
    body: "両替機のマグネットスイッチが反応しました",
  },
  3: {
    name: "バックヤード人感センサー",
    body: "バックヤードの人感センサーが反応しました",
  },
};

const DO_LABELS_V1: Record<1 | 2, string> = {
  1: "回転灯",
  2: "ベル",
};

type DiChannelV1 = 1 | 2 | 3;
type DoChannelV1 = 1 | 2;

export interface RyugasakiCommandV1 {
  command: string;
  channels: number[];
  /** 作動秒。停止命令は null */
  durationSec: number | null;
  queuedAt: string;
}

export interface RyugasakiLogV1 {
  id: string;
  at: string;
  atLabelJst: string;
  kind: "detect" | "clear" | "remote" | "heartbeat" | "temp";
  message: string;
  di: DiChannelV1 | null;
  pushSent: boolean;
}

interface RuntimeV1 {
  inputs: Record<DiChannelV1, boolean>;
  outputs: Record<DoChannelV1, boolean>;
  lastHeartbeatAt: string | null;
  boardTempC: number | null;
  firmwareVersion: string | null;
  overheat: boolean;
  tempAlertSent: boolean;
  lossNotified: boolean;
  logs: RyugasakiLogV1[];
  queue: RyugasakiCommandV1[];
}

function emptyRuntime(): RuntimeV1 {
  return {
    inputs: { 1: false, 2: false, 3: false },
    outputs: { 1: false, 2: false },
    lastHeartbeatAt: null,
    boardTempC: null,
    firmwareVersion: null,
    overheat: false,
    tempAlertSent: false,
    lossNotified: false,
    logs: [],
    queue: [],
  };
}

const runtime: RuntimeV1 = emptyRuntime();

export function resetRyugasakiSecurityStateForTestV1(): void {
  const next = emptyRuntime();
  runtime.inputs = next.inputs;
  runtime.outputs = next.outputs;
  runtime.lastHeartbeatAt = next.lastHeartbeatAt;
  runtime.boardTempC = next.boardTempC;
  runtime.firmwareVersion = next.firmwareVersion;
  runtime.overheat = next.overheat;
  runtime.tempAlertSent = next.tempAlertSent;
  runtime.lossNotified = next.lossNotified;
  runtime.logs = next.logs;
  runtime.queue = next.queue;
}

export function isRyugasakiSecuritySiteIdV1(
  siteId: string | null | undefined
): boolean {
  const id = String(siteId ?? "").trim();
  return (
    id === SEC_JP_RYUGASAKI_SITE_ID_V1 ||
    id === HOME_JP_RYUGASAKI_SITE_ID_V1 ||
    id === RYUGASAKI_CUSTOMER_CODE_V1 ||
    id === "RYUGASAKI001"
  );
}

function nowIso(): string {
  return new Date().toISOString();
}

function jstLabel(iso: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return iso;
  return new Date(at).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function pushLog(row: Omit<RyugasakiLogV1, "id" | "atLabelJst">): void {
  runtime.logs.unshift({
    ...row,
    id: `rg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    atLabelJst: jstLabel(row.at),
  });
  if (runtime.logs.length > 80) {
    runtime.logs.length = 80;
  }
}

function persistNotifyLog(input: {
  eventType: string;
  title: string;
  body: string;
  ok: boolean;
  error?: string;
}): void {
  try {
    const db = getDatabase();
    db.prepare(
      `INSERT INTO notification_logs (
        id, user_id, device_id, event_type, channel,
        title, body, payload_json, status, sent_at, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      "home-security",
      SEC_JP_RYUGASAKI_SITE_ID_V1,
      input.eventType,
      "web_push",
      input.title,
      input.body,
      JSON.stringify({
        siteId: SEC_JP_RYUGASAKI_SITE_ID_V1,
        customerCode: RYUGASAKI_CUSTOMER_CODE_V1,
      }),
      input.ok ? "sent" : "failed",
      input.ok ? nowIso() : null,
      input.error ?? null
    );
  } catch (err) {
    console.error(
      "[ryugasaki] notification_logs:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

async function sendRyugasakiPush(input: {
  title: string;
  body: string;
  eventType: string;
}): Promise<boolean> {
  try {
    const result = await sendWebPush({
      title: input.title,
      body: input.body,
      eventType: input.eventType,
      deviceId: SEC_JP_RYUGASAKI_SITE_ID_V1,
      url: "/customer/security",
      audience: "all",
      icon: "/icons/icon-192.png?v=2003",
      badge: "/icons/icon-192.png?v=2003",
      data: {
        siteId: SEC_JP_RYUGASAKI_SITE_ID_V1,
        propertyId: HOME_JP_RYUGASAKI_SITE_ID_V1,
        homeSiteId: HOME_JP_RYUGASAKI_SITE_ID_V1,
        securitySiteId: SEC_JP_RYUGASAKI_SITE_ID_V1,
        customerCode: RYUGASAKI_CUSTOMER_CODE_V1,
        audience: "all",
      },
    });
    persistNotifyLog({
      eventType: input.eventType,
      title: input.title,
      body: input.body,
      ok: Boolean(result.success),
      error: result.error,
    });
    return Boolean(result.success);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`Push Send Error: ${reason}`);
    persistNotifyLog({
      eventType: input.eventType,
      title: input.title,
      body: input.body,
      ok: false,
      error: reason,
    });
    return false;
  }
}

function asDi(raw: unknown): DiChannelV1 | null {
  const n = Number(raw);
  if (n === 1 || n === 2 || n === 3) return n;
  return null;
}

function readActive(body: Record<string, unknown>): boolean {
  if (body.active === false || body.active === 0) return false;
  if (body.active === true || body.active === 1) return true;
  const state = String(body.state ?? body.edge ?? "").toLowerCase();
  if (state === "clear" || state === "off" || state === "fall") return false;
  return true;
}

/**
 * 検知イベントを記録する。
 * 出力キューと DO 状態は変更しない。
 */
export async function processRyugasakiSecurityEventV1(input: {
  siteId?: string | null;
  di: unknown;
  active?: unknown;
  deviceId?: string | null;
  body?: Record<string, unknown>;
}): Promise<{
  ok: true;
  accepted: true;
  di: DiChannelV1;
  active: boolean;
  pushSent: boolean;
  sensorLabel: string;
  linkedOutput: false;
}> {
  const di = asDi(input.di);
  if (!di) {
    throw new Error("di must be 1, 2 or 3");
  }
  const body = input.body ?? {};
  const active =
    input.active === undefined ? readActive(body) : Boolean(input.active);
  const label = DI_LABELS_V1[di];
  const was = runtime.inputs[di];
  runtime.inputs[di] = active;
  let pushSent = false;
  const rising = active && !was;
  const falling = !active && was;
  if (rising || falling) {
    const message = rising
      ? `${label.name}が反応しました`
      : `${label.name}が復帰しました`;
    const title = rising
      ? `⚠️ ${RYUGASAKI_DISPLAY_NAME_V1}：${message}`
      : `${RYUGASAKI_DISPLAY_NAME_V1}：${message}`;
    const body = rising
      ? `${label.body}。回転灯とベルは連動しません。`
      : message;
    pushSent = await sendRyugasakiPush({
      title,
      body,
      eventType: rising
        ? "ryugasaki_sensor_alert"
        : "ryugasaki_sensor_clear",
    });
    pushLog({
      at: nowIso(),
      kind: rising ? "detect" : "clear",
      message,
      di,
      pushSent,
    });
    recordSystemLogV1({
      siteId: HOME_JP_RYUGASAKI_SITE_ID_V1,
      tenantId: RYUGASAKI_CUSTOMER_CODE_V1,
      category: "sensor_alert",
      message,
      detail: { di, active },
      actor: "rp2350",
    });
  }
  return {
    ok: true,
    accepted: true,
    di,
    active,
    pushSent,
    sensorLabel: label.name,
    linkedOutput: false,
  };
}

const REMOTE_ACTIONS_V1: Record<
  string,
  { channel: DoChannelV1; on: boolean; command: string; test: boolean }
> = {
  do1_on: { channel: 1, on: true, command: "do1_on", test: false },
  do1_off: { channel: 1, on: false, command: "do1_off", test: false },
  do2_on: { channel: 2, on: true, command: "do2_on", test: false },
  do2_off: { channel: 2, on: false, command: "do2_off", test: false },
  do1_test: { channel: 1, on: true, command: "do1_test", test: true },
  do2_test: { channel: 2, on: true, command: "do2_test", test: true },
};

/**
 * 確認済みの遠隔操作だけを命令キューへ積む。
 * confirmed が真でないときは拒否する。
 */
export function applyRyugasakiRemoteControlV1(input: {
  action: string;
  confirmed: unknown;
  actor?: string | null;
}):
  | { ok: true; command: string; channels: number[]; durationSec: number | null }
  | { ok: false; error: string } {
  if (input.confirmed !== true) {
    return { ok: false, error: "最終確認が必要です" };
  }
  const spec = REMOTE_ACTIONS_V1[String(input.action || "").trim()];
  if (!spec) {
    return { ok: false, error: "未対応の操作です" };
  }
  const durationSec = spec.on
    ? durationSecForDoChannelV1(spec.channel)
    : null;
  runtime.outputs[spec.channel] = spec.on;
  const row: RyugasakiCommandV1 = {
    command: spec.command,
    channels: [spec.channel],
    durationSec,
    queuedAt: nowIso(),
  };
  runtime.queue.push(row);
  if (runtime.queue.length > 8) {
    runtime.queue.splice(0, runtime.queue.length - 8);
  }
  const verb = spec.test ? "テスト" : spec.on ? "作動" : "停止";
  pushLog({
    at: row.queuedAt,
    kind: "remote",
    message: `${DO_LABELS_V1[spec.channel]}の${verb}指令を受け付けました`,
    di: null,
    pushSent: false,
  });
  return {
    ok: true,
    command: row.command,
    channels: row.channels,
    durationSec,
  };
}

export function consumeRyugasakiDeviceCommandV1(): RyugasakiCommandV1 | null {
  return runtime.queue.shift() ?? null;
}

export function serializeRyugasakiCommandV1(
  row: RyugasakiCommandV1 | null
): {
  ok: true;
  command: string | null;
  channels: number[];
  durationSec: number | null;
  queuedAt: string | null;
} {
  return {
    ok: true,
    command: row?.command ?? null,
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

/**
 * 5分ハートビートを記録する。
 * センサー入力はここでは更新しない。
 */
export async function recordRyugasakiHeartbeatV1(input: {
  deviceId?: string | null;
  boardTemp?: unknown;
  firmwareVersion?: string | null;
}): Promise<{ online: true; boardTempC: number | null }> {
  runtime.lastHeartbeatAt = nowIso();
  runtime.lossNotified = false;
  const version = String(input.firmwareVersion ?? "").trim();
  if (version) runtime.firmwareVersion = version;
  const temp = readTemp(input.boardTemp);
  if (temp != null) {
    runtime.boardTempC = temp;
    const hot = temp >= RYUGASAKI_TEMP_CRITICAL_C_V1;
    runtime.overheat = hot;
    if (hot && !runtime.tempAlertSent) {
      runtime.tempAlertSent = true;
      const title = `⚠️ 【緊急】${RYUGASAKI_DISPLAY_NAME_V1}：盤内温度が高くなっています`;
      const body = `内蔵温度センサーが ${temp}℃ です。出力は動かしません。`;
      const pushSent = await sendRyugasakiPush({
        title,
        body,
        eventType: "ryugasaki_board_temp",
      });
      pushLog({
        at: runtime.lastHeartbeatAt,
        kind: "temp",
        message: `盤内温度 ${temp}℃`,
        di: null,
        pushSent,
      });
    } else if (temp < RYUGASAKI_TEMP_WATCH_C_V1) {
      runtime.tempAlertSent = false;
      runtime.overheat = false;
    }
  }
  return { online: true, boardTempC: runtime.boardTempC };
}

/** 途絶を一度だけ知らせる。心拍が戻れば再開できる */
export async function runRyugasakiHeartbeatWatchdogV1(): Promise<void> {
  if (!runtime.lastHeartbeatAt) return;
  const online = isHeartbeatOnlineV1(
    runtime.lastHeartbeatAt,
    Date.now(),
    RYUGASAKI_HEARTBEAT_OFFLINE_MS_V1
  );
  if (online) {
    runtime.lossNotified = false;
    return;
  }
  if (runtime.lossNotified) return;
  runtime.lossNotified = true;
  const title = buildHeartbeatCommLossPushTitleV1({
    siteDisplayName: RYUGASAKI_DISPLAY_NAME_V1,
    deviceLabel: "主装置",
  });
  const body = buildHeartbeatCommLossPushBodyV1({ deviceLabel: "主装置" });
  const pushSent = await sendRyugasakiPush({
    title,
    body,
    eventType: "ryugasaki_heartbeat_lost",
  });
  pushLog({
    at: nowIso(),
    kind: "heartbeat",
    message: "主装置との通信が途絶えました",
    di: null,
    pushSent,
  });
}

export function buildRyugasakiStatusV1(nowMs: number = Date.now()) {
  const online = isHeartbeatOnlineV1(
    runtime.lastHeartbeatAt,
    nowMs,
    RYUGASAKI_HEARTBEAT_OFFLINE_MS_V1
  );
  return {
    ok: true as const,
    siteId: SEC_JP_RYUGASAKI_SITE_ID_V1,
    homeSiteId: HOME_JP_RYUGASAKI_SITE_ID_V1,
    customerCode: RYUGASAKI_CUSTOMER_CODE_V1,
    displayName: RYUGASAKI_DISPLAY_NAME_V1,
    deviceId: RYUGASAKI_DEVICE_ID_V1,
    linkage: "notify-only" as const,
    debounceMs: RYUGASAKI_DI_DEBOUNCE_MS_V1,
    heartbeatIntervalSec: RYUGASAKI_HEARTBEAT_INTERVAL_SEC_V1,
    offlineAfterMs: RYUGASAKI_HEARTBEAT_OFFLINE_MS_V1,
    online,
    isHardwareOnline: online,
    lastHeartbeatAt: runtime.lastHeartbeatAt,
    lastHeartbeatLabelJst: runtime.lastHeartbeatAt
      ? jstLabel(runtime.lastHeartbeatAt)
      : null,
    boardTempC: runtime.boardTempC,
    firmwareVersion: runtime.firmwareVersion,
    firmwareLatest: runtime.firmwareVersion
      ? !deviceNeedsSiteFirmwareUpdateV1(
          "ryugasaki",
          runtime.firmwareVersion
        )
      : true,
    overheat: runtime.overheat,
    commandPending: runtime.queue.length,
    inputs: ([1, 2, 3] as DiChannelV1[]).map((ch) => ({
      ch,
      label: DI_LABELS_V1[ch].name,
      active: runtime.inputs[ch],
    })),
    outputs: ([1, 2] as DoChannelV1[]).map((ch) => ({
      ch,
      label: DO_LABELS_V1[ch],
      on: runtime.outputs[ch],
    })),
    logs: runtime.logs.slice(0, 40),
  };
}
