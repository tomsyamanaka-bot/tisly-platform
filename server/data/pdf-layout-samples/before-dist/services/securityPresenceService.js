/**
 * Phase 1321–1360 — Registered device presence for security automation
 */
import { config } from "../config.js";
import { getRegisteredDevices, getAutomationSettings, updateDevicePresenceInStore, upsertPresenceDevice, } from "../security-automation/security-automation-store.js";
import { getLockProvider } from "../providers/lock/index.js";
export { getRegisteredDevices };
export function updateDevicePresence(deviceId, status) {
    return updateDevicePresenceInStore(deviceId, status);
}
export function registerPresenceDevice(input) {
    return upsertPresenceDevice(input);
}
export function areAllRegisteredDevicesAway() {
    const devices = getRegisteredDevices().filter((d) => d.enabled);
    if (devices.length === 0)
        return true;
    return devices.every((d) => d.presenceStatus === "away");
}
export function isAnyRegisteredDeviceHome() {
    return getRegisteredDevices()
        .filter((d) => d.enabled)
        .some((d) => d.presenceStatus === "home");
}
export function hasUnknownRegisteredDevices() {
    return getRegisteredDevices()
        .filter((d) => d.enabled)
        .some((d) => d.presenceStatus === "unknown");
}
export function getPresenceSummary() {
    const devices = getRegisteredDevices();
    const enabled = devices.filter((d) => d.enabled);
    const home = enabled.filter((d) => d.presenceStatus === "home").length;
    const away = enabled.filter((d) => d.presenceStatus === "away").length;
    const unknown = enabled.filter((d) => d.presenceStatus === "unknown").length;
    return {
        total: devices.length,
        enabled: enabled.length,
        home,
        away,
        unknown,
        allAway: enabled.length > 0 && home === 0 && unknown === 0,
        anyHome: home > 0,
    };
}
export function getLastUnlockWithinSec() {
    const lastOp = getLockProvider().getLastOperation();
    if (!lastOp)
        return null;
    const lastUnlock = lastOp.operation === "unlock" ||
        lastOp.operation === "face_unlock" ||
        lastOp.operation === "fingerprint_unlock" ||
        lastOp.operation === "nfc_unlock" ||
        lastOp.operation === "manual_unlock"
        ? lastOp.at
        : null;
    if (!lastUnlock)
        return null;
    const sec = Math.floor((Date.now() - new Date(lastUnlock).getTime()) / 1000);
    return sec >= 0 ? sec : null;
}
/** 解錠直後のドア開放検知（Phase1341 mock — 将来センサー連携） */
export function isDoorOpenedAfterUnlock() {
    const within = getLastUnlockWithinSec();
    if (within === null)
        return false;
    return within < 60;
}
/** unknown 端末をポリシーに従って評価 */
export function evaluatePresenceForAutoArm(policy) {
    const devices = getRegisteredDevices().filter((d) => d.enabled);
    if (devices.length === 0) {
        return { canArm: true };
    }
    const hasHome = devices.some((d) => d.presenceStatus === "home");
    if (hasHome) {
        return { canArm: false, reason: "Auto arm blocked: device home" };
    }
    const hasUnknown = devices.some((d) => d.presenceStatus === "unknown");
    if (hasUnknown) {
        if (policy === "block_auto_arm") {
            return { canArm: false, reason: "Auto arm blocked: unknown device" };
        }
        if (policy === "unknown_as_home") {
            return { canArm: false, reason: "Auto arm blocked: unknown device (treated as home)" };
        }
    }
    const allAway = devices.every((d) => d.presenceStatus === "away" ||
        (d.presenceStatus === "unknown" && policy === "unknown_as_away"));
    if (!allAway) {
        return { canArm: false, reason: "Auto arm blocked: not all away" };
    }
    return { canArm: true };
}
/** 在宅判定ゲート — 警戒ON/OFF 条件チェックリスト */
export function evaluateSecurityArmGate(lockStatus) {
    const settings = getAutomationSettings();
    const provider = getLockProvider();
    const mode = provider.getMode?.() ?? "mock";
    const confirmed = mode === "mock" || mode === "dryRun" ? true : settings.realExecutionConfirmed;
    const lockState = lockStatus?.lockState ?? provider.getLockStateSync?.() ?? "unknown";
    const switchBotLocked = lockState === "locked";
    const switchBotUnlocked = lockState === "unlocked";
    const registeredDevicesAllAway = areAllRegisteredDevicesAway();
    const unknownDeviceDetected = hasUnknownRegisteredDevices();
    const lastUnlockWithinSec = getLastUnlockWithinSec();
    const doorOpenedAfterUnlock = isDoorOpenedAfterUnlock();
    const unlockCooldown = config.securityAutomation.unlockCooldownSec;
    const armReasons = [];
    const disarmReasons = [];
    if (!settings.switchbotIntegrationEnabled)
        armReasons.push("SwitchBot連携が無効");
    if (!settings.autoArmEnabled)
        armReasons.push("自動警戒ONが無効（AUTO_ARM=false）");
    if (!switchBotLocked)
        armReasons.push("SwitchBotが施錠されていない");
    if (!registeredDevicesAllAway)
        armReasons.push("登録端末が全不在ではない");
    if (unknownDeviceDetected)
        armReasons.push("unknown 端末が検出されている");
    if (settings.manualOverride)
        armReasons.push("手動オーバーライドが有効");
    if (!confirmed)
        armReasons.push("real 実行許可（confirmed）が未設定");
    // 施錠済みなら解錠クールダウン・ドア開放は適用しない（施錠後の警戒ONを妨げない）
    if (!switchBotLocked) {
        if (lastUnlockWithinSec !== null && lastUnlockWithinSec < unlockCooldown) {
            armReasons.push(`解錠後 ${lastUnlockWithinSec}秒 — クールダウン ${unlockCooldown}秒`);
        }
        if (doorOpenedAfterUnlock)
            armReasons.push("解錠後にドア開放を検知（mock）");
    }
    if (!settings.switchbotIntegrationEnabled)
        disarmReasons.push("SwitchBot連携が無効");
    if (!settings.autoDisarmEnabled)
        disarmReasons.push("自動警戒OFFが無効（AUTO_DISARM=false）");
    if (!switchBotUnlocked)
        disarmReasons.push("SwitchBotが解錠されていない");
    if (!confirmed)
        disarmReasons.push("real 実行許可（confirmed）が未設定");
    const canArm = armReasons.length === 0;
    const canDisarm = disarmReasons.length === 0;
    return {
        registeredDevicesAllAway,
        switchBotLocked,
        lastUnlockWithinSec,
        doorOpenedAfterUnlock,
        unknownDeviceDetected,
        manualOverride: settings.manualOverride,
        autoArmEnabled: settings.autoArmEnabled,
        autoDisarmEnabled: settings.autoDisarmEnabled,
        confirmed,
        switchbotIntegrationEnabled: settings.switchbotIntegrationEnabled,
        canArm,
        canDisarm,
        armReasons,
        disarmReasons,
    };
}
