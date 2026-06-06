import { broadcast } from "../ws/hub.js";
import { getSecurityState } from "../services/securityAutomationService.js";
import { getSwitchBotBridgeWorkerState } from "../services/switchBotSecurityBridge.js";
import { getSwitchBotLockStatus, getSwitchBotMode } from "../services/switchbotService.js";
import {
  findAlertFloorTier,
  listProFloorLayers,
  type ProFloorLayerView,
  type ProMapPinView,
} from "./floor-map-stack.js";
import {
  buildFieldMediaByTier,
  type ProRemoteFieldMediaItem,
} from "./pro-remote-field-media.js";

export interface FloorStackPinRC2 extends ProMapPinView {
  cameraId: string | null;
  linkedCameraLabel: string | null;
  blink: boolean;
  constructionPhotoUrl: string | null;
}

export interface FloorStackLayerRC2 extends Omit<ProFloorLayerView, "pins"> {
  pins: FloorStackPinRC2[];
  fieldMedia: ProRemoteFieldMediaItem[];
}

export interface ProRemoteSecurityBadge {
  mode: string;
  lockState: string;
  switchbotMode: string;
  label: string;
  armed: boolean;
}

export interface ProRemoteFloorStackRC2 {
  phase: string;
  tiers: readonly string[];
  layers: FloorStackLayerRC2[];
  alert: ReturnType<typeof findAlertFloorTier>;
  cameras: Array<{ deviceId: string; label: string; floor: string | null }>;
  security: ProRemoteSecurityBadge;
}

function resolveCameraForPin(
  pin: ProMapPinView,
  layer: ProFloorLayerView
): { cameraId: string | null; label: string | null } {
  if (pin.pinType === "camera" && pin.deviceId) {
    return { cameraId: pin.deviceId, label: pin.label };
  }
  const cameraPin = layer.pins.find((p) => p.pinType === "camera" && p.deviceId);
  if (cameraPin?.deviceId) {
    return { cameraId: cameraPin.deviceId, label: cameraPin.label };
  }
  const cameraDev = layer.devices.find(
    (d) => (d.deviceType ?? "").toLowerCase().includes("camera") || (d.iconType ?? "") === "camera"
  );
  if (cameraDev) {
    return { cameraId: cameraDev.deviceId, label: cameraDev.label ?? cameraDev.deviceId };
  }
  return { cameraId: null, label: null };
}

export function buildProRemoteFloorStackRC2(customerCode: string): ProRemoteFloorStackRC2 {
  const layers = listProFloorLayers(customerCode);
  const alert = findAlertFloorTier(customerCode);
  const alertTier = alert.tier;
  const fieldMediaByTier = buildFieldMediaByTier(customerCode);

  const enriched: FloorStackLayerRC2[] = layers.map((layer) => ({
    ...layer,
    fieldMedia: (fieldMediaByTier[layer.tier] ?? []).slice(0, 8),
    pins: layer.pins.map((pin) => {
      const cam = resolveCameraForPin(pin, layer);
      const isAlert =
        alertTier === layer.tier &&
        (pin.status === "OFFLINE" || pin.status === "WARNING");
      return {
        ...pin,
        cameraId: cam.cameraId,
        linkedCameraLabel: cam.label,
        blink: isAlert,
        constructionPhotoUrl: pin.deviceId
          ? `/customer-files/${customerCode}/install/${pin.deviceId}.jpg`
          : null,
      };
    }),
  }));

  const cameras: ProRemoteFloorStackRC2["cameras"] = [];
  for (const layer of enriched) {
    for (const pin of layer.pins) {
      if (pin.pinType === "camera" && pin.deviceId) {
        cameras.push({
          deviceId: pin.deviceId,
          label: pin.label ?? pin.deviceId,
          floor: layer.tier,
        });
      }
    }
  }

  const secState = getSecurityState();
  const worker = getSwitchBotBridgeWorkerState();
  const lockState = worker.lastLockState ?? "unknown";

  return buildFloorStackWithSecurity(customerCode, enriched, alert, cameras, secState, lockState);
}

async function resolveLockState(): Promise<string> {
  try {
    const status = await getSwitchBotLockStatus();
    return status.lockState;
  } catch {
    return "unknown";
  }
}

