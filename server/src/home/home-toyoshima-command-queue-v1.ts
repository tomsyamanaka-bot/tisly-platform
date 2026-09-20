/**
 * 豊島邸 RP2350 手動リレー命令キュー
 *
 * PWA 手動点灯は昼夜判定を無視し、
 * 実機がポーリングで受け取る。
 * 板橋の remote-test キューとは分離する。
 */

export const TOYOSHIMA_MAIN_DEVICE_ID_V1 = "rp2350-toyoshima-main-01";
export const TOYOSHIMA_DETACHED_DEVICE_ID_V1 =
  "rp2350-toyoshima-detached-01";

export interface ToyoshimaDeviceCommandV1 {
  command: string;
  bypassSchedule: true;
  forceRelayTest: true;
  durationMs?: number;
  queuedAt: string;
}

const queues = new Map<string, ToyoshimaDeviceCommandV1[]>();

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

/** 実機へ届ける手動命令を積む（スケジュール無視） */
export function queueToyoshimaDeviceCommandV1(input: {
  deviceId?: string | null;
  building?: "main" | "detached";
  command: string;
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
    bypassSchedule: true,
    forceRelayTest: true,
    durationMs,
    queuedAt: new Date().toISOString(),
  };
  const q = queues.get(deviceId) ?? [];
  q.push(row);
  queues.set(deviceId, q.slice(-16));
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

export function peekToyoshimaDeviceCommandCountV1(
  rawDeviceId: unknown
): number {
  const deviceId = normalizeDeviceIdV1(rawDeviceId);
  return (queues.get(deviceId) ?? []).length;
}

/** テスト用にキューを空にする */
export function resetToyoshimaDeviceCommandQueueForTestV1(): void {
  queues.clear();
}
