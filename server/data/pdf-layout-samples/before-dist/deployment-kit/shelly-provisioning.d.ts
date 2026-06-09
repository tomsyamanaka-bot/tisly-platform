import { type ShellyStatusResult } from "../device/shelly-real-client.js";
export interface ShellyRegisterInput {
    customerCode: string;
    siteId: string;
    name: string;
    location: string;
    deviceId?: string;
    baseUrl?: string;
}
export interface ShellyRegisterResult {
    ok: boolean;
    mode: "mock" | "real";
    device: {
        deviceId: string;
        assetId: string;
        name: string;
        location: string;
        siteId: string;
        customerCode: string;
        qrDataUrl: string;
    };
    shellyStatus: ShellyStatusResult;
}
export declare function getShellyProvisioningStatus(): {
    phase: string;
    mode: "mock" | "real";
    baseUrlConfigured: boolean;
    authConfigured: boolean;
};
export declare function registerShellyDevice(input: ShellyRegisterInput): Promise<ShellyRegisterResult>;
export declare function testShellyConnection(input?: {
    baseUrl?: string;
    deviceId?: string;
    customerCode?: string;
}): Promise<ShellyStatusResult & {
    ok: boolean;
    deviceId?: string;
}>;
export declare function rebootShellyDevice(input: {
    confirm?: boolean;
    dryRun?: boolean;
    baseUrl?: string;
}): Promise<import("../device/shelly-real-client.js").ShellyActionResult>;
