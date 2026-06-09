/** Phase901 — デバイス接続モード（mock / esp / shelly / mixed） */
export const DEVICE_MODES = ["mock", "esp", "shelly", "mixed"];
let currentMode = "mock";
export function getDeviceMode() {
    const env = process.env.TISLY_DEVICE_MODE?.toLowerCase();
    if (env && DEVICE_MODES.includes(env)) {
        return env;
    }
    return currentMode;
}
export function setDeviceMode(mode) {
    if (!DEVICE_MODES.includes(mode)) {
        throw new Error(`Invalid device mode: ${mode}`);
    }
    currentMode = mode;
    process.env.TISLY_DEVICE_MODE = mode;
    return currentMode;
}
export function deviceModeUsesMock() {
    const m = getDeviceMode();
    return m === "mock" || m === "mixed";
}
export function deviceModeUsesEsp() {
    const m = getDeviceMode();
    return m === "esp" || m === "mixed";
}
export function deviceModeUsesShelly() {
    const m = getDeviceMode();
    return m === "shelly" || m === "mixed";
}
