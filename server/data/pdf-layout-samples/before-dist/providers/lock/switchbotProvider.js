/**
 * Phase 1361–1380 — SwitchBot LockProvider implementation
 */
import { getSwitchBotLastUnlockAt, getSwitchBotLockStateSync, getSwitchBotLockStatus, getSwitchBotMode, isRealUnlockGuarded, lockSwitchBot, resetSwitchBotMockState, unlockSwitchBot, } from "../../services/switchbotService.js";
export class SwitchBotLockProvider {
    providerId = "switchbot";
    async getStatus(deviceId) {
        const raw = await getSwitchBotLockStatus(deviceId);
        return {
            deviceId: raw.deviceId,
            lockState: raw.lockState,
            battery: raw.battery,
            provider: this.providerId,
            mode: raw.mode,
            fetchedAt: raw.fetchedAt,
            error: raw.error,
        };
    }
    async lock(deviceId, confirmed = false) {
        const raw = await lockSwitchBot(deviceId, confirmed);
        return {
            ok: raw.ok,
            command: raw.command,
            deviceId: raw.deviceId,
            provider: this.providerId,
            message: raw.message,
            dryRun: raw.dryRun,
            mode: raw.mode,
            statusCode: raw.statusCode,
        };
    }
    async unlock(deviceId, confirmed = false) {
        const raw = await unlockSwitchBot(deviceId, confirmed);
        return {
            ok: raw.ok,
            command: raw.command,
            deviceId: raw.deviceId,
            provider: this.providerId,
            message: raw.message,
            dryRun: raw.dryRun,
            mode: raw.mode,
            statusCode: raw.statusCode,
        };
    }
    async getBattery(deviceId) {
        const status = await this.getStatus(deviceId);
        return status.battery ?? null;
    }
    getLastOperation() {
        const at = getSwitchBotLastUnlockAt();
        if (!at)
            return null;
        const state = getSwitchBotLockStateSync();
        return {
            operation: state === "locked" ? "lock" : "unlock",
            at,
        };
    }
    getLastOperator() {
        return null;
    }
    supportsRemoteUnlock() {
        return true;
    }
    supportsFaceRecognition() {
        return false;
    }
    supportsFingerprint() {
        return false;
    }
    supportsNfc() {
        return false;
    }
    getLockStateSync() {
        return getSwitchBotLockStateSync();
    }
    getMode() {
        return getSwitchBotMode();
    }
    resetMockState(state = "unlocked") {
        resetSwitchBotMockState(state);
    }
    isRealCommandGuarded() {
        return isRealUnlockGuarded();
    }
}
