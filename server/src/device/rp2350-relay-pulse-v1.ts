/**
 * RP2350 DO リレー — ワンショットパルス v1
 *
 * ファームがポーリングで受け取り、GPIO 上で
 * ON → durationMs → OFF をローカル実行する。
 * （サーバ側の遅延 OFF では 3 秒ポーリングに負ける）
 */

import {
  CHANNEL_COUNT,
  isValidChannel,
  queueChPulseCommand,
  type RemoteTestPulseResult,
} from "../remote-test/remote-test-state.js";

export const RP2350_DEFAULT_PULSE_MS_V1 = 500;
export const RP2350_MIN_PULSE_MS_V1 = 50;
export const RP2350_MAX_PULSE_MS_V1 = 5000;

export interface Rp2350RelayPulseInputV1 {
  channel?: unknown;
  durationMs?: unknown;
  reason?: string | null;
}

export interface Rp2350RelayPulseResultV1 {
  ok: boolean;
  error?: string;
  channel?: number;
  durationMs?: number;
  command?: string;
  queuedAt?: string;
  reason?: string | null;
  transport?: "remote_test_poll";
}

function clampDurationMs(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return RP2350_DEFAULT_PULSE_MS_V1;
  return Math.max(
    RP2350_MIN_PULSE_MS_V1,
    Math.min(RP2350_MAX_PULSE_MS_V1, Math.round(n))
  );
}

/**
 * DO CHn へワンショットパルスをキューイングする。
 * 実機は /api/remote-test/command で取得する。
 */
export function queueRp2350RelayPulseV1(
  input: Rp2350RelayPulseInputV1 = {}
): Rp2350RelayPulseResultV1 {
  const channel = Number(input.channel ?? 1);
  if (!isValidChannel(channel)) {
    return {
      ok: false,
      error: `channel は 1〜${CHANNEL_COUNT} です`,
    };
  }
  const durationMs = clampDurationMs(input.durationMs);
  let pulsed: RemoteTestPulseResult;
  try {
    pulsed = queueChPulseCommand(channel, durationMs);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  return {
    ok: true,
    channel: pulsed.channel,
    durationMs: pulsed.durationMs,
    command: pulsed.command,
    queuedAt: pulsed.queuedAt,
    reason: input.reason ?? null,
    transport: "remote_test_poll",
  };
}
