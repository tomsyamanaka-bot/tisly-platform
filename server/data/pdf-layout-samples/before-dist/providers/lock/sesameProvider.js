/**
 * Phase 1361–1380 — SESAME / SESAME Face placeholder provider
 */
import { config } from "../../config.js";
let placeholderState = "locked";
let lastOperation = null;
let lastOperator = null;
/** SESAME API 接続は Phase1381+ で実装予定 */
export class SesameLockProvider {
    providerId = "sesame";
    getStatus(deviceId) {
        const id = deviceId || config.switchbot.lockDeviceId || "sesame-lock-001";
        return Promise.resolve({
            deviceId: id,
            lockState: placeholderState,
            battery: 78,
            provider: this.providerId,
            mode: "mock",
            fetchedAt: new Date().toISOString(),
            error: undefined,
        });
    }
    async lock(deviceId, _confirmed = false) {
        const id = deviceId || config.switchbot.lockDeviceId || "sesame-lock-001";
        placeholderState = "locked";
        const now = new Date().toISOString();
        lastOperation = { operation: "lock", at: now };
        return {
            ok: true,
            command: "lock",
            deviceId: id,
            provider: this.providerId,
            message: "[SESAME placeholder] lock simulated",
            mode: "mock",
        };
    }
    async unlock(deviceId, _confirmed = false) {
        const id = deviceId || config.switchbot.lockDeviceId || "sesame-lock-001";
        placeholderState = "unlocked";
        const now = new Date().toISOString();
        lastOperation = { operation: "face_unlock", at: now, method: "SESAME Face" };
        return {
            ok: true,
            command: "unlock",
            deviceId: id,
            provider: this.providerId,
            message: "[SESAME placeholder] unlock simulated",
            mode: "mock",
        };
    }
    async getBattery(deviceId) {
        const status = await this.getStatus(deviceId);
        return status.battery ?? null;
    }
    getLastOperation() {
        return lastOperation;
    }
    getLastOperator() {
        return lastOperator;
    }
    supportsRemoteUnlock() {
        return true;
    }
    supportsFaceRecognition() {
        return true;
    }
    supportsFingerprint() {
        return true;
    }
    supportsNfc() {
        return true;
    }
    getLockStateSync() {
        return placeholderState;
    }
    getMode() {
        return "mock";
    }
    setLastOperator(op) {
        lastOperator = op;
    }
    setLastOperation(op) {
        lastOperation = op;
    }
    resetPlaceholderState(state = "locked") {
        placeholderState = state;
    }
}
