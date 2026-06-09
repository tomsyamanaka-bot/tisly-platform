import { type RecoveryRule } from "./recovery-rules.js";
export interface RecoveryRunResult {
    runId: string;
    ruleId: string;
    deviceId: string;
    status: "started" | "completed" | "failed";
    stepsExecuted: number;
    message: string;
}
export declare function runDeviceRecovery(deviceId: string, trigger?: RecoveryRule["trigger"]): Promise<RecoveryRunResult>;
