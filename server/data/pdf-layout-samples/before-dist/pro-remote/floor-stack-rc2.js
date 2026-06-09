import { broadcast } from "../ws/hub.js";
import { getSecurityState } from "../services/securityAutomationService.js";
import { getSwitchBotBridgeWorkerState } from "../services/switchBotSecurityBridge.js";
import { getSwitchBotLockStatus, getSwitchBotMode } from "../services/switchbotService.js";
import { findAlertFloorTier, listProFloorLayers, } from "./floor-map-stack.js";
import { buildFieldMediaByTier, } from "./pro-remote-field-media.js";
function resolveCameraForPin(pin, layer) {
    if (pin.pinType === "camera" && pin.deviceId) {
        return { cameraId: pin.deviceId, label: pin.label };
    }
    const cameraPin = layer.pins.find((p) => p.pinType === "camera" && p.deviceId);
    if (cameraPin?.deviceId) {
        return { cameraId: cameraPin.deviceId, label: cameraPin.label };
    }
    const cameraDev = layer.devices.find((d) => (d.deviceType ?? "").toLowerCase().includes("camera") || (d.iconType ?? "") === "camera");
    if (cameraDev) {
        return { cameraId: cameraDev.deviceId, label: cameraDev.label ?? cameraDev.deviceId };
    }
    return { cameraId: null, label: null };
}
export function buildProRemoteFloorStackRC2(customerCode) {
    const layers = listProFloorLayers(customerCode);
    const alert = findAlertFloorTier(customerCode);
    const alertTier = alert.tier;
    const fieldMediaByTier = buildFieldMediaByTier(customerCode);
    const enriched = layers.map((layer) => ({
        ...layer,
        fieldMedia: (fieldMediaByTier[layer.tier] ?? []).slice(0, 8),
        pins: layer.pins.map((pin) => {
            const cam = resolveCameraForPin(pin, layer);
            const isAlert = alertTier === layer.tier &&
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
    const cameras = [];
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
async function resolveLockState() {
    try {
        const status = await getSwitchBotLockStatus();
        return status.lockState;
    }
    catch {
        return "unknown";
    }
}
export async function buildProRemoteFloorStackRC2Async(customerCode) {
    const layers = listProFloorLayers(customerCode);
    const alert = findAlertFloorTier(customerCode);
    const alertTier = alert.tier;
    const fieldMediaByTier = buildFieldMediaByTier(customerCode);
    const enriched = layers.map((layer) => ({
        ...layer,
        fieldMedia: (fieldMediaByTier[layer.tier] ?? []).slice(0, 8),
        pins: layer.pins.map((pin) => {
            const cam = resolveCameraForPin(pin, layer);
            const isAlert = alertTier === layer.tier &&
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
    const cameras = [];
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
function buildSecurityBadge(secState, lockState) {
    const mode = secState.mode;
    const sbMode = getSwitchBotMode();
    const armed = mode === "armed" || mode === "pending_arm";
    const label = mode === "armed"
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
function buildFloorStackWithSecurity(customerCode, enriched, alert, cameras, secState, lockState) {
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
export function focusProRemoteFloor(input) {
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
