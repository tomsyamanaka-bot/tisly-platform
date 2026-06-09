export interface CameraDeviceRow {
    id: string;
    customer_id: string;
    site_id: string | null;
    zone_id: string | null;
    device_id: string | null;
    channel: number;
    rtsp_url: string | null;
    camera_name: string;
    camera_group: string | null;
    created_at: string;
    updated_at: string;
}
export declare function listCamerasForCustomer(customerId: string): CameraDeviceRow[];
export declare function createCamera(input: {
    customerId: string;
    siteId?: string | null;
    zoneId?: string | null;
    deviceId?: string | null;
    channel?: number;
    rtspUrl?: string | null;
    cameraName: string;
    cameraGroup?: string | null;
}): CameraDeviceRow;
export declare function getCamera(customerId: string, id: string): CameraDeviceRow | null;
export declare function updateCamera(customerId: string, id: string, patch: Partial<{
    siteId: string | null;
    zoneId: string | null;
    channel: number;
    rtspUrl: string | null;
    cameraName: string;
    cameraGroup: string | null;
}>): CameraDeviceRow | null;
export declare function deleteCamera(customerId: string, id: string): boolean;
