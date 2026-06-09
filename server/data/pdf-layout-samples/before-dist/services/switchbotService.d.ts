import type { SwitchBotLockStatus } from "../security-automation/security-automation-types.js";
export type SwitchBotMode = "mock" | "dryRun" | "real";
export interface SwitchBotDevice {
    deviceId: string;
    deviceName: string;
    deviceType: string;
    hubDeviceId?: string;
}
export interface SwitchBotCommandResult {
    ok: boolean;
    mode: SwitchBotMode;
    dryRun: boolean;
    command: "lock" | "unlock";
    deviceId: string;
    message: string;
    statusCode?: number;
}
export interface SwitchBotDryRunVerifyResult {
    ok: boolean;
    mode: SwitchBotMode;
    deviceCount: number;
    lockState: SwitchBotLockStatus["lockState"] | null;
    message: string;
}
export declare function getSwitchBotMode(): SwitchBotMode;
export declare function resetSwitchBotMockState(state?: "locked" | "unlocked"): void;
export declare function getSwitchBotLastUnlockAt(): string | null;
/** 同期参照用 — mock/dryRun(無認証) のインメモリ状態 */
export declare function getSwitchBotLockStateSync(): "locked" | "unlocked" | "unknown";
export declare function hasSwitchBotCredentials(): boolean;
/** HMAC-SHA256 認証ヘッダー生成（token/secret はログに出さない） */
export declare function createSwitchBotAuthHeaders(): Record<string, string>;
export declare function getSwitchBotDevices(): Promise<{
    mode: SwitchBotMode;
    devices: SwitchBotDevice[];
}>;
export declare function getSwitchBotLockStatus(deviceId?: string): Promise<SwitchBotLockStatus>;
/** dryRun モード — API 接続確認のみ（施錠/解錠/警戒変更なし） */
export declare function verifySwitchBotDryRunConnection(): Promise<SwitchBotDryRunVerifyResult>;
export declare function sendSwitchBotLockCommand(deviceId: string, command: "lock" | "unlock", confirmed: boolean): Promise<SwitchBotCommandResult>;
export declare function lockSwitchBot(deviceId?: string, confirmed?: boolean): Promise<SwitchBotCommandResult>;
export declare function unlockSwitchBot(deviceId?: string, confirmed?: boolean): Promise<SwitchBotCommandResult>;
/** Release Gate — real unlock が confirmed guard なしで動くか検証用 */
export declare function isRealUnlockGuarded(): boolean;
