/**
 * Phase 1321–1360 — SwitchBot lock events → TiSLY security automation bridge
 */
import { config } from "../config.js";
import type {
  SwitchBotBridgeWorkerState,
  SwitchBotLockState,
  SwitchBotLockStatus,
} from "../security-automation/security-automation-types.js";
import { createSecurityEventLogEntry } from "../security-automation/security-automation-store.js";
import { dispatchSecurityEventNotification } from "../security-automation/security-notifications.js";
import { focusProRemoteFloor } from "../pro-remote/floor-stack-rc2.js";
import { broadcast } from "../ws/hub.js";
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
    broadcastSecurityFocus("locked");
    return { handled: true, state };
  }
  if (status.lockState === "unlocked") {
    const state = handleSwitchBotUnlocked(status);
    broadcastSecurityFocus("unlocked");
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

function broadcastSecurityFocus(event: "locked" | "unlocked"): void {
  const customerCode = config.switchbot.focusCustomerCode;
  const floor = event === "locked" ? "perimeter" : "1f";
  focusProRemoteFloor({
    customerCode,
    floor,
    trigger: `switchbot_${event}`,
  });
  broadcast({
    type: "security_focus",
    payload: {
      event: `switchbot_${event}`,
      customerCode,
      floor,
      securityMode: getSecurityState().mode,
      cameraAutoSwitch: false,
    },
    at: new Date().toISOString(),
  });
}

function recordLockStateTimeline(
  prev: SwitchBotLockState | null,
  next: SwitchBotLockState,
  status: SwitchBotLockStatus
): void {
  if (prev === next) return;
  const eventType =
    next === "locked"
      ? "switchbot_lock_state_locked"
      : next === "unlocked"
        ? "switchbot_lock_state_unlocked"
        : next === "offline"
          ? "switchbot_lock_state_offline"
          : "switchbot_lock_state_unknown";

  createSecurityEventLogEntry({
    eventType,
    source: "switchbot",
    message: `SwitchBot lock state: ${prev ?? "init"} → ${next}`,
    beforeMode: getSecurityState().mode,
    afterMode: getSecurityState().mode,
    metadata: { prev, next, status },
  });
}

/** ポーリング用 — 状態変化を検知してブリッジへ渡す */
let lastKnownLockState: SwitchBotLockState | null = null;
let lastLoggedLockState: SwitchBotLockState | null = null;
const workerState: SwitchBotBridgeWorkerState = {
  lastPollAt: null,
  lastLockState: null,
  lastUnlockAt: null,
  lastError: null,
  pollCount: 0,
  changeCount: 0,
};

export function getSwitchBotBridgeWorkerState(): SwitchBotBridgeWorkerState {
  return { ...workerState };
}

export async function pollSwitchBotAndBridge(deviceId?: string): Promise<{
  changed: boolean;
  status: SwitchBotLockStatus;
  state: ReturnType<typeof getSecurityState>;
}> {
  workerState.pollCount += 1;
  workerState.lastPollAt = new Date().toISOString();

  let status: SwitchBotLockStatus;
  try {
    status = await getSwitchBotLockStatus(deviceId);
    workerState.lastError = status.error ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "SwitchBot poll failed";
    workerState.lastError = msg;
    const id = deviceId || config.switchbot.lockDeviceId || "mock-lock-001";
    status = {
      deviceId: id,
      lockState: "offline",
      mode: config.switchbot.mode,
      fetchedAt: new Date().toISOString(),
      error: msg,
    };
    createSecurityEventLogEntry({
      eventType: "switchbot_status_failed",
      source: "switchbot",
      message: msg,
      beforeMode: getSecurityState().mode,
      afterMode: getSecurityState().mode,
      metadata: { deviceId: id },
    });
    void dispatchSecurityEventNotification("switchbot_api_error", msg);
  }

  workerState.lastLockState = status.lockState;
  if (status.lockState === "unlocked") {
    workerState.lastUnlockAt = status.fetchedAt;
  }

  const normalized = status.lockState;
  const changed = lastKnownLockState !== null && lastKnownLockState !== normalized;

  if (changed) {
    if (lastLoggedLockState !== normalized) {
      recordLockStateTimeline(lastKnownLockState, normalized, status);
      lastLoggedLockState = normalized;
    }
    workerState.changeCount += 1;
    const result = await handleSwitchBotLockStatusChanged(status);
    lastKnownLockState = normalized;
    return { changed: true, status, state: result.state };
  }

  lastKnownLockState = normalized;
  return { changed: false, status, state: getSecurityState() };
}

export function resetSwitchBotBridgeState(): void {
  lastKnownLockState = null;
  lastLoggedLockState = null;
  workerState.lastPollAt = null;
  workerState.lastLockState = null;
  workerState.lastUnlockAt = null;
  workerState.lastError = null;
  workerState.pollCount = 0;
  workerState.changeCount = 0;
}
