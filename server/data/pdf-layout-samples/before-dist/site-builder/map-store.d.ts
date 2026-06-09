export interface MapDevicePosition {
    deviceId: string;
    label: string | null;
    deviceType: string;
    siteId: string | null;
    zoneId: string | null;
    floorId: string | null;
    posX: number | null;
    posY: number | null;
    iconType: string | null;
    rotation: number | null;
    online: boolean;
    heartbeatStatus: string;
    deviceStatus: string;
}
export interface FloorMapView {
    floorId: string;
    siteId: string;
    floorName: string;
    imageUrl: string | null;
    imagePath: string | null;
    devices: MapDevicePosition[];
}
export declare function listMapDevicesForCustomer(customerId: string, tenantId?: string | null): MapDevicePosition[];
export declare function updateDeviceMapPosition(deviceRowId: string, patch: {
    posX?: number | null;
    posY?: number | null;
    iconType?: string | null;
    rotation?: number | null;
    zoneId?: string | null;
    floorId?: string | null;
    siteId?: string | null;
}): boolean;
export declare function clearDeviceMapPosition(deviceRowId: string): boolean;
export declare function getFloorMapView(floorId: string): FloorMapView | null;
export declare function assertSiteOwnedByCustomer(siteId: string, customerId: string): boolean;
