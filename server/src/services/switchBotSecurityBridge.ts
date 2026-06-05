/**
 * Phase 1321–1340 — SwitchBot lock events → TiSLY security automation bridge
 */
import type { SwitchBotLockStatus } from "../security-automation/security-automation-types.js";
import {
  evaluateSwitchBotLockedEvent,
  evaluateSwitchBotUnlockedEvent,
  getSecurityState,
} from "./securityAutomationService.js";
import { getSwitchBotLockStatus } from "./switchbotService.js";

export async function handleSwitchBotLockStatusChanged(
  status: SwitchBotLockStatus
): Promise<{ handled: boolean; state: ReturnType<typeof getSecurityState> }> {
  if (status.lockState === "locked") {
    const state = handleSwitchBotLocked(status);
    return { handled: true, state };
  }
  if (status.lockState === "unlocked") {
    const state = handleSwitchBotUnlocked(status);
    return { handled: true, state };
  }
  return { handled: false, state: getSecurityState() };
}

export function handleSwitchBotLocked(status?: SwitchBotLockStatus) {
  const lockStatus: SwitchBotLockStatus =
    status ?? {
      deviceId: "event",
      lockState: "locked",
      mode: "mock",
      fetchedAt: new Date().toISOString(),
    };
  return evaluateSwitchBotLockedEvent(lockStatus);
}

export function handleSwitchBotUnlocked(status?: SwitchBotLockStatus) {
  const lockStatus: SwitchBotLockStatus =
    status ?? {
      deviceId: "event",
      lockState: "unlocked",
      mode: "mock",
      fetchedAt: new Date().toISOString(),
    };
  return evaluateSwitchBotUnlockedEvent(lockStatus);
}

/** ポーリング用 — 状態変化を検知してブリッジへ渡す（Phase1321 foundation） */
let lastKnownLockState: "locked" | "unlocked" | "unknown" | null = null;

export async function pollSwitchBotAndBridge(deviceId?: string): Promise<{
  changed: boolean;
  status: SwitchBotLockStatus;
  state: ReturnType<typeof getSecurityState>;
}> {
  const status = await getSwitchBotLockStatus(deviceId);
  const changed = lastKnownLockState !== null && lastKnownLockState !== status.lockState;
  if (changed) {
    const result = await handleSwitchBotLockStatusChanged(status);
    lastKnownLockState = status.lockState;
    return { changed: true, status, state: result.state };
  }
  lastKnownLockState = status.lockState;
  return { changed: false, status, state: getSecurityState() };
}

export function resetSwitchBotBridgeState(): void {
  lastKnownLockState = null;
}
