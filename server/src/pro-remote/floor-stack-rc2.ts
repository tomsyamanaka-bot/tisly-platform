import { broadcast } from "../ws/hub.js";
import {
  findAlertFloorTier,
  listProFloorLayers,
  type ProFloorLayerView,
  type ProMapPinView,
} from "./floor-map-stack.js";

export interface FloorStackPinRC2 extends ProMapPinView {
  cameraId: string | null;
  linkedCameraLabel: string | null;
  blink: boolean;
  constructionPhotoUrl: string | null;
}

export interface FloorStackLayerRC2 extends Omit<ProFloorLayerView, "pins"> {
  pins: FloorStackPinRC2[];
}

export interface ProRemoteFloorStackRC2 {
  phase: string;
  tiers: readonly string[];
  layers: FloorStackLayerRC2[];
  alert: ReturnType<typeof findAlertFloorTier>;
  cameras: Array<{ deviceId: string; label: string; floor: string | null }>;
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

  const enriched: FloorStackLayerRC2[] = layers.map((layer) => ({
    ...layer,
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
          ? `/uploads/install_photos/${customerCode}/${pin.deviceId}.jpg`
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

  return {
    phase: "1161-1200",
    tiers: ["perimeter", "1f", "2f"],
    layers: enriched,
    alert,
    cameras,
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
