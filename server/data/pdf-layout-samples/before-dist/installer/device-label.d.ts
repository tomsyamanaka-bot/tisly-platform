export declare function getDeviceLabelData(customerId: string, deviceId: string): {
    deviceId: string;
    serial: string;
    site: string | null;
    zone: string | null;
    qrPayload: string;
    labelText: string;
    expiresAt: string;
};
