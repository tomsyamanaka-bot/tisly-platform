/**
 * Phase 1321–1360 — TiSLY security state & automation engine
 */
import { getAutomationRules, getAutomationSettings, listSecurityEventLogs, updateAutomationRule } from "../security-automation/security-automation-store.js";
import type { SecurityEventLog, SecurityMode, SecuritySource, SecurityState, SwitchBotLockStatus } from "../security-automation/security-automation-types.js";
export { listSecurityEventLogs, getAutomationRules, updateAutomationRule, getAutomationSettings };
export { evaluateSecurityArmGate } from "./securityPresenceService.js";
export declare function getSecurityState(): SecurityState;
export declare function setSecurityMode(mode: SecurityMode, reason: string, source: SecuritySource, changedBy?: string): SecurityState;
export declare function createSecurityEventLog(event: Omit<SecurityEventLog, "id" | "createdAt">): SecurityEventLog | null;
export declare function clearPendingArmTimer(): void;
export declare function evaluateSwitchBotLockedEvent(lockStatus: SwitchBotLockStatus): SecurityState;
export declare function confirmPendingArmCheck(): SecurityState;
export declare function startPendingArmCheck(): {
    started: boolean;
    delaySeconds: number;
};
export declare function evaluateSwitchBotUnlockedEvent(lockStatus: SwitchBotLockStatus): SecurityState;
/** Wi-Fi 在宅のみでは解除しない — presence 変更は armed 状態を変えない */
export declare function evaluatePresenceOnlyChange(_deviceId: string, _status: string): SecurityState;
export declare function getLastSecurityEventLog(): SecurityEventLog | null;
