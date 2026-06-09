/**
 * Phase 1361–1380 — Lock event recording & mock generation
 */
import { config } from "../config.js";
import { createLockEvent, getLockUserByName, listLockEvents, listFaceLockEvents, } from "../lock-provider/lock-provider-store.js";
import { getLockProvider } from "../providers/lock/index.js";
import { handleSwitchBotLocked, handleSwitchBotUnlocked } from "./switchBotSecurityBridge.js";
import { processFamilyUnlockEvent } from "./familyPresenceService.js";
export { listLockEvents, listFaceLockEvents };
export function recordLockProviderEvent(input) {
    const provider = getLockProvider();
    const deviceId = input.deviceId || config.switchbot.lockDeviceId || "lock-001";
    const event = createLockEvent({
        provider: provider.providerId,
        deviceId,
        eventType: input.eventType,
        userId: input.userId,
        userName: input.userName,
        success: input.success,
    });
    if (input.eventType === "unlock" ||
        input.eventType === "face_unlock" ||
        input.eventType === "fingerprint_unlock" ||
        input.eventType === "nfc_unlock" ||
        input.eventType === "manual_unlock") {
        processFamilyUnlockEvent(event);
        handleSwitchBotUnlocked({
            deviceId,
            lockState: "unlocked",
            mode: provider.getMode?.() ?? "mock",
            fetchedAt: event.createdAt,
        });
    }
    else if (input.eventType === "lock") {
        handleSwitchBotLocked({
            deviceId,
            lockState: "locked",
            mode: provider.getMode?.() ?? "mock",
            fetchedAt: event.createdAt,
        });
    }
    return event;
}
const SCENARIO_META = {
    child_arrival: { userName: "長女", eventType: "face_unlock", method: "SESAME Face" },
    father_arrival: { userName: "父", eventType: "face_unlock", method: "SESAME Face" },
    guest_unlock: { userName: "ゲスト", eventType: "nfc_unlock", method: "SESAME NFC" },
    unknown_unlock: { userName: "不明", eventType: "unknown", method: "Unknown" },
};
export function generateMockLockEvent(scenario) {
    const meta = SCENARIO_META[scenario];
    const user = getLockUserByName(meta.userName);
    const provider = meta.eventType === "face_unlock" || meta.eventType === "nfc_unlock"
        ? "sesame"
        : getLockProvider().providerId;
    const deviceId = config.switchbot.lockDeviceId || "sesame-lock-001";
    const event = createLockEvent({
        provider,
        deviceId,
        eventType: meta.eventType,
        userId: user?.id ?? null,
        userName: meta.userName,
        success: scenario !== "unknown_unlock",
    });
    processFamilyUnlockEvent(event);
    handleSwitchBotUnlocked({
        deviceId,
        lockState: "unlocked",
        mode: getLockProvider().getMode?.() ?? "mock",
        fetchedAt: event.createdAt,
    });
    return event;
}
export function getLockProviderDashboard() {
    const provider = getLockProvider();
    const status = provider.getLockStateSync?.() ?? "unknown";
    const lastOp = provider.getLastOperation();
    const lastOpUser = provider.getLastOperator();
    return {
        provider: provider.providerId,
        lockState: status,
        battery: null,
        lastOperation: lastOp,
        lastOperator: lastOpUser,
        capabilities: {
            remoteUnlock: provider.supportsRemoteUnlock(),
            faceRecognition: provider.supportsFaceRecognition(),
            fingerprint: provider.supportsFingerprint(),
            nfc: provider.supportsNfc(),
        },
    };
}
export async function getLockProviderDashboardAsync() {
    const provider = getLockProvider();
    const status = await provider.getStatus();
    const battery = await provider.getBattery();
    const lastOp = provider.getLastOperation();
    const lastOpUser = provider.getLastOperator();
    const events = listLockEvents(10);
    const lastLock = events.find((e) => e.eventType === "lock");
    const lastUnlock = events.find((e) => e.eventType === "unlock" ||
        e.eventType === "face_unlock" ||
        e.eventType === "fingerprint_unlock" ||
        e.eventType === "nfc_unlock" ||
        e.eventType === "manual_unlock");
    return {
        provider: provider.providerId,
        lockState: status.lockState,
        battery,
        mode: status.mode ?? provider.getMode?.() ?? "mock",
        lastOperation: lastOp,
        lastOperator: lastOpUser,
        lastLocker: lastLock?.userName ?? null,
        lastUnlocker: lastUnlock?.userName ?? null,
        capabilities: {
            remoteUnlock: provider.supportsRemoteUnlock(),
            faceRecognition: provider.supportsFaceRecognition(),
            fingerprint: provider.supportsFingerprint(),
            nfc: provider.supportsNfc(),
        },
    };
}
