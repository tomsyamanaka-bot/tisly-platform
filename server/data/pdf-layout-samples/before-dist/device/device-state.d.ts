export type DeviceStatus = "UNKNOWN" | "ONLINE" | "OFFLINE" | "WARNING" | "COMMISSIONING";
export declare function normalizeDeviceStatus(raw: string | null | undefined): DeviceStatus;
export declare function statusFromHeartbeatAge(elapsedSec: number, warnSec: number, offlineSec: number): DeviceStatus;
export declare function updateDeviceStatusFields(deviceId: string, status: DeviceStatus, opts?: {
    lastHeartbeat?: string;
    lastSeen?: string;
    setFirstSeen?: boolean;
}): void;
export declare function setDeviceCommissioning(deviceId: string): void;
export declare function getDeviceStatusSummary(customerId: string): {
    total: number;
    online: number;
    warning: number;
    offline: number;
    commissioning: number;
    unknown: number;
};
