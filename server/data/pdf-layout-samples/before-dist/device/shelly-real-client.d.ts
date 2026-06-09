export type ShellyEnvMode = "mock" | "real";
export interface ShellyStatusResult {
    mode: ShellyEnvMode;
    online: boolean;
    relay?: boolean;
    voltage?: number;
    current?: number;
    powerW?: number;
    uptimeSec?: number;
    wifiRssi?: number;
    temperatureC?: number;
    connectionError?: string;
    raw?: Record<string, unknown>;
    mock: boolean;
    baseUrl: string | null;
    fetchedAt: string;
}
export interface ShellyActionResult {
    ok: boolean;
    dryRun: boolean;
    action: "reboot" | "toggle";
    mode: ShellyEnvMode;
    mock: boolean;
    message: string;
}
export declare function getShellyEnvMode(): ShellyEnvMode;
export declare function fetchShellyDeviceStatus(baseOverride?: string): Promise<ShellyStatusResult>;
export declare function assertRealActionGuard(input: {
    confirm?: boolean;
    dryRun?: boolean;
}): {
    dryRun: boolean;
    blocked: boolean;
    reason?: string;
};
export declare function shellyReboot(input: {
    confirm?: boolean;
    dryRun?: boolean;
    baseUrl?: string;
}): Promise<ShellyActionResult>;
export declare function shellyToggle(input: {
    confirm?: boolean;
    dryRun?: boolean;
    on?: boolean;
    baseUrl?: string;
}): Promise<ShellyActionResult>;
