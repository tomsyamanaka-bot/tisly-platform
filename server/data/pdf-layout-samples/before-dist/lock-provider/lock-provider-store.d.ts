import type { FamilyNotificationKind, FamilyNotificationRecord, LockEvent, LockEventType, LockProviderId, LockUser, PresenceUser } from "../providers/lock/types.js";
export declare function ensureLockProviderSeed(): void;
export declare function listLockUsers(): LockUser[];
export declare function getLockUserByName(name: string): LockUser | null;
export declare function listPresenceUsers(): PresenceUser[];
export declare function createLockEvent(input: {
    provider: LockProviderId;
    deviceId: string;
    eventType: LockEventType;
    userId?: string | null;
    userName?: string | null;
    success?: boolean;
}): LockEvent;
export declare function listLockEvents(limit?: number): LockEvent[];
export declare function listFaceLockEvents(limit?: number): LockEvent[];
export declare function createFamilyNotification(input: {
    kind: FamilyNotificationKind;
    userName: string;
    provider: LockProviderId;
    method: string;
    message: string;
}): FamilyNotificationRecord;
export declare function listFamilyNotifications(limit?: number): FamilyNotificationRecord[];
export declare function listChildArrivalNotifications(limit?: number): FamilyNotificationRecord[];
export declare function resetLockProviderStoreForTests(): void;
