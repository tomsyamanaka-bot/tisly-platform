import { type MapDevicePosition } from "../site-builder/map-store.js";
export declare const PRO_PIN_TYPES: readonly ["camera", "beam", "pir", "door", "window", "relay", "esp", "shelly", "speaker", "light"];
export type ProPinType = (typeof PRO_PIN_TYPES)[number];
export declare const PRO_FLOOR_TIERS: readonly ["perimeter", "1f", "2f"];
export interface ProFloorLayerView {
    layerId: string;
    tier: string;
    displayName: string;
    sortOrder: number;
    floorId: string | null;
    imageUrl: string | null;
    imageKind: string;
    pins: ProMapPinView[];
    devices: MapDevicePosition[];
}
export interface ProMapPinView {
    id: string;
    pinType: string;
    label: string | null;
    posX: number;
    posY: number;
    deviceId: string | null;
    status: "ONLINE" | "WARNING" | "OFFLINE";
}
export declare function isValidProPinType(t: string): t is ProPinType;
/** Resolve DB image_path to a browser-loadable URL (assets vs uploads). */
export declare function resolveProFloorImageUrl(imagePath: string): string;
/** Idempotent demo seed — run after customer/site seed. */
export declare function ensureProFloorLayersSeed(): void;
export declare function listProFloorLayers(customerCode: string): ProFloorLayerView[];
export declare function placeProMapPin(input: {
    layerId: string;
    pinType: string;
    posX: number;
    posY: number;
    label?: string;
    deviceId?: string;
}): ProMapPinView;
export declare function deleteProMapPin(pinId: string): boolean;
export declare function moveProMapPin(pinId: string, posX: number, posY: number): ProMapPinView | null;
export declare function updateProFloorLayerDisplayName(layerId: string, displayName: string): boolean;
export declare function findAlertFloorTier(customerCode: string): {
    tier: string | null;
    layerId: string | null;
    reason: string;
};
