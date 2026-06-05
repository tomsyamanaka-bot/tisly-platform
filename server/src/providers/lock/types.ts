/**
 * Phase 1361–1380 — Lock Provider abstraction types
 */

export type LockProviderId = "switchbot" | "sesame" | "mock";

export type LockState = "locked" | "unlocked" | "unknown" | "offline";

export type LockEventType =
  | "lock"
  | "unlock"
  | "face_unlock"
  | "fingerprint_unlock"
  | "nfc_unlock"
  | "manual_unlock"
  | "unknown";

export type LockUserRole = "adult" | "child" | "guest";

export interface LockStatus {
  deviceId: string;
  lockState: LockState;
  battery?: number;
  provider: LockProviderId;
  mode?: "mock" | "dryRun" | "real";
  fetchedAt: string;
  error?: string;
}

export interface LockCommandResult {
  ok: boolean;
  command: "lock" | "unlock";
  deviceId: string;
  provider: LockProviderId;
  message: string;
  dryRun?: boolean;
  mode?: "mock" | "dryRun" | "real";
  statusCode?: number;
}

export interface LockLastOperation {
  operation: LockEventType;
  at: string;
  operatorId?: string;
  operatorName?: string;
  method?: string;
}

export interface LockOperator {
  userId?: string;
  userName?: string;
  role?: LockUserRole;
}

/** 将来 SESAME Face / SwitchBot / その他へ差し替え可能な契約 */
export interface LockProvider {
  readonly providerId: LockProviderId;
  getStatus(deviceId?: string): Promise<LockStatus>;
  lock(deviceId?: string, confirmed?: boolean): Promise<LockCommandResult>;
  unlock(deviceId?: string, confirmed?: boolean): Promise<LockCommandResult>;
  getBattery(deviceId?: string): Promise<number | null>;
  getLastOperation(): LockLastOperation | null;
  getLastOperator(): LockOperator | null;
  supportsRemoteUnlock(): boolean;
  supportsFaceRecognition(): boolean;
  supportsFingerprint(): boolean;
  supportsNfc(): boolean;
  /** 同期参照 — mock/dryRun 用 */
  getLockStateSync?(): LockState;
  getMode?(): "mock" | "dryRun" | "real";
  resetMockState?(state: "locked" | "unlocked"): void;
}

export interface LockUser {
  id: string;
  name: string;
  role: LockUserRole;
  enabled: boolean;
  notificationEnabled: boolean;
  createdAt: string;
}

export interface LockEvent {
  id: string;
  provider: LockProviderId;
  deviceId: string;
  eventType: LockEventType;
  userId: string | null;
  userName: string | null;
  success: boolean;
  createdAt: string;
}

export interface PresenceUser {
  id: string;
  name: string;
  deviceIds: string[];
  role: LockUserRole;
  notificationEnabled: boolean;
}

export type FamilyNotificationKind =
  | "child_arrived_home"
  | "child_left_home"
  | "guest_unlock"
  | "unknown_unlock";

export interface FamilyNotificationRecord {
  id: string;
  kind: FamilyNotificationKind;
  userName: string;
  provider: LockProviderId;
  method: string;
  message: string;
  createdAt: string;
}
