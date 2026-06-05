/**
 * Phase 1341–1360 — SwitchBot Bridge background worker
 */
import { config } from "../config.js";
import {
  getSwitchBotBridgeWorkerState,
  pollSwitchBotAndBridge,
} from "../services/switchBotSecurityBridge.js";

export interface SwitchBotWorkerTickResult {
  polled: boolean;
  changed: boolean;
  lockState: string;
  error: string | null;
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let ticking = false;

export async function runSwitchBotBridgeWorkerTick(): Promise<SwitchBotWorkerTickResult> {
  if (ticking) {
    const state = getSwitchBotBridgeWorkerState();
    return {
      polled: false,
      changed: false,
      lockState: state.lastLockState ?? "unknown",
      error: "tick in progress",
    };
  }
  ticking = true;
  try {
    const result = await pollSwitchBotAndBridge();
    return {
      polled: true,
      changed: result.changed,
      lockState: result.status.lockState,
      error: result.status.error ?? null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { polled: true, changed: false, lockState: "offline", error: msg };
  } finally {
    ticking = false;
  }
}

export function startSwitchBotBridgeWorker(): void {
  if (intervalHandle) return;
  if (process.env.SWITCHBOT_WORKER_ENABLED === "false") {
    console.log("[TiSLY] SwitchBot bridge worker disabled (SWITCHBOT_WORKER_ENABLED=false)");
    return;
  }
  const intervalMs = config.switchbot.pollIntervalMs;
  void runSwitchBotBridgeWorkerTick();
  intervalHandle = setInterval(() => void runSwitchBotBridgeWorkerTick(), intervalMs);
  console.log(`[TiSLY] SwitchBot bridge worker started (interval ${intervalMs}ms, mode=${config.switchbot.mode})`);
}

export function stopSwitchBotBridgeWorker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
