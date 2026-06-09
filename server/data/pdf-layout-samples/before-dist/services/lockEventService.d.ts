import { listLockEvents, listFaceLockEvents } from "../lock-provider/lock-provider-store.js";
import type { LockProviderId } from "../providers/lock/types.js";
import type { LockEvent, LockEventType } from "../providers/lock/types.js";
export { listLockEvents, listFaceLockEvents };
export declare function recordLockProviderEvent(input: {
    eventType: LockEventType;
    userId?: string | null;
    userName?: string | null;
    deviceId?: string;
    success?: boolean;
}): LockEvent;
export type MockLockScenario = "child_arrival" | "father_arrival" | "guest_unlock" | "unknown_unlock";
export declare function generateMockLockEvent(scenario: MockLockScenario): LockEvent;
export declare function getLockProviderDashboard(): {
    provider: LockProviderId;
    lockState: import("../providers/lock/types.js").LockState;
    battery: number | null;
    lastOperation: import("../providers/lock/types.js").LockLastOperation | null;
    lastOperator: import("../providers/lock/types.js").LockOperator | null;
    capabilities: {
        remoteUnlock: boolean;
        faceRecognition: boolean;
        fingerprint: boolean;
        nfc: boolean;
    };
};
export declare function getLockProviderDashboardAsync(): Promise<{
    provider: LockProviderId;
    lockState: import("../providers/lock/types.js").LockState;
    battery: number | null;
    mode: "mock" | "real" | "dryRun";
    lastOperation: import("../providers/lock/types.js").LockLastOperation | null;
    lastOperator: import("../providers/lock/types.js").LockOperator | null;
    lastLocker: string | null;
    lastUnlocker: string | null;
    capabilities: {
        remoteUnlock: boolean;
        faceRecognition: boolean;
        fingerprint: boolean;
        nfc: boolean;
    };
}>;
