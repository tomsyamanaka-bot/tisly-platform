import type { LockCommandResult, LockLastOperation, LockOperator, LockProvider, LockState, LockStatus } from "./types.js";
export declare class SwitchBotLockProvider implements LockProvider {
    readonly providerId: "switchbot";
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
    getLockStateSync(): LockState;
    getMode(): "mock" | "dryRun" | "real";
    resetMockState(state?: "locked" | "unlocked"): void;
    isRealCommandGuarded(): boolean;
}
