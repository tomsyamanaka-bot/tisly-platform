/** Phase901 — デバイス接続モード（mock / esp / shelly / mixed） */
export declare const DEVICE_MODES: readonly ["mock", "esp", "shelly", "mixed"];
export type DeviceMode = (typeof DEVICE_MODES)[number];
export declare function getDeviceMode(): DeviceMode;
export declare function setDeviceMode(mode: DeviceMode): DeviceMode;
export declare function deviceModeUsesMock(): boolean;
export declare function deviceModeUsesEsp(): boolean;
export declare function deviceModeUsesShelly(): boolean;
