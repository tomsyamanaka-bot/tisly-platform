import type { LockCommandResult, LockLastOperation, LockOperator, LockProvider, LockState, LockStatus } from "./types.js";
/** SESAME API 接続は Phase1381+ で実装予定 */
export declare class SesameLockProvider implements LockProvider {
    readonly providerId: "sesame";
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
    setLastOperator(op: LockOperator): void;
    setLastOperation(op: LockLastOperation): void;
    resetPlaceholderState(state?: "locked" | "unlocked"): void;
}
