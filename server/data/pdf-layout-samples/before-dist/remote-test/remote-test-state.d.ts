import { resetSecurityDemoState } from "./security-demo-state.js";
export declare const CHANNEL_COUNT = 8;
export type ChannelState = "on" | "off";
export type RemoteTestCommand = "ch1_on" | "ch1_off" | "ch2_on" | "ch2_off" | "ch3_on" | "ch3_off" | "ch4_on" | "ch4_off" | "ch5_on" | "ch5_off" | "ch6_on" | "ch6_off" | "ch7_on" | "ch7_off" | "ch8_on" | "ch8_off";
export type ChStates = Record<string, ChannelState>;
export type InputStates = Record<string, ChannelState>;
export type RemoteTestNotificationKind = "ch" | "di" | "arm" | "disarm" | "security";
export interface RemoteTestLogEntry {
    at: string;
    action: string;
    detail?: string;
    source?: "web" | "device";
}
export interface ChStateChange {
    channel: number;
    from: ChannelState;
    to: ChannelState;
}
export interface InputStateChange {
    input: number;
    from: ChannelState;
    to: ChannelState;
}
export interface RemoteTestNotificationEntry {
    id: string;
    /** @deprecated use timestamp */
    at: string;
    timestamp: string;
    kind: RemoteTestNotificationKind;
    channel: number;
    from: ChannelState | string;
    to: ChannelState | string;
    title: string;
    body: string;
    pushSuccess: boolean;
    pushError?: string;
    eventType?: string;
}
export interface HeartbeatRecordResult {
    chChanges: ChStateChange[];
    inputChanges: InputStateChange[];
}
export interface HeartbeatDebugSnapshot {
    heartbeatMethod: string | null;
    heartbeatBody: unknown;
    lastHeartbeatAt: string | null;
}
/** RP2350 が応答しないと offline とみなす秒数（heartbeat 60 秒 + 余裕） */
export declare const DEVICE_OFFLINE_THRESHOLD_SEC = 90;
export declare function normalizeDeviceChStates(input: unknown): ChStates | null;
export declare function normalizeDeviceInputStates(input: unknown): InputStates | null;
export declare function recordHeartbeatDebug(method: string, body: unknown): void;
export declare function getHeartbeatDebugSnapshot(): HeartbeatDebugSnapshot;
export declare function getRemoteTestDebugInfo(): {
    heartbeatMethod: string | null;
    heartbeatBody: unknown;
    lastHeartbeatAt: string | null;
    confirmedChStates: {
        [x: string]: ChannelState;
    };
    confirmedInputStates: {
        [x: string]: ChannelState;
    };
    notificationHistory: RemoteTestNotificationEntry[];
    lastPushResult: {
        success: boolean;
        error?: string;
    } | null;
};
export declare function detectChStateChanges(prev: ChStates, next: ChStates): ChStateChange[];
export declare function detectInputStateChanges(prev: InputStates, next: InputStates): InputStateChange[];
export declare function isValidChannel(channel: number): boolean;
export declare function buildChCommand(channel: number, on: boolean): RemoteTestCommand;
export declare function recordWebAccess(ip: string): void;
export declare function applySimulatedInputChange(change: InputStateChange): void;
export declare function getRemoteTestStatus(): {
    pendingCommand: RemoteTestCommand | null;
    chStates: {
        [x: string]: ChannelState;
    };
    inputStates: {
        [x: string]: ChannelState;
    };
    ch1State: ChannelState;
    lastCommand: RemoteTestCommand | null;
    lastCommandAt: string | null;
    lastPollAt: string | null;
    lastNotifyAt: string | null;
    lastPushSuccessAt: string | null;
    lastPushResult: {
        success: boolean;
        error?: string;
    } | null;
    lastAccessIp: string | null;
    logs: RemoteTestLogEntry[];
    notificationHistory: RemoteTestNotificationEntry[];
};
export declare function queueChCommand(channel: number, on: boolean): void;
/** @deprecated Use queueChCommand(1, on) */
export declare function queueCh1Command(command: "ch1_on" | "ch1_off"): void;
export declare function recordDevicePoll(firmwareVersion?: string): void;
export declare function getDeviceStatus(): {
    online: boolean;
    offline: boolean;
    lastSeen: string | null;
    firmwareVersion: string | null;
    chStates: {
        [x: string]: ChannelState;
    };
    inputStates: {
        [x: string]: ChannelState;
    };
};
export declare function recordDeviceHeartbeat(firmwareVersion?: string, chStates?: ChStates, inputStates?: InputStates): HeartbeatRecordResult;
export declare function recordChStateNotification(change: ChStateChange, payload: {
    title: string;
    body: string;
}, result: {
    success: boolean;
    error?: string;
}, logId: string): void;
export declare function recordInputStateNotification(change: InputStateChange, payload: {
    title: string;
    body: string;
}, result: {
    success: boolean;
    error?: string;
}, logId: string): void;
export declare function recordSecurityNotification(entry: {
    kind: "arm" | "disarm" | "security";
    channel: number;
    from: string;
    to: string;
    title: string;
    body: string;
    eventType?: string;
}, result: {
    success: boolean;
    error?: string;
}, logId: string): void;
export declare function consumePendingCommand(_firmwareVersion?: string): RemoteTestCommand | null;
export declare function markPushResult(success: boolean, error?: string): void;
export declare function resetRemoteTestState(): void;
export { resetSecurityDemoState };
