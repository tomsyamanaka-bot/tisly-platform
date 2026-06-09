/**
 * Phase902 / Phase981 — Device Registry 一覧 API
 */
import { type UnifiedDeviceView } from "./device-adapter.js";
import { getDeviceAdapterStatus } from "./device-adapter.js";
import { getShellyEnvMode } from "./shelly-real-client.js";
export interface DeviceRegistryRow {
    deviceId: string;
    name: string;
    kind: UnifiedDeviceView["kind"];
    status: UnifiedDeviceView["status"];
    lastSeen: string | null;
    customerCode: string | null;
    source: UnifiedDeviceView["source"];
    mqttTopic?: string;
    mqttTopicProduction?: string;
    shellyTelemetry?: Record<string, unknown>;
}
export declare function getDeviceRegistry(customerCode?: string): {
    phase: string;
    shellyEnvMode: ReturnType<typeof getShellyEnvMode>;
    devices: DeviceRegistryRow[];
    summary: ReturnType<typeof getDeviceAdapterStatus>;
};
