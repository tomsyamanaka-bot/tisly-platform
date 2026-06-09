export interface SwitchBotWorkerTickResult {
    polled: boolean;
    changed: boolean;
    lockState: string;
    error: string | null;
}
export declare function runSwitchBotBridgeWorkerTick(): Promise<SwitchBotWorkerTickResult>;
export declare function startSwitchBotBridgeWorker(): void;
export declare function stopSwitchBotBridgeWorker(): void;
