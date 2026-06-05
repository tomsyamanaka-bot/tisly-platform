/**
 * Phase 1321–1340 — Registered device presence for security automation
 */
import {
  getRegisteredDevices,
  updateDevicePresenceInStore,
  upsertPresenceDevice,
} from "../security-automation/security-automation-store.js";
import type {
  PresenceStatus,
  PresenceSummary,
  RegisteredPresenceDevice,
} from "../security-automation/security-automation-types.js";

export { getRegisteredDevices };

export function updateDevicePresence(
  deviceId: string,
  status: PresenceStatus
): RegisteredPresenceDevice | null {
  return updateDevicePresenceInStore(deviceId, status);
}

export function registerPresenceDevice(
  input: Partial<RegisteredPresenceDevice> & {
    name: string;
    type: RegisteredPresenceDevice["type"];
  }
): RegisteredPresenceDevice {
  return upsertPresenceDevice(input);
}

export function areAllRegisteredDevicesAway(): boolean {
  const devices = getRegisteredDevices().filter((d) => d.enabled);
  if (devices.length === 0) return true;
  return devices.every((d) => d.presenceStatus === "away");
}

export function isAnyRegisteredDeviceHome(): boolean {
  return getRegisteredDevices()
    .filter((d) => d.enabled)
    .some((d) => d.presenceStatus === "home");
}

export function getPresenceSummary(): PresenceSummary {
  const devices = getRegisteredDevices();
  const enabled = devices.filter((d) => d.enabled);
  const home = enabled.filter((d) => d.presenceStatus === "home").length;
  const away = enabled.filter((d) => d.presenceStatus === "away").length;
  const unknown = enabled.filter((d) => d.presenceStatus === "unknown").length;
  return {
    total: devices.length,
    enabled: enabled.length,
    home,
    away,
    unknown,
    allAway: enabled.length > 0 && home === 0 && unknown === 0,
    anyHome: home > 0,
  };
}

/** unknown 端末をポリシーに従って評価 */
export function evaluatePresenceForAutoArm(
  policy: "block_auto_arm" | "unknown_as_away" | "unknown_as_home"
): { canArm: boolean; reason?: string } {
  const devices = getRegisteredDevices().filter((d) => d.enabled);
  if (devices.length === 0) {
    return { canArm: true };
  }
  const hasHome = devices.some((d) => d.presenceStatus === "home");
  if (hasHome) {
    return { canArm: false, reason: "Auto arm blocked: device home" };
  }
  const hasUnknown = devices.some((d) => d.presenceStatus === "unknown");
  if (hasUnknown) {
    if (policy === "block_auto_arm") {
      return { canArm: false, reason: "Auto arm blocked: unknown device" };
    }
    if (policy === "unknown_as_home") {
      return { canArm: false, reason: "Auto arm blocked: unknown device (treated as home)" };
    }
  }
  const allAway = devices.every(
    (d) =>
      d.presenceStatus === "away" ||
      (d.presenceStatus === "unknown" && policy === "unknown_as_away")
  );
  if (!allAway) {
    return { canArm: false, reason: "Auto arm blocked: not all away" };
  }
  return { canArm: true };
}
