export type RecoveryActionType = "restart_device" | "restart_mqtt" | "restart_node_red" | "escalate";
export interface RecoveryActionInput {
    action: RecoveryActionType;
    deviceId?: string;
    siteId?: string;
    reason?: string;
    actorId?: string;
}
export declare function executeRecoveryAction(input: RecoveryActionInput): Promise<{
    ok: boolean;
    actionId: any;
    action: "restart_device";
    deviceId: string;
    topicHint: string;
    note?: undefined;
    reconnectHint?: undefined;
    ingestUrl?: undefined;
    recovery?: undefined;
} | {
    ok: boolean;
    actionId: any;
    action: "restart_mqtt";
    note: string;
    reconnectHint: string;
    deviceId?: undefined;
    topicHint?: undefined;
    ingestUrl?: undefined;
    recovery?: undefined;
} | {
    ok: boolean;
    actionId: any;
    action: "restart_node_red";
    note: string;
    ingestUrl: string;
    deviceId?: undefined;
    topicHint?: undefined;
    reconnectHint?: undefined;
    recovery?: undefined;
} | {
    ok: boolean;
    actionId: any;
    action: "escalate";
    recovery: import("./device-recovery.js").RecoveryRunResult;
    deviceId?: undefined;
    topicHint?: undefined;
    note?: undefined;
    reconnectHint?: undefined;
    ingestUrl?: undefined;
}>;
