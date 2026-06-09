import type { SwitchBotBridgeWorkerState, SwitchBotLockStatus } from "../security-automation/security-automation-types.js";
import { getSecurityState } from "./securityAutomationService.js";
export declare function handleSwitchBotLockStatusChanged(status: SwitchBotLockStatus): Promise<{
    handled: boolean;
    state: ReturnType<typeof getSecurityState>;
}>;
export declare function handleSwitchBotLocked(status?: SwitchBotLockStatus): import("../security-automation/security-automation-types.js").SecurityState;
export declare function handleSwitchBotUnlocked(status?: SwitchBotLockStatus): import("../security-automation/security-automation-types.js").SecurityState;
export declare function getSwitchBotBridgeWorkerState(): SwitchBotBridgeWorkerState;
export declare function pollSwitchBotAndBridge(deviceId?: string): Promise<{
    changed: boolean;
    status: SwitchBotLockStatus;
    state: ReturnType<typeof getSecurityState>;
}>;
export declare function resetSwitchBotBridgeState(): void;
