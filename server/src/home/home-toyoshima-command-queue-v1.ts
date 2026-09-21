/**
 * 豊島邸 RP2350 手動リレー命令キュー
 *
 * PWA 手動点灯は昼夜判定を無視し、
 * 長待ち GET と heartbeat 同梱で即時届ける。
 * 板橋の remote-test キューとは分離する。
 */

import { broadcast } from "../ws/hub.js";

export const TOYOSHIMA_MAIN_DEVICE_ID_V1 = "rp2350-toyoshima-main-01";
export const TOYOSHIMA_DETACHED_DEVICE_ID_V1 =
  "rp2350-toyoshima-detached-01";

export interface ToyoshimaDeviceCommandV1 {
  command: string;
  /** 実機が名前未対応でも GPIO を叩く */
  channels: number[];
  bypassSchedule: true;
  forceRelayTest: true;
  durationMs?: number;
  queuedAt: string;
}

export interface ToyoshimaDeviceCommandJsonV1 {
  ok: true;
  command: string | null;
  channels: number[];
  bypassSchedule: true;
  forceRelayTest: true;
  durationMs?: number;
  queuedAt: string | null;
  pipeline: "immediate";
}

type WaiterV1 = {
  resolve: (row: ToyoshimaDeviceCommandV1 | null) => void;
  timer: ReturnType<typeof setTimeout>;
};

const queues = new Map<string, ToyoshimaDeviceCommandV1[]>();
const waiters = new Map<string, WaiterV1[]>();

function normalizeDeviceIdV1(raw: unknown): string {
  const id = String(raw ?? "").trim();
  if (id === "main" || id === "detached") {
    return id === "main"
      ? TOYOSHIMA_MAIN_DEVICE_ID_V1
      : TOYOSHIMA_DETACHED_DEVICE_ID_V1;
  }
  return id;
}

export function toyoshimaDeviceIdForBuildingV1(
  building: "main" | "detached"
): string {
  return building === "detached"
    ? TOYOSHIMA_DETACHED_DEVICE_ID_V1
    : TOYOSHIMA_MAIN_DEVICE_ID_V1;
}

export function parseToyoshimaCommandWaitMsV1(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(4000, Math.max(0, Math.round(n)));
}

export function serializeToyoshimaDeviceCommandV1(
  row: ToyoshimaDeviceCommandV1 | null
): ToyoshimaDeviceCommandJsonV1 {
  return {
    ok: true,
    command: row?.command ?? null,
    channels: row?.channels ?? [],
    bypassSchedule: true,
    forceRelayTest: true,
    durationMs: row?.durationMs,
    queuedAt: row?.queuedAt ?? null,
    pipeline: "immediate",
  };
}

function notifyRelayPipelineV1(
  deviceId: string,
  row: ToyoshimaDeviceCommandV1
): void {
  try {
    broadcast({
      type: "event",
      topic: "toyoshima/relay",
      payload: {
        deviceId,
        command: row.command,
        channels: row.channels,
        bypassSchedule: true,
        forceRelayTest: true,
        durationMs: row.durationMs ?? null,
        pipeline: "immediate",
      },
      at: row.queuedAt,
    });
  } catch {
    /* WS 未接続でもキューは積む */
  }
}

function flushToyoshimaCommandWaitersV1(deviceId: string): void {
  const q = queues.get(deviceId) ?? [];
  const waiting = waiters.get(deviceId) ?? [];
  while (q.length > 0 && waiting.length > 0) {
    const row = q.shift();
    const waiter = waiting.shift();
    if (!row || !waiter) break;
    clearTimeout(waiter.timer);
    waiter.resolve(row);
  }
  queues.set(deviceId, q);
  waiters.set(deviceId, waiting);
}

/** 実機へ届ける手動命令を積む（スケジュール無視） */
function normalizeChannelsV1(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const item of raw) {
    const n = Number(item);
    if (!Number.isInteger(n) || n < 1 || n > 8) continue;
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

export function queueToyoshimaDeviceCommandV1(input: {
  deviceId?: string | null;
  building?: "main" | "detached";
  command: string;
  channels?: number[];
  durationMs?: number;
}): ToyoshimaDeviceCommandV1 {
  const deviceId =
    normalizeDeviceIdV1(input.deviceId) ||
    (input.building
      ? toyoshimaDeviceIdForBuildingV1(input.building)
      : TOYOSHIMA_MAIN_DEVICE_ID_V1);
  const command = String(input.command || "").trim();
  if (!command) {
    throw new Error("command required");
  }
  const durationMs =
    input.durationMs != null && Number.isFinite(Number(input.durationMs))
      ? Math.max(0, Math.round(Number(input.durationMs)))
      : undefined;
  const row: ToyoshimaDeviceCommandV1 = {
    command,
    channels: normalizeChannelsV1(input.channels),
    bypassSchedule: true,
    forceRelayTest: true,
    durationMs,
    queuedAt: new Date().toISOString(),
  };
  const q = queues.get(deviceId) ?? [];
  q.push(row);
  queues.set(deviceId, q.slice(-16));
  flushToyoshimaCommandWaitersV1(deviceId);
  notifyRelayPipelineV1(deviceId, row);
  return row;
}

/** 実機ポーリングで 1 件取り出す */
export function consumeToyoshimaDeviceCommandV1(
  rawDeviceId: unknown
): ToyoshimaDeviceCommandV1 | null {
  const deviceId = normalizeDeviceIdV1(rawDeviceId);
  if (!deviceId) return null;
  const q = queues.get(deviceId) ?? [];
  const row = q.shift() ?? null;
  queues.set(deviceId, q);
  return row;
}

/** 命令が無ければ waitMs まで待って返す */
export function consumeOrWaitToyoshimaDeviceCommandV1(
  rawDeviceId: unknown,
  waitMs: number
): Promise<ToyoshimaDeviceCommandV1 | null> {
  const deviceId = normalizeDeviceIdV1(rawDeviceId);
  if (!deviceId) return Promise.resolve(null);
  const holdMs = parseToyoshimaCommandWaitMsV1(waitMs);
  const immediate = consumeToyoshimaDeviceCommandV1(deviceId);
  if (immediate || holdMs <= 0) {
    return Promise.resolve(immediate);
  }
  return new Promise((resolve) => {
    const waiter: WaiterV1 = {
      resolve,
      timer: setTimeout(() => {
        const list = waiters.get(deviceId) ?? [];
        waiters.set(
          deviceId,
          list.filter((item) => item !== waiter)
        );
        resolve(consumeToyoshimaDeviceCommandV1(deviceId));
      }, holdMs),
    };
    const list = waiters.get(deviceId) ?? [];
    list.push(waiter);
    waiters.set(deviceId, list.slice(-8));
    flushToyoshimaCommandWaitersV1(deviceId);
  });
}

export function peekToyoshimaDeviceCommandCountV1(
  rawDeviceId: unknown
): number {
  const deviceId = normalizeDeviceIdV1(rawDeviceId);
  return (queues.get(deviceId) ?? []).length;
}

/** テスト用にキューを空にする */
export function resetToyoshimaDeviceCommandQueueForTestV1(): void {
  for (const list of waiters.values()) {
    for (const waiter of list) {
      clearTimeout(waiter.timer);
      waiter.resolve(null);
    }
  }
  waiters.clear();
  queues.clear();
}
