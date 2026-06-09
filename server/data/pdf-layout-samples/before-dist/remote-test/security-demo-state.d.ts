export interface InputStateChange {
    input: number;
    from: "on" | "off";
    to: "on" | "off";
}
export type SecurityMode = "ARM" | "DISARM";
export interface SecurityEventEntry {
    id: string;
    timestamp: string;
    type: string;
    device: string;
    input: string;
    state: string;
}
export declare function setSecurityDemoStatePathForTests(filePath: string | null): void;
export declare function getSecurityMode(): SecurityMode;
export declare function isArmed(): boolean;
export declare function getSecurityDemoStatus(): {
    securityMode: SecurityMode;
    armed: boolean;
    deviceName: string;
    deviceId: string;
    lastArmAt: string | null;
    lastDisarmAt: string | null;
    eventHistory: SecurityEventEntry[];
    eventHistoryDisplay: SecurityEventEntry[];
};
export declare function setSecurityMode(mode: SecurityMode): {
    mode: SecurityMode;
    changed: boolean;
};
export declare function recordInputSecurityEvent(change: InputStateChange): SecurityEventEntry;
export declare function resetSecurityDemoState(): void;
export declare function reloadSecurityDemoStateFromDisk(): void;
