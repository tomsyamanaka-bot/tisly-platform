/** Phase 61–80: 仮想現場・ゾーン定義（営業デモ用固定データ） */
export interface DemoSite {
    id: string;
    name: string;
    type: "residential" | "factory" | "warehouse" | "hotel" | "automotive";
    lat: number;
    lng: number;
    address: string;
}
export interface DemoZone {
    id: string;
    name: string;
    siteIds: string[];
}
export declare const DEMO_SITES: DemoSite[];
export declare const DEMO_ZONES: DemoZone[];
export type DemoDeviceKind = "esp32" | "rp2350" | "plc" | "camera" | "door" | "sensor" | "alarm";
export interface DemoDeviceTemplate {
    kind: DemoDeviceKind;
    suffix: string;
    labelPrefix: string;
    platform: string;
}
export declare const DEVICE_TEMPLATES: DemoDeviceTemplate[];
