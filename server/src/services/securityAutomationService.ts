/**
 * Phase 1321–1340 — TiSLY security state & automation engine
 */
import {
  createSecurityEventLogEntry,
  getAutomationRules,
  getAutomationSettings,
  getSecurityState as loadSecurityState,
  listSecurityEventLogs,
  saveSecurityState,
  updateAutomationRule,
} from "../security-automation/security-automation-store.js";
import type {
  SecurityAutomationRule,
  SecurityEventLog,
  SecurityMode,
  SecuritySource,
  SecurityState,
  SwitchBotLockStatus,
} from "../security-automation/security-automation-types.js";
import { evaluatePresenceForAutoArm } from "./securityPresenceService.js";

export { listSecurityEventLogs, getAutomationRules, updateAutomationRule, getAutomationSettings };

let pendingArmTimer: ReturnType<typeof setTimeout> | null = null;
let pendingArmStartedAt: string | null = null;

export function getSecurityState(): SecurityState {
  return loadSecurityState();
}

export function setSecurityMode(
  mode: SecurityMode,
  reason: string,
  source: SecuritySource,
  changedBy = "system"
): SecurityState {
  const before = loadSecurityState();
  const after = saveSecurityState(mode, reason, source, changedBy);
  createSecurityEventLogEntry({
    eventType: "security_mode_changed",
    source,
    message: reason,
    beforeMode: before.mode,
    afterMode: after.mode,
    metadata: { changedBy },
  });
  return after;
}

export function createSecurityEventLog(
  event: Omit<SecurityEventLog, "id" | "createdAt">
): SecurityEventLog {
  return createSecurityEventLogEntry(event);
}

export function clearPendingArmTimer(): void {
  if (pendingArmTimer) {
    clearTimeout(pendingArmTimer);
    pendingArmTimer = null;
  }
  pendingArmStartedAt = null;
}

export function evaluateSwitchBotLockedEvent(lockStatus: SwitchBotLockStatus): SecurityState {
  const settings = getAutomationSettings();
  const before = loadSecurityState();

  createSecurityEventLogEntry({
    eventType: "switchbot_locked",
    source: "switchbot",
    message: "SwitchBot locked received",
    beforeMode: before.mode,
    afterMode: before.mode,
    metadata: { lockStatus },
  });

  if (!settings.switchbotIntegrationEnabled || !settings.autoArmEnabled) {
    return before;
  }

  const lockedRule = getAutomationRules().find(
    (r) => r.enabled && r.triggerType === "switchbot_locked"
  );
  const policy = lockedRule?.unknownDevicePolicy ?? settings.unknownDevicePolicy;
  const delaySeconds = lockedRule?.delaySeconds ?? settings.delaySeconds;

  const presenceCheck = evaluatePresenceForAutoArm(policy);
  if (!presenceCheck.canArm) {
    createSecurityEventLogEntry({
      eventType: "auto_arm_blocked",
      source: "presence",
      message: presenceCheck.reason ?? "Auto arm blocked",
      beforeMode: before.mode,
      afterMode: before.mode,
      metadata: { policy },
    });
    return before;
  }

  const pending = setSecurityMode(
    "pending_arm",
    "Pending arm started — waiting for all-away confirmation",
    "switchbot",
    "automation"
  );
  createSecurityEventLogEntry({
    eventType: "pending_arm_started",
    source: "switchbot",
    message: "Pending arm started",
    beforeMode: before.mode,
    afterMode: "pending_arm",
    metadata: { delaySeconds },
  });

  clearPendingArmTimer();
  pendingArmStartedAt = new Date().toISOString();
  pendingArmTimer = setTimeout(() => {
    confirmPendingArmCheck();
  }, delaySeconds * 1000);

  return pending;
}

export function confirmPendingArmCheck(): SecurityState {
  const settings = getAutomationSettings();
  const current = loadSecurityState();

  if (current.mode !== "pending_arm") {
    return current;
  }

  const lockedRule = getAutomationRules().find(
    (r) => r.enabled && r.triggerType === "switchbot_locked"
  );
  const policy = lockedRule?.unknownDevicePolicy ?? settings.unknownDevicePolicy;
  const presenceCheck = evaluatePresenceForAutoArm(policy);

  clearPendingArmTimer();

  if (!presenceCheck.canArm) {
    createSecurityEventLogEntry({
      eventType: "auto_arm_blocked",
      source: "presence",
      message: presenceCheck.reason ?? "Auto arm blocked after delay",
      beforeMode: "pending_arm",
      afterMode: "pending_arm",
      metadata: { pendingArmStartedAt, policy },
    });
    return setSecurityMode(
      "disarmed",
      presenceCheck.reason ?? "Auto arm cancelled — presence changed",
      "presence",
      "automation"
    );
  }

  createSecurityEventLogEntry({
    eventType: "auto_armed",
    source: "switchbot",
    message: "Auto armed by SwitchBot locked + all away",
    beforeMode: "pending_arm",
    afterMode: "armed",
    metadata: { pendingArmStartedAt },
  });
  return setSecurityMode(
    "armed",
    "Auto armed by SwitchBot locked + all away",
    "switchbot",
    "automation"
  );
}

export function startPendingArmCheck(): { started: boolean; delaySeconds: number } {
  const settings = getAutomationSettings();
  const lockedRule = getAutomationRules().find(
    (r) => r.enabled && r.triggerType === "switchbot_locked"
  );
  const delaySeconds = lockedRule?.delaySeconds ?? settings.delaySeconds;
  clearPendingArmTimer();
  pendingArmStartedAt = new Date().toISOString();
  pendingArmTimer = setTimeout(() => confirmPendingArmCheck(), delaySeconds * 1000);
  return { started: true, delaySeconds };
}

export function evaluateSwitchBotUnlockedEvent(lockStatus: SwitchBotLockStatus): SecurityState {
  const settings = getAutomationSettings();
  const before = loadSecurityState();

  createSecurityEventLogEntry({
    eventType: "switchbot_unlocked",
    source: "switchbot",
    message: "SwitchBot unlocked received",
    beforeMode: before.mode,
    afterMode: before.mode,
    metadata: { lockStatus },
  });

  clearPendingArmTimer();

  if (!settings.switchbotIntegrationEnabled || !settings.autoDisarmEnabled) {
    return before;
  }

  createSecurityEventLogEntry({
    eventType: "auto_disarmed",
    source: "switchbot",
    message: "Auto disarmed by SwitchBot unlocked",
    beforeMode: before.mode,
    afterMode: "disarmed",
    metadata: {},
  });
  return setSecurityMode("disarmed", "SwitchBot unlocked", "switchbot", "automation");
}

/** Wi-Fi 在宅のみでは解除しない — presence 変更は armed 状態を変えない */
export function evaluatePresenceOnlyChange(_deviceId: string, _status: string): SecurityState {
  return loadSecurityState();
}

export function getLastSecurityEventLog(): SecurityEventLog | null {
  const logs = listSecurityEventLogs(1);
  return logs[0] ?? null;
}