export async function buildProRemoteFloorStackRC2Async(
  customerCode: string
): Promise<ProRemoteFloorStackRC2> {
  const layers = listProFloorLayers(customerCode);
  const alert = findAlertFloorTier(customerCode);
  const alertTier = alert.tier;
  const fieldMediaByTier = buildFieldMediaByTier(customerCode);
  const enriched: FloorStackLayerRC2[] = layers.map((layer) => ({
    ...layer,
    fieldMedia: (fieldMediaByTier[layer.tier] ?? []).slice(0, 8),
    pins: layer.pins.map((pin) => {
      const cam = resolveCameraForPin(pin, layer);
      const isAlert =
        alertTier === layer.tier &&
        (pin.status === "OFFLINE" || pin.status === "WARNING");
      return {
        ...pin,
        cameraId: cam.cameraId,
        linkedCameraLabel: cam.label,
        blink: isAlert,
        constructionPhotoUrl: pin.deviceId
          ? `/customer-files/${customerCode}/install/${pin.deviceId}.jpg`
          : null,
      };
    }),
  }));
  const cameras: ProRemoteFloorStackRC2["cameras"] = [];
  for (const layer of enriched) {
    for (const pin of layer.pins) {
      if (pin.pinType === "camera" && pin.deviceId) {
        cameras.push({
          deviceId: pin.deviceId,
          label: pin.label ?? pin.deviceId,
          floor: layer.tier,
        });
      }
    }
  }
  const secState = getSecurityState();
  const lockState = await resolveLockState();
  return buildFloorStackWithSecurity(customerCode, enriched, alert, cameras, secState, lockState);
}

function buildSecurityBadge(
  secState: ReturnType<typeof getSecurityState>,
  lockState: string
): ProRemoteSecurityBadge {
  const mode = secState.mode;
  const sbMode = getSwitchBotMode();
  const armed = mode === "armed" || mode === "pending_arm";
  const label =
    mode === "armed"
      ? "警戒ON"
      : mode === "pending_arm"
        ? "警戒準備中"
        : mode === "pending_disarm"
          ? "解除準備中"
          : "警戒OFF";
  return {
    mode,
    lockState,
    switchbotMode: sbMode,
    label,
    armed,
  };
}

function buildFloorStackWithSecurity(
  customerCode: string,
  enriched: FloorStackLayerRC2[],
  alert: ReturnType<typeof findAlertFloorTier>,
  cameras: ProRemoteFloorStackRC2["cameras"],
  secState: ReturnType<typeof getSecurityState>,
  lockState: string
): ProRemoteFloorStackRC2 {
  void customerCode;
  return {
    phase: "1161-1200",
    tiers: ["perimeter", "1f", "2f"],
    layers: enriched,
    alert,
    cameras,
    security: buildSecurityBadge(secState, lockState),
  };
}

export function focusProRemoteFloor(input: {
  customerCode: string;
  floor?: string;
  tier?: string;
  pinId?: string;
  cameraId?: string;
  trigger?: string;
}): {
  ok: boolean;
  floor: string;
  cameraId: string | null;
  pinId: string | null;
} {
  const floor = input.floor ?? input.tier ?? "1f";
  const stack = buildProRemoteFloorStackRC2(input.customerCode);
  let cameraId = input.cameraId ?? null;
  let pinId = input.pinId ?? null;

  if (!cameraId && pinId) {
    for (const layer of stack.layers) {
      const pin = layer.pins.find((p) => p.id === pinId);
      if (pin?.cameraId) {
        cameraId = pin.cameraId;
        break;
      }
    }
  }

  broadcast({
    type: "event",
    payload: {
      event: "pro_remote_focus",
      customerCode: input.customerCode,
      floor,
      pinId,
      cameraId,
      trigger: input.trigger ?? "sensor",
      autoScroll: true,
      blinkPin: pinId,
    },
    at: new Date().toISOString(),
  });

  if (cameraId) {
    broadcast({
      type: "camera_focus",
      payload: {
        event: "camera_focus",
        customerCode: input.customerCode,
        cameraId,
        floor,
        trigger: input.trigger ?? "pro_remote",
        durationSec: 10,
      },
      at: new Date().toISOString(),
    });
  }

  return { ok: true, floor, cameraId, pinId };
}
