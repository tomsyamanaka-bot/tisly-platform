export type DeviceKind = "esp32" | "rp2350" | "plc" | "tv" | "server" | "node-red" | "mqtt" | "camera" | "generic";
export type RecoveryStepAction = "warning" | "reconnect" | "notify" | "escalate" | "restart_service" | "log_only";
export interface RecoveryStep {
    order: number;
    action: RecoveryStepAction;
    delaySec: number;
    description: string;
}
export interface RecoveryRule {
    id: string;
    name: string;
    trigger: "heartbeat_lost" | "device_offline" | "mqtt_disconnect" | "manual";
    deviceKinds: DeviceKind[];
    steps: RecoveryStep[];
}
export declare const DEFAULT_HEARTBEAT_RULE: RecoveryRule;
export declare const DEVICE_RECOVERY_RULES: RecoveryRule[];
export declare function findRuleForDevice(deviceKind: string, trigger?: RecoveryRule["trigger"]): RecoveryRule | undefined;
