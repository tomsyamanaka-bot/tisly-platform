import { type DeviceStatus } from "./device-state.js";
export declare function getHeartbeatThresholds(): {
    warnSec: number;
    offlineSec: number;
};
export declare function recordDeviceHeartbeat(deviceId: string, platform?: string): DeviceStatus;
export declare function evaluateDeviceHeartbeatStatuses(): Array<{
    deviceId: string;
    status: DeviceStatus;
    elapsedSec: number;
}>;
export declare function startDeviceHeartbeatMonitor(onStatusChange?: (change: {
    deviceId: string;
    status: DeviceStatus;
}) => void): void;
