import type { LockCommandResult, LockLastOperation, LockOperator, LockProvider, LockState, LockStatus } from "./types.js";
export declare class MockLockProvider implements LockProvider {
    readonly providerId: "mock";
    getStatus(deviceId?: string): Promise<LockStatus>;
    lock(deviceId?: string, _confirmed?: boolean): Promise<LockCommandResult>;
    unlock(deviceId?: string, _confirmed?: boolean): Promise<LockCommandResult>;
    getBattery(deviceId?: string): Promise<number | null>;
    getLastOperation(): LockLastOperation | null;
    getLastOperator(): LockOperator | null;
    supportsRemoteUnlock(): boolean;
    supportsFaceRecognition(): boolean;
    supportsFingerprint(): boolean;
    supportsNfc(): boolean;
    getLockStateSync(): LockState;
    getMode(): "mock";
    resetMockState(state?: "locked" | "unlocked"): void;
}
