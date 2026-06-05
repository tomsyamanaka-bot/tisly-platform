/**
 * Phase 1321–1340 — TiSLY Security Automation types
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

export interface SwitchBotLockStatus {
  deviceId: string;
  lockState: "locked" | "unlocked" | "unknown";
  battery?: number;
  mode: "mock" | "dryRun" | "real";
  fetchedAt: string;
}

export interface SecurityAutomationSettings {
  switchbotIntegrationEnabled: boolean;
  autoArmEnabled: boolean;
  autoDisarmEnabled: boolean;
  delaySeconds: number;
  unknownDevicePolicy: UnknownDevicePolicy;
}
