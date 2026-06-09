export interface ShellyBridgeConfig {
    id: string;
    deviceId: string;
    ip: string;
    name: string;
    location: string;
    enabled: boolean;
}
export interface ShellyTelemetry {
    online: boolean;
    relay: boolean;
    voltage: number;
    current: number;
    powerW: number;
    uptimeSec?: number;
    wifiRssi?: number;
    temperatureC?: number;
    fetchedAt: string;
    mock: boolean;
    connectionError?: string;
    envMode?: "mock" | "real";
}
export declare function listShellyBridgeConfigs(): ShellyBridgeConfig[];
export declare function upsertShellyBridgeConfig(input: {
    deviceId: string;
    ip: string;
    name: string;
    location?: string;
    enabled?: boolean;
}): ShellyBridgeConfig;
export declare function fetchShellyTelemetryAsync(deviceId: string): Promise<ShellyTelemetry | null>;
/** 同期 API 互換（キャッシュ / mock のみ即返却） */
export declare function fetchShellyTelemetry(deviceId: string): ShellyTelemetry | null;
export declare function getShellyConnectionSummary(): Promise<{
    envMode: "mock" | "real";
    online: boolean;
    message: string;
    telemetry: ShellyTelemetry | null;
}>;
export declare function pollShellyDevices(): Promise<Array<{
    deviceId: string;
    telemetry: ShellyTelemetry;
}>>;
