export declare function seedDemoModeVirtualEsp(customerId: string, siteId: string): void;
export declare function startDemoModeVirtualEspRunner(): void;
export declare function stopDemoModeVirtualEspRunner(): void;
export declare function emitSimulatorEvent(customerCode: string, scenario: string, deviceId?: string): {
    ok: boolean;
    deviceId: string;
    eventType: string;
};
