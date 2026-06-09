import type Database from "better-sqlite3";
import type { UnifiedEvent } from "../event/unified-event.js";
import { type DemoDeviceKind } from "./demo-sites.js";
export interface DemoVirtualDevice {
    deviceId: string;
    siteId: string;
    siteName: string;
    kind: DemoDeviceKind;
    label: string;
    zone: string;
    platform: string;
}
export declare function getVirtualDevices(): DemoVirtualDevice[];
export declare function buildVirtualDevices(): DemoVirtualDevice[];
export declare function seedDemoDevices(db?: Database.Database): number;
export declare function pickRandomDevice(): DemoVirtualDevice;
export declare function createRandomUnifiedEvent(): UnifiedEvent;
export declare function emitDemoEvent(unified?: UnifiedEvent): Promise<string>;
export declare function getDemoMapMarkers(): {
    siteId: string;
    name: string;
    type: "factory" | "warehouse" | "residential" | "automotive" | "hotel";
    lat: number;
    lng: number;
    address: string;
    deviceCount: number;
    status: string;
}[];
