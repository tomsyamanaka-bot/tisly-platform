export declare function ensureDemoFloorMapsForAllCustomers(): {
    layers: number;
    pins: number;
};
export declare function clearDemoFloorMaps(): void;
export declare function getDemoFloorMapStatus(): Array<{
    customerCode: string;
    tiers: Array<{
        tier: string;
        pinCount: number;
    }>;
}>;
