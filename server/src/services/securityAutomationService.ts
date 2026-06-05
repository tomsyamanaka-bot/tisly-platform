/**
 * Phase 1321–1360 — TiSLY security state & automation engine
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
import { dispatchSecurityEventNotification } from "../security-automation/security-notifications.js";
import { evaluatePresenceForAutoArm, evaluateSecurityArmGate } from "./securityPresenceService.js";
import { config } from "../config.js";
import { getSwitchBotMode } from "./switchbotService.js";

export { listSecurityEventLogs, getAutomationRules, updateAutomationRule, getAutomationSettings };
export { evaluateSecurityArmGate } from "./securityPresenceService.js";

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
): SecurityEventLog | null {
  return createSecurityEventLogEntry(event);
}

export function clearPendingArmTimer(): void {
  if (pendingArmTimer) {
    clearTimeout(pendingArmTimer);
    pendingArmTimer = null;
  }
  pendingArmStartedAt = null;
}

function isRealModeConfirmed(): boolean {
  const mode = getSwitchBotMode();
  if (mode !== "real") return true;
  return getAutomationSettings().realExecutionConfirmed;
}

export function evaluateSwitchBotLockedEvent(lockStatus: SwitchBotLockStatus): SecurityState {
  const settings = getAutomationSettings();
  const before = loadSecurityState();
  const gate = evaluateSecurityArmGate(lockStatus);

  createSecurityEventLogEntry({
    eventType: "switchbot_locked",
    source: "switchbot",
    message: "SwitchBot locked received",
    beforeMode: before.mode,
    afterMode: before.mode,
    metadata: { lockStatus, gate },
  });
  void dispatchSecurityEventNotification("switchbot_locked", "SwitchBot が施錠されました");

  if (!settings.switchbotIntegrationEnabled || !settings.autoArmEnabled) {
    createSecurityEventLogEntry({
      eventType: "auto_arm_skipped",
      source: "switchbot",
      message: "Auto arm skipped — integration or AUTO_ARM disabled",
      beforeMode: before.mode,
      afterMode: before.mode,
      metadata: { gate },
    });
    void dispatchSecurityEventNotification("auto_arm_skipped", "自動警戒ONをスキップ（AUTO_ARM無効）");
    return before;
  }

  if (!isRealModeConfirmed()) {
    createSecurityEventLogEntry({
      eventType: "real_command_rejected",
      source: "switchbot",
      message: "Auto arm rejected — real mode requires confirmed=true",
      beforeMode: before.mode,
      afterMode: before.mode,
      metadata: { gate },
    });
    void dispatchSecurityEventNotification(
      "real_command_rejected",
      "real モード — confirmed 未設定のため自動警戒ONを拒否"
    );
    return before;
  }

  const lockedRule = getAutomationRules().find(
    (r) => r.enabled && r.triggerType === "switchbot_locked"
  );
  const policy = lockedRule?.unknownDevicePolicy ?? settings.unknownDevicePolicy;
  const delaySeconds = lockedRule?.delaySeconds ?? settings.delaySeconds;

  const presenceCheck = evaluatePresenceForAutoArm(policy);
  if (!presenceCheck.canArm || !gate.canArm) {
    const reason =
      presenceCheck.reason ?? gate.armReasons.join("; ") ?? "Auto arm blocked";
    const eventType = gate.unknownDeviceDetected
      ? "unknown_device_blocked"
      : "auto_arm_blocked";
    createSecurityEventLogEntry({
      eventType: presenceCheck.canArm ? eventType : "auto_arm_blocked",
      source: "presence",
      message: reason,
      beforeMode: before.mode,
      afterMode: before.mode,
      metadata: { policy, gate },
    });
    if (gate.unknownDeviceDetected) {
      void dispatchSecurityEventNotification(
        "unknown_device_blocked",
        "unknown 端末により自動警戒ONをブロック"
      );
    } else {
      void dispatchSecurityEventNotification("auto_arm_skipped", reason);
    }
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
    metadata: { delaySeconds, gate },
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
  // pending_arm は施錠イベント起点 — 遅延後の再評価でも施錠前提
  const gate = evaluateSecurityArmGate({
    deviceId: config.switchbot.lockDeviceId || "mock-lock-001",
    lockState: "locked",
    mode: getSwitchBotMode(),
    fetchedAt: new Date().toISOString(),
  });

  clearPendingArmTimer();

  if (!presenceCheck.canArm || !gate.canArm) {
    const reason = presenceCheck.reason ?? gate.armReasons.join("; ") ?? "Auto arm blocked after delay";
    createSecurityEventLogEntry({
      eventType: "auto_arm_blocked",
      source: "presence",
      message: reason,
      beforeMode: "pending_arm",
      afterMode: "pending_arm",
      metadata: { pendingArmStartedAt, policy, gate },
    });
    void dispatchSecurityEventNotification("auto_arm_skipped", reason);
    return setSecurityMode(
      "disarmed",
      reason,
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
    metadata: { pendingArmStartedAt, gate },
  });
  void dispatchSecurityEventNotification("security_armed", "自動警戒ONが完了しました");
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
  const gate = evaluateSecurityArmGate(lockStatus);

  createSecurityEventLogEntry({
    eventType: "switchbot_unlocked",
    source: "switchbot",
    message: "SwitchBot unlocked received",
    beforeMode: before.mode,
    afterMode: before.mode,
    metadata: { lockStatus, gate },
  });
  void dispatchSecurityEventNotification("switchbot_unlocked", "SwitchBot が解錠されました");

  clearPendingArmTimer();

  if (!settings.switchbotIntegrationEnabled || !settings.autoDisarmEnabled) {
    createSecurityEventLogEntry({
      eventType: "auto_disarm_skipped",
      source: "switchbot",
      message: "Auto disarm skipped — integration or AUTO_DISARM disabled",
      beforeMode: before.mode,
      afterMode: before.mode,
      metadata: { gate },
    });
    void dispatchSecurityEventNotification("auto_disarm_skipped", "自動警戒OFFをスキップ（AUTO_DISARM無効）");
    return before;
  }

  if (!isRealModeConfirmed()) {
    createSecurityEventLogEntry({
      eventType: "real_command_rejected",
      source: "switchbot",
      message: "Auto disarm rejected — real mode requires confirmed=true",
      beforeMode: before.mode,
      afterMode: before.mode,
      metadata: { gate },
    });
    void dispatchSecurityEventNotification(
      "real_command_rejected",
      "real モード — confirmed 未設定のため自動警戒OFFを拒否"
    );
    return before;
  }

  if (!gate.canDisarm) {
    createSecurityEventLogEntry({
      eventType: "auto_disarm_skipped",
      source: "switchbot",
      message: gate.disarmReasons.join("; ") || "Auto disarm skipped",
      beforeMode: before.mode,
      afterMode: before.mode,
      metadata: { gate },
    });
    void dispatchSecurityEventNotification(
      "auto_disarm_skipped",
      gate.disarmReasons.join("; ") || "自動警戒OFFをスキップ"
    );
    return before;
  }

  createSecurityEventLogEntry({
    eventType: "auto_disarmed",
    source: "switchbot",
    message: "Auto disarmed by SwitchBot unlocked",
    beforeMode: before.mode,
    afterMode: "disarmed",
    metadata: { gate },
  });
  void dispatchSecurityEventNotification("security_disarmed", "自動警戒OFFが完了しました");
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
