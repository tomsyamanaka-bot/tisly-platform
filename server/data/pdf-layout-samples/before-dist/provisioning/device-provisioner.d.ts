export interface ProvisionDeviceInput {
    siteId: string;
    zoneId?: string;
    deviceType?: string;
    platform?: string;
    label?: string;
    tenantId?: string;
    actorId?: string;
    actorLabel?: string;
}
export interface ProvisionedDeviceResult {
    id: string;
    deviceId: string;
    secret: string;
    siteId: string;
    zoneId: string | null;
    tenantId: string;
    registrationUrl: string;
    qrPayload: string;
}
export declare function provisionDevice(input: ProvisionDeviceInput): ProvisionedDeviceResult;
export declare function buildQrSvg(data: string): string;
export declare function getDeviceQr(deviceId: string): {
    deviceId: string;
    label: string;
    siteId: string;
    qrPayload: string;
    qrSvg: string;
    qrDataUrl: string;
    registrationUrl: string;
};
