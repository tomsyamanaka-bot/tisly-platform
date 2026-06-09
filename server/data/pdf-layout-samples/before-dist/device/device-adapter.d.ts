import { type DeviceMode } from "./device-mode-store.js";
import { listShellyBridgeConfigs } from "./shelly-bridge.js";
export type DeviceKind = "ESP" | "Shelly" | "Camera" | "PLC" | "Other";
export interface UnifiedDeviceView {
    deviceId: string;
    name: string;
    kind: DeviceKind;
    status: "ONLINE" | "OFFLINE" | "WARNING";
    lastSeen: string | null;
    customerCode: string | null;
    source: "mock" | "esp" | "shelly" | "db";
    telemetry?: Record<string, unknown>;
}
export declare function listUnifiedDevices(customerCode?: string): UnifiedDeviceView[];
export declare function getDeviceAdapterStatus(): {
    deviceMode: DeviceMode;
    usesMock: boolean;
    usesEsp: boolean;
    usesShelly: boolean;
    deviceCount: number;
    onlineCount: number;
    warningCount: number;
    offlineCount: number;
    shellyConfigs: ReturnType<typeof listShellyBridgeConfigs>;
};
/** 共通 ingest — ESP heartbeat 等 */
export declare function ingestDeviceSignal(deviceId: string, platform?: string, payload?: Record<string, unknown>): {
    status: string;
    mode: DeviceMode;
};
