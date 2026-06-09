import { getRegisteredDevices } from "../security-automation/security-automation-store.js";
import type { PresenceStatus, PresenceSummary, RegisteredPresenceDevice, SecurityArmGateCheck, SwitchBotLockStatus } from "../security-automation/security-automation-types.js";
export { getRegisteredDevices };
export declare function updateDevicePresence(deviceId: string, status: PresenceStatus): RegisteredPresenceDevice | null;
export declare function registerPresenceDevice(input: Partial<RegisteredPresenceDevice> & {
    name: string;
    type: RegisteredPresenceDevice["type"];
}): RegisteredPresenceDevice;
export declare function areAllRegisteredDevicesAway(): boolean;
export declare function isAnyRegisteredDeviceHome(): boolean;
export declare function hasUnknownRegisteredDevices(): boolean;
export declare function getPresenceSummary(): PresenceSummary;
export declare function getLastUnlockWithinSec(): number | null;
/** 解錠直後のドア開放検知（Phase1341 mock — 将来センサー連携） */
export declare function isDoorOpenedAfterUnlock(): boolean;
/** unknown 端末をポリシーに従って評価 */
export declare function evaluatePresenceForAutoArm(policy: "block_auto_arm" | "unknown_as_away" | "unknown_as_home"): {
    canArm: boolean;
    reason?: string;
};
/** 在宅判定ゲート — 警戒ON/OFF 条件チェックリスト */
export declare function evaluateSecurityArmGate(lockStatus?: SwitchBotLockStatus): SecurityArmGateCheck;
