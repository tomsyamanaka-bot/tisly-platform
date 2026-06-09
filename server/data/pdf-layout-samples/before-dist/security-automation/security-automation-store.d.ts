import type { RegisteredPresenceDevice, SecurityAutomationRule, SecurityAutomationSettings, SecurityEventLog, SecurityMode, SecuritySource, SecurityState } from "./security-automation-types.js";
export declare function ensureSecurityAutomationSeed(): void;
export declare function getSecurityState(): SecurityState;
export declare function saveSecurityState(mode: SecurityMode, reason: string, source: SecuritySource, changedBy: string): SecurityState;
export declare function createSecurityEventLogEntry(event: Omit<SecurityEventLog, "id" | "createdAt">): SecurityEventLog | null;
export declare function listSecurityEventLogs(limit?: number): SecurityEventLog[];
export declare function getRegisteredDevices(): RegisteredPresenceDevice[];
export declare function upsertPresenceDevice(input: Partial<RegisteredPresenceDevice> & {
    name: string;
    type: RegisteredPresenceDevice["type"];
}): RegisteredPresenceDevice;
export declare function updateDevicePresenceInStore(deviceId: string, status: RegisteredPresenceDevice["presenceStatus"]): RegisteredPresenceDevice | null;
export declare function getAutomationRules(): SecurityAutomationRule[];
export declare function updateAutomationRule(id: string, patch: Partial<SecurityAutomationRule>): SecurityAutomationRule | null;
export declare function getAutomationSettings(): SecurityAutomationSettings;
export declare function saveAutomationSettings(settings: Partial<SecurityAutomationSettings>): SecurityAutomationSettings;
/** テスト用 — pending arm タイマーを即時実行できるよう公開 */
export declare function resetSecurityAutomationForTests(): void;
