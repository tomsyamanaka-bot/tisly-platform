/**
 * Phase 1361–1380 — Standalone mock lock provider (LOCK_PROVIDER=mock)
 */
import { config } from "../../config.js";
let mockLockState = "unlocked";
let lastOperation = null;
let lastOperator = null;
export class MockLockProvider {
    providerId = "mock";
    getStatus(deviceId) {
        const id = deviceId || config.switchbot.lockDeviceId || "mock-lock-001";
        return Promise.resolve({
            deviceId: id,
            lockState: mockLockState,
            battery: 92,
            provider: this.providerId,
            mode: "mock",
            fetchedAt: new Date().toISOString(),
        });
    }
    async lock(deviceId, _confirmed = false) {
        const id = deviceId || config.switchbot.lockDeviceId || "mock-lock-001";
        mockLockState = "locked";
        const now = new Date().toISOString();
        lastOperation = { operation: "lock", at: now };
        lastOperator = { userName: "Mock Operator" };
        return {
            ok: true,
            command: "lock",
            deviceId: id,
            provider: this.providerId,
            message: "Mock lock executed",
            mode: "mock",
        };
    }
    async unlock(deviceId, _confirmed = false) {
        const id = deviceId || config.switchbot.lockDeviceId || "mock-lock-001";
        mockLockState = "unlocked";
        const now = new Date().toISOString();
        lastOperation = { operation: "unlock", at: now };
        lastOperator = { userName: "Mock Operator" };
        return {
            ok: true,
            command: "unlock",
            deviceId: id,
            provider: this.providerId,
            message: "Mock unlock executed",
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
        return false;
    }
    supportsNfc() {
        return false;
    }
    getLockStateSync() {
        return mockLockState;
    }
    getMode() {
        return "mock";
    }
    resetMockState(state = "unlocked") {
        mockLockState = state;
        if (state === "unlocked") {
            lastOperation = { operation: "unlock", at: new Date().toISOString() };
        }
    }
}
