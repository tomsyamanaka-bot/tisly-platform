/** Phase901 — デバイス接続モード（mock / esp / shelly / mixed） */

export const DEVICE_MODES = ["mock", "esp", "shelly", "mixed"] as const;
export type DeviceMode = (typeof DEVICE_MODES)[number];

let currentMode: DeviceMode = "mock";

export function getDeviceMode(): DeviceMode {
  const env = process.env.TISLY_DEVICE_MODE?.toLowerCase();
  if (env && DEVICE_MODES.includes(env as DeviceMode)) {
    return env as DeviceMode;
  }
  return currentMode;
}

export function setDeviceMode(mode: DeviceMode): DeviceMode {
  if (!DEVICE_MODES.includes(mode)) {
    throw new Error(`Invalid device mode: ${mode}`);
  }
  currentMode = mode;
  process.env.TISLY_DEVICE_MODE = mode;
  return currentMode;
}

export function deviceModeUsesMock(): boolean {
  const m = getDeviceMode();
  return m === "mock" || m === "mixed";
}

export function deviceModeUsesEsp(): boolean {
  const m = getDeviceMode();
  return m === "esp" || m === "mixed";
}

export function deviceModeUsesShelly(): boolean {
  const m = getDeviceMode();
  return m === "shelly" || m === "mixed";
}
