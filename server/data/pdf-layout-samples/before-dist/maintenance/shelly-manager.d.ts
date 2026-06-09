export interface ShellyDeviceView {
    deviceId: string;
    label: string | null;
    deviceType: string;
    siteId: string | null;
    status: string;
    online: boolean;
    lastSeen: string | null;
}
export declare function listShellyDevices(customerCode: string): ShellyDeviceView[];
export declare function rebootShellyDevice(deviceId: string, actorId?: string): {
    ok: boolean;
    actionId: string;
    deviceId: string;
    note: string;
};
