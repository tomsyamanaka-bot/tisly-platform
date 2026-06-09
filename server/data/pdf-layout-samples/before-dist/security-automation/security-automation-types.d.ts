/**
 * Phase 1321–1360 — TiSLY Security Automation types
 */
export type SecurityMode = "armed" | "disarmed" | "pending_arm" | "pending_disarm";
export type SecuritySource = "manual" | "switchbot" | "presence" | "system";
export type PresenceDeviceType = "iphone" | "android" | "tablet" | "pc" | "other";
export type PresenceStatus = "home" | "away" | "unknown";
export type AutomationTriggerType = "switchbot_locked" | "switchbot_unlocked";
export type RequiredPresence = "all_away" | "ignore";
export type AutomationAction = "arm" | "disarm" | "create_candidate";
export type UnknownDevicePolicy = "block_auto_arm" | "unknown_as_away" | "unknown_as_home";
export interface SecurityState {
    id: string;
    mode: SecurityMode;
    reason: string;
    source: SecuritySource;
    lastChangedAt: string;
    lastChangedBy: string;
}
export interface RegisteredPresenceDevice {
    id: string;
    name: string;
    type: PresenceDeviceType;
    ownerName: string;
    macAddress?: string;
    ipAddress?: string;
    enabled: boolean;
    lastSeenAt: string | null;
    presenceStatus: PresenceStatus;
}
export interface SecurityAutomationRule {
    id: string;
    name: string;
    enabled: boolean;
    triggerType: AutomationTriggerType;
    requiredPresence: RequiredPresence;
    action: AutomationAction;
    delaySeconds: number;
    unknownDevicePolicy: UnknownDevicePolicy;
    requireConfirmation: boolean;
}
export interface SecurityEventLog {
    id: string;
    eventType: string;
    source: SecuritySource;
    message: string;
    beforeMode: SecurityMode | null;
    afterMode: SecurityMode | null;
    metadata: Record<string, unknown>;
    createdAt: string;
}
export interface PresenceSummary {
    total: number;
    enabled: number;
    home: number;
    away: number;
    unknown: number;
    allAway: boolean;
    anyHome: boolean;
}
export type SwitchBotLockState = "locked" | "unlocked" | "unknown" | "offline";
export interface SwitchBotLockStatus {
    deviceId: string;
    lockState: SwitchBotLockState;
    battery?: number;
    mode: "mock" | "dryRun" | "real";
    fetchedAt: string;
    error?: string;
}
export interface SecurityAutomationSettings {
    switchbotIntegrationEnabled: boolean;
    autoArmEnabled: boolean;
    autoDisarmEnabled: boolean;
    delaySeconds: number;
    unknownDevicePolicy: UnknownDevicePolicy;
    /** 手動オーバーライド — true の間は自動警戒ONをブロック */
    manualOverride: boolean;
    /** real モードで自動警戒を許可するか（UI で明示確認後のみ true） */
    realExecutionConfirmed: boolean;
}
/** 在宅判定ゲート — 警戒ON条件チェックリスト */
export interface SecurityArmGateCheck {
    registeredDevicesAllAway: boolean;
    switchBotLocked: boolean;
    lastUnlockWithinSec: number | null;
    doorOpenedAfterUnlock: boolean;
    unknownDeviceDetected: boolean;
    manualOverride: boolean;
    autoArmEnabled: boolean;
    autoDisarmEnabled: boolean;
    confirmed: boolean;
    switchbotIntegrationEnabled: boolean;
    canArm: boolean;
    canDisarm: boolean;
    armReasons: string[];
    disarmReasons: string[];
}
export interface SwitchBotBridgeWorkerState {
    lastPollAt: string | null;
    lastLockState: SwitchBotLockState | null;
    lastUnlockAt: string | null;
    lastError: string | null;
    pollCount: number;
    changeCount: number;
}
