import { findAlertFloorTier, type ProFloorLayerView, type ProMapPinView } from "./floor-map-stack.js";
import { type ProRemoteFieldMediaItem } from "./pro-remote-field-media.js";
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
    cameras: Array<{
        deviceId: string;
        label: string;
        floor: string | null;
    }>;
    security: ProRemoteSecurityBadge;
}
export declare function buildProRemoteFloorStackRC2(customerCode: string): ProRemoteFloorStackRC2;
export declare function buildProRemoteFloorStackRC2Async(customerCode: string): Promise<ProRemoteFloorStackRC2>;
export declare function focusProRemoteFloor(input: {
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
};
